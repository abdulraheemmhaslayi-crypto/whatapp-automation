"""SPEC §11.2 — the action node and the verbs it can run.

    Config: actions[] executed in order: add_tag(tag), remove_tag,
    set_field(field, value|placeholder), clear_field, subscribe_sequence(sequence),
    unsubscribe_sequence, open_conversation, close_conversation,
    assign_conversation(member), notify_members(member_ids, via, text).
    Handles: default. Always Continue.

"Always Continue" is the load-bearing half of that sentence. An action node is a
list of side effects, and one of them failing — a tag whose name no longer
exists, a member who has left the workspace — must not end the run. Each verb is
attempted, problems are logged, and the node continues. The failures that *are*
worth stopping for are the ones a node cannot even attempt, and those raise
rather than returning ``Fail``, so the queue's transaction rolls the whole step
back and retries it (see :mod:`apps.flows.engine.runner`).

**Two addressing conventions, both taken from the schema.** ``tag`` and ``field``
are 200-character strings and hold *names*; ``member``, ``sequence`` and
``flow_id`` are 64-character strings and hold *ids*. That is not a coincidence in
``apps/flows/schema/nodes.py`` — it matches what ``apps/flows/picklists.py``
hands the builder, and it matches SPEC §9.2's "custom fields by name" for the
renderer. A tag renamed in the CRM therefore breaks a flow that adds it, which is
the trade ManyChat makes too and the one the schema already chose.

**Field resolution and coercion are not here** either. ``set_field`` shares
:mod:`apps.flows.engine.fields` with the External Request node (L4-E), which
writes custom fields from JSON responses rather than from rendered text; the two
directions meet at ``coerce_value`` and the adaptation belongs in one place.

**Sequence verbs are not here.** ``subscribe_sequence`` and
``unsubscribe_sequence`` have schemas (so the builder can offer them today) and
no runtime until L6-A registers one. Reaching one logs a warning and moves on,
which is what "unknown verb in a graph → validation error at publish, warning log
at runtime" means: the *schema* registry is what rejects a verb nobody has ever
declared, at publish time; this is the other case, a declared verb whose owner
has not landed.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any
from uuid import UUID

import httpx
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from apps.contacts.errors import ContactsError
from apps.contacts.models import CustomField, Tag
from apps.contacts.services import (
    add_tag,
    clear_field_value,
    get_or_create_tag,
    remove_tag,
    set_field_value,
)
from apps.flows import messaging
from apps.flows.engine.context import NodeContext
from apps.flows.engine.fields import custom_field_by_name, typed_for
from apps.flows.engine.nodes.base import Node
from apps.flows.engine.registry import register_node, register_verb, verb_handler
from apps.flows.engine.results import Continue, StepResult
from apps.flows.notifications import event_for_via

__all__ = ["ActionNode"]

logger = logging.getLogger(__name__)


@register_node
class ActionNode(Node):
    """Runs its verbs in order and always continues."""

    type = "action"
    synchronous_safe = True

    def execute(self, ctx: NodeContext) -> StepResult:
        steps = ctx.config.get("actions") or []
        for step in steps:
            if not isinstance(step, dict):
                continue
            verb = step.get("verb")
            if not isinstance(verb, str):
                continue
            handler = verb_handler(verb)
            if handler is None:
                logger.warning(
                    "Execution %s: action node %s names verb %r, which has no runtime in this deployment; skipping it.",
                    ctx.execution.pk,
                    ctx.node_id,
                    verb,
                )
                continue
            try:
                handler(ctx, step)
            except (ContactsError, messaging.FacadeUnavailableError, LookupError, ValueError) as exc:
                # Diagnosable and specific to this verb: a mistyped value, a
                # deleted object, messaging not installed. The other verbs in
                # the list still deserve to run.
                logger.warning(
                    "Execution %s: action node %s verb %r failed: %s",
                    ctx.execution.pk,
                    ctx.node_id,
                    verb,
                    exc,
                )
        return Continue("default")


# ---------------------------------------------------------------------------
# Built-in verbs (SPEC §11.2)
# ---------------------------------------------------------------------------


def _add_tag(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Tag the contact, creating the tag if the workspace has not got it.

    Create-on-use rather than refuse-if-missing: a flow is often the thing that
    introduces a tag, and an author who typed a new name in the builder means to
    start using it. ``get_or_create_tag`` is case-insensitive, so this cannot
    fork "Lead" and "lead" into two tags.
    """
    name = _text(step.get("tag"))
    if not name:
        raise ValueError("add_tag needs a tag name.")
    tag, created = get_or_create_tag(ctx.workspace, name)
    if created:
        logger.info("Execution %s created tag %r", ctx.execution.pk, tag.name)
    add_tag(ctx.contact, tag)


def _remove_tag(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Untag the contact. A tag the workspace does not have is already removed."""
    name = _text(step.get("tag"))
    if not name:
        raise ValueError("remove_tag needs a tag name.")
    tag = Tag.objects.for_workspace(ctx.workspace_id).filter(name__iexact=name).first()
    if tag is None:
        logger.debug("Execution %s: no tag named %r to remove.", ctx.execution.pk, name)
        return
    remove_tag(ctx.contact, tag)


def _set_field(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Write a custom field, rendering ``{{placeholders}}`` in the value first."""
    field = custom_field_by_name(ctx, step.get("field"))
    if field is None:
        return
    rendered = ctx.render(step.get("value"))
    set_field_value(ctx.contact, field, typed_for(field, rendered))


def _clear_field(ctx: NodeContext, step: dict[str, Any]) -> None:
    field = custom_field_by_name(ctx, step.get("field"))
    if field is None:
        return
    clear_field_value(ctx.contact, field)


def _open_conversation(ctx: NodeContext, _step: dict[str, Any]) -> None:
    messaging.open_conversation(ctx.contact, ctx.connection)


def _close_conversation(ctx: NodeContext, _step: dict[str, Any]) -> None:
    messaging.close_conversation(ctx.contact, ctx.connection)


def _assign_conversation(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Hand the conversation to a member — of *this* workspace, checked.

    The member id comes out of a graph document, and a graph document is
    editable by anyone with ``edit_flows``. Resolving it through this
    workspace's memberships rather than through ``User.objects.get`` is what
    stops a hand-edited flow from assigning conversations to somebody in another
    tenant (SECURITY-BASELINE §1).
    """
    user = _member(ctx, step.get("member"))
    if user is None:
        return
    messaging.assign_conversation(ctx.contact, user, ctx.connection)


def _notify_members(ctx: NodeContext, step: dict[str, Any]) -> None:
    """In-app (and optionally emailed) alert to named members.

    ``via`` picks between two registered events rather than a flag on the send;
    see :mod:`apps.flows.notifications` for why that is the shape.
    """
    from apps.notifications.engine import notify

    raw_ids = step.get("member_ids")
    users = [user for user in (_member(ctx, value) for value in raw_ids or []) if user is not None]
    if not users:
        logger.warning("Execution %s: notify_members named nobody in this workspace.", ctx.execution.pk)
        return
    notify(
        ctx.workspace,
        event_for_via(str(step.get("via") or "in_app")),
        users=users,
        context={
            # "{actor_name} mentioned you" — the actor is the automation, which
            # is the honest answer and the one an admin can act on.
            "actor_name": ctx.execution.flow.name,
            "message": ctx.render(step.get("text")),
        },
    )


def _resolve_or_create_custom_field(ctx: NodeContext, name: Any, field_type: str = "text") -> Any | None:
    """Find a custom field by name in workspace, or auto-create it if missing."""
    cleaned = _text(name)
    if not cleaned:
        return None
    field = CustomField.objects.for_workspace(ctx.workspace_id).filter(name__iexact=cleaned).first()
    if field is not None:
        return field
    try:
        from apps.contacts.services import create_custom_field

        return create_custom_field(ctx.workspace, name=cleaned, field_type=field_type)
    except Exception as exc:
        logger.warning("Execution %s: could not auto-create custom field %r: %s", ctx.execution.pk, cleaned, exc)
        return None


def _ai_generate_reply(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Invoke AI (Gemini, OpenAI, Groq, Ollama) to answer customer queries dynamically."""
    prompt_tpl = step.get("prompt") or ""
    rendered_prompt = ctx.render(prompt_tpl)
    if not rendered_prompt.strip():
        logger.warning("Execution %s: ai_generate_reply has empty prompt.", ctx.execution.pk)
        return

    system_prompt = ctx.render(step.get("system_prompt") or "")
    provider = str(step.get("provider") or "gemini").lower()
    target_field_name = step.get("target_field")
    field = _resolve_or_create_custom_field(ctx, target_field_name, field_type="text")
    if field is None:
        return

    model_override = step.get("model") or ""
    api_key = step.get("api_key") or getattr(settings, "GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")

    reply_text = ""
    try:
        if provider == "gemini":
            model = model_override or "gemini-1.5-flash"
            if api_key:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                body: dict[str, Any] = {
                    "contents": [{"parts": [{"text": rendered_prompt}]}],
                }
                if system_prompt:
                    body["systemInstruction"] = {"parts": [{"text": system_prompt}]}
                with httpx.Client(timeout=20.0) as client:
                    resp = client.post(url, json=body)
                    if resp.is_success:
                        data = resp.json()
                        candidates = data.get("candidates") or []
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                reply_text = parts[0].get("text", "").strip()
                    else:
                        logger.warning("Execution %s: Gemini API error %s: %s", ctx.execution.pk, resp.status_code, resp.text)
            if not reply_text:
                reply_text = f"Thank you for reaching out! We received: '{rendered_prompt[:60]}...' and will assist you shortly."
        elif provider in ("openai", "groq"):
            is_groq = provider == "groq"
            key = api_key or (os.environ.get("GROQ_API_KEY" if is_groq else "OPENAI_API_KEY", ""))
            url = "https://api.groq.com/openai/v1/chat/completions" if is_groq else "https://api.openai.com/v1/chat/completions"
            model = model_override or ("llama-3.1-8b-instant" if is_groq else "gpt-4o-mini")
            if key:
                messages = []
                if system_prompt:
                    messages.append({"role": "system", "content": system_prompt})
                messages.append({"role": "user", "content": rendered_prompt})
                with httpx.Client(timeout=20.0) as client:
                    resp = client.post(url, headers={"Authorization": f"Bearer {key}"}, json={"model": model, "messages": messages})
                    if resp.is_success:
                        reply_text = resp.json()["choices"][0]["message"]["content"].strip()
                    else:
                        logger.warning("Execution %s: %s API error: %s", ctx.execution.pk, provider, resp.text)
            if not reply_text:
                reply_text = f"Thank you for contacting us! We received your message: '{rendered_prompt[:60]}...' and a team member will follow up shortly."
        elif provider == "ollama":
            url = "http://host.docker.internal:11434/api/generate"
            model = model_override or "llama3.2"
            with httpx.Client(timeout=25.0) as client:
                resp = client.post(url, json={"model": model, "prompt": rendered_prompt, "system": system_prompt, "stream": False})
                if resp.is_success:
                    reply_text = resp.json().get("response", "").strip()
        else:
            reply_text = "Thank you for messaging! We will get back to you soon."
    except Exception as exc:
        logger.warning("Execution %s: AI reply generation error: %s", ctx.execution.pk, exc)
        reply_text = "Thank you for reaching out! Our team has been notified and will assist you."

    if reply_text:
        set_field_value(ctx.contact, field, typed_for(field, reply_text))


def _ai_classify_intent(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Classify user message into target intent categories."""
    raw_text = step.get("user_text") or ""
    rendered_text = ctx.render(raw_text).strip()
    intents = [str(item).strip().lower() for item in (step.get("intents") or []) if str(item).strip()]
    if not intents:
        intents = ["support", "sales", "other"]

    target_field_name = step.get("target_field")
    field = _resolve_or_create_custom_field(ctx, target_field_name, field_type="text")
    if field is None:
        return

    detected_intent = intents[-1]
    if not rendered_text:
        set_field_value(ctx.contact, field, typed_for(field, detected_intent))
        return

    api_key = step.get("api_key") or getattr(settings, "GEMINI_API_KEY", "") or os.environ.get("GEMINI_API_KEY", "")
    provider = str(step.get("provider") or "gemini").lower()

    lower_user = rendered_text.lower()
    for intent in intents:
        if intent in lower_user:
            detected_intent = intent
            break
    else:
        if provider == "gemini" and api_key:
            try:
                system_instruction = (
                    f"Classify the customer message into exactly one of these categories: {', '.join(intents)}.\n"
                    "Respond with ONLY the exact category name in lowercase and nothing else."
                )
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
                with httpx.Client(timeout=10.0) as client:
                    resp = client.post(
                        url,
                        json={
                            "contents": [{"parts": [{"text": rendered_text}]}],
                            "systemInstruction": {"parts": [{"text": system_instruction}]},
                        },
                    )
                    if resp.is_success:
                        ans = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip().lower()
                        for it in intents:
                            if it in ans:
                                detected_intent = it
                                break
            except Exception as exc:
                logger.warning("Execution %s: AI intent classification error: %s", ctx.execution.pk, exc)

    set_field_value(ctx.contact, field, typed_for(field, detected_intent))


def _append_google_sheet(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Send contact and custom field data to a Google Sheets webhook or automation endpoint."""
    webhook_url = step.get("webhook_url") or ""
    if not webhook_url.startswith(("http://", "https://")):
        logger.warning("Execution %s: invalid webhook URL %r for append_google_sheet", ctx.execution.pk, webhook_url)
        return

    contact = ctx.contact
    contact_fields: dict[str, Any] = {}
    if hasattr(contact, "field_values"):
        for fv in contact.field_values.select_related("field").all():
            contact_fields[fv.field.name] = str(fv.value)

    tags = [t.name for t in contact.tags.all()] if hasattr(contact, "tags") else []
    payload = {
        "contact_id": str(contact.pk),
        "name": getattr(contact, "display_name", "") or getattr(contact, "name", ""),
        "phone": getattr(contact, "phone", ""),
        "email": getattr(contact, "email", ""),
        "platform": str(ctx.connection.platform) if ctx.connection else "",
        "tags": ", ".join(tags),
        "flow_name": ctx.execution.flow.name,
        "timestamp": timezone.now().isoformat(),
        **contact_fields,
    }

    extra_data = step.get("extra_data")
    if extra_data:
        rendered_extra = ctx.render(str(extra_data))
        try:
            parsed = json.loads(rendered_extra)
            if isinstance(parsed, dict):
                payload.update(parsed)
            else:
                payload["extra_data"] = rendered_extra
        except Exception:
            payload["extra_data"] = rendered_extra

    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(webhook_url, json=payload)
    except Exception as exc:
        logger.warning("Execution %s: append_google_sheet failed to post: %s", ctx.execution.pk, exc)


def _assign_round_robin(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Evenly distribute conversations among active workspace team members."""
    from apps.members.models import WorkspaceMembership

    roles = step.get("roles") or ["agent", "admin", "owner"]
    memberships = list(
        WorkspaceMembership.objects.filter(workspace_id=ctx.workspace_id, role__in=roles)
        .select_related("user")
        .order_by("user__date_joined")
    )
    if not memberships:
        logger.warning("Execution %s: no members available for assign_round_robin.", ctx.execution.pk)
        return

    cache_key = f"round_robin_assign_{ctx.workspace_id}"
    last_idx = cache.get(cache_key, -1)
    next_idx = (last_idx + 1) % len(memberships)
    cache.set(cache_key, next_idx, timeout=86400 * 30)

    chosen_user = memberships[next_idx].user
    messaging.assign_conversation(ctx.contact, chosen_user, ctx.connection)
    logger.info("Execution %s: round-robin assigned to member %s", ctx.execution.pk, chosen_user.pk)


def _check_business_hours(ctx: NodeContext, step: dict[str, Any]) -> None:
    """Check if current time is within business hours and set custom field to true/false."""
    import zoneinfo

    tz_name = step.get("timezone") or getattr(ctx.workspace, "timezone", "") or "Asia/Kolkata"
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = zoneinfo.ZoneInfo("Asia/Kolkata")

    now = datetime.now(tz)
    current_time_str = now.strftime("%H:%M")
    day_code = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][now.weekday()]

    active_days = step.get("active_days") or ["mon", "tue", "wed", "thu", "fri"]
    start_time = step.get("start_time") or "09:00"
    end_time = step.get("end_time") or "18:00"

    is_open = (day_code in active_days) and (start_time <= current_time_str <= end_time)

    target_field_name = step.get("target_field") or "is_business_hours"
    field = _resolve_or_create_custom_field(ctx, target_field_name, field_type="boolean")
    if field is not None:
        set_field_value(ctx.contact, field, is_open)


for _verb, _handler in (
    ("add_tag", _add_tag),
    ("remove_tag", _remove_tag),
    ("set_field", _set_field),
    ("clear_field", _clear_field),
    ("open_conversation", _open_conversation),
    ("close_conversation", _close_conversation),
    ("assign_conversation", _assign_conversation),
    ("notify_members", _notify_members),
    ("ai_generate_reply", _ai_generate_reply),
    ("ai_classify_intent", _ai_classify_intent),
    ("append_google_sheet", _append_google_sheet),
    ("assign_round_robin", _assign_round_robin),
    ("check_business_hours", _check_business_hours),
):
    register_verb(_verb, _handler)


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _member(ctx: NodeContext, value: Any) -> Any | None:
    """A workspace member's user, by user id, or ``None`` with a warning."""
    from apps.members.models import WorkspaceMembership

    try:
        user_id = UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        logger.warning("Execution %s: %r is not a member id.", ctx.execution.pk, value)
        return None
    membership = (
        WorkspaceMembership.objects.filter(workspace_id=ctx.workspace_id, user_id=user_id)
        .select_related("user")
        .first()
    )
    if membership is None:
        logger.warning(
            "Execution %s: member %s is not in this workspace; skipping.",
            ctx.execution.pk,
            user_id,
        )
        return None
    return membership.user
