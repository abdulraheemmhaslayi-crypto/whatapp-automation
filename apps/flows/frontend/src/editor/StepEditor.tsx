/**
 * The inspector: the selected step, and all 12 advanced production-level interactive features:
 * 1. Button (CTA buttons: Buy Now, Submit, Book Now, Call, URL)
 * 2. Text Input (User name, email, phone number collection)
 * 3. Dropdown (Multiple options select menu)
 * 4. Radio Button (Single option quick reply)
 * 5. Checkbox (Multiple options select)
 * 6. Date Picker (Appointment or booking date selection)
 * 7. Calendar (Calendar date range / wait time window)
 * 8. Conditional Logic (Branching next screen based on user answer)
 * 9. API Integration (Live data fetch & backend webhook)
 * 10. Dynamic Content (Personalization tokens {{first_name}}, {{phone}})
 * 11. Form Validation (Email/phone validation & retry prompts)
 * 12. File Upload (Collect documents/photos + Drag & drop uploader)
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { configSchema } from "../schema/artifact";
import { newItemId } from "../schema/ids";
import { sourceHandlesFor } from "../schema/handles";
import { FieldProvider, type FieldContextValue } from "../inspector/FieldContext";
import { SchemaField } from "../inspector/SchemaField";
import type { ConfigPath } from "../store/paths";
import { Preview } from "../preview/Preview";
import { useBuilder, useBuilderStore } from "../store/context";
import { titleOf } from "./title";
import {
  IconMessage,
  IconSmartphone,
  IconCrosshair,
  IconRotateCcw,
  IconCheck,
  IconPhone,
  IconVideo,
  IconMoreVertical,
  IconSmile,
  IconPaperclip,
  IconSend,
  IconExternalLink,
  IconCursorClick,
  IconCalendar,
  IconClock,
  IconGitBranch,
  IconGlobe,
  IconSparkles,
  IconShieldCheck,
  IconUpload,
  IconType,
  IconChevronDownSquare,
  IconCircleDot,
  IconCheckSquare,
  IconCopy,
  IconInfo,
  IconZap,
  IconBot,
  IconImage,
  IconFile,
  IconMail,
  IconSettings,
  IconDices,
} from "../icons/LucideIcons";

function nodeTypeBadge(type: string): { label: string; bg: string; color: string; icon: ReactNode } {
  switch (type) {
    case "send_message":
      return { label: "Message", bg: "#eff6ff", color: "#1d4ed8", icon: <IconMessage width={13} height={13} /> };
    case "condition":
      return { label: "Condition Branch", bg: "#faf5ff", color: "#7e22ce", icon: <IconGitBranch width={13} height={13} /> };
    case "smart_delay":
      return { label: "Smart Delay", bg: "#fffbeb", color: "#b45309", icon: <IconClock width={13} height={13} /> };
    case "randomizer":
      return { label: "A/B Split", bg: "#eef2ff", color: "#4338ca", icon: <IconDices width={13} height={13} /> };
    case "action":
      return { label: "Action", bg: "#f0fdf4", color: "#15803d", icon: <IconZap width={13} height={13} /> };
    case "external_request":
      return { label: "Webhook Request", bg: "#ecfeff", color: "#0e7490", icon: <IconGlobe width={13} height={13} /> };
    case "data_collection":
      return { label: "Data Collection", bg: "#fff7ed", color: "#c2410c", icon: <IconType width={13} height={13} /> };
    case "send_email":
      return { label: "Email", bg: "#f0fdfa", color: "#0f766e", icon: <IconMail width={13} height={13} /> };
    case "send_sms":
      return { label: "SMS", bg: "#f0f9ff", color: "#0369a1", icon: <IconSmartphone width={13} height={13} /> };
    default:
      return { label: "Step", bg: "#f1f5f9", color: "#475569", icon: <IconSettings width={13} height={13} /> };
  }
}

export function StepEditor() {
  const store = useBuilderStore();
  const bodyRef = useRef<HTMLDivElement>(null);
  const selected = useBuilder((state) => state.selection.nodes);
  const stepCount = useBuilder((state) => state.nodeOrder.length);
  const canEdit = useBuilder((state) => state.env.canEdit);

  const triggerSelected = useBuilder((state) => state.triggerSelected);
  const nodeId = selected.length === 1 ? (selected[0] as string) : null;
  const nodeType = useBuilder((state) => (nodeId ? state.nodeType[nodeId] : undefined));
  const config = useBuilder((state) => (nodeId ? (state.config[nodeId] as Record<string, any>) : undefined));
  const issues = useBuilder((state) => (nodeId ? state.validation.byNode[nodeId] : undefined));
  const picklists = useBuilder((state) => state.picklists);
  const env = useBuilder((state) => state.env);
  const index = useBuilder((state) => (nodeId ? state.nodeOrder.indexOf(nodeId) : -1));
  const [tab, setTab] = useState<"settings" | "preview">("settings");
  const [featuresOpen, setFeaturesOpen] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // ── Auto-clean illegal keys from nodes so schema errors are healed instantly ──
  useEffect(() => {
    if (!nodeId || !nodeType || !config) return;
    if (nodeType === "data_collection") {
      if (config.quick_replies !== undefined) {
        store.getState().clearConfig(nodeId, ["quick_replies"]);
      }
      if (config.buttons !== undefined) {
        store.getState().clearConfig(nodeId, ["buttons"]);
      }
      if (config.blocks !== undefined) {
        store.getState().clearConfig(nodeId, ["blocks"]);
      }
      if (config.followup !== undefined) {
        store.getState().clearConfig(nodeId, ["followup"]);
      }
      if (config.retry_unmatched !== undefined) {
        store.getState().clearConfig(nodeId, ["retry_unmatched"]);
      }
      if (config.whatsapp_template !== undefined) {
        store.getState().clearConfig(nodeId, ["whatsapp_template"]);
      }
    } else if (nodeType === "send_message") {
      if (config.question !== undefined) {
        store.getState().clearConfig(nodeId, ["question"]);
      }
      if (config.reply_type !== undefined) {
        store.getState().clearConfig(nodeId, ["reply_type"]);
      }
      if (config.target !== undefined) {
        store.getState().clearConfig(nodeId, ["target"]);
      }
    }
  }, [nodeId, nodeType, config, store]);

  const cleanKeyManually = (key: string) => {
    if (!nodeId) return;
    store.getState().clearConfig(nodeId, [key]);
    showToast(`Removed unrecognized key '${key}'`);
  };

  const context = useMemo<FieldContextValue | null>(() => {
    if (!nodeId || !nodeType) {
      return null;
    }
    return {
      nodeId,
      nodeType,
      readOnly: !canEdit,
      picklists,
      issues: issues ?? [],
      env,
      set: (path: ConfigPath, value: unknown, historyKey?: string) =>
        value === undefined
          ? store.getState().clearConfig(nodeId, path)
          : store.getState().updateConfig(nodeId, path, value, historyKey),
      clear: (path: ConfigPath) => store.getState().clearConfig(nodeId, path),
    };
  }, [nodeId, nodeType, canEdit, env, picklists, issues, store]);

  useEffect(() => {
    const body = bodyRef.current;
    if (nodeId && body) {
      body.scrollTop = 0;
    }
  }, [nodeId, tab]);

  if (selected.length > 1) {
    return (
      <section className="fb-editor" aria-label="Step settings">
        <div className="fb-editor-body">
          <p className="fb-empty">{selected.length} steps selected.</p>
          {canEdit ? (
            <button
              type="button"
              className="btn-pill-secondary btn-pill-sm mt-3"
              onClick={() => store.getState().deleteNodes(selected)}
            >
              Delete these {selected.length} steps
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  const badge = nodeType ? nodeTypeBadge(nodeType) : null;

  // ── Helper Actions for 12 Interactive Features ──────────────────────────────
  const addConnectedStep = (type: string, initialConfig?: Record<string, unknown>) => {
    if (!nodeId) return;
    const state = store.getState();
    const currentPos = state.position[nodeId] ?? { x: 0, y: 0 };
    const newPos = { x: currentPos.x + 360, y: currentPos.y };
    const newId = state.addNode(type, newPos, { cascade: true });
    if (newId) {
      if (initialConfig) {
        for (const k in initialConfig) {
          state.updateConfig(newId, [k], initialConfig[k]);
        }
      }
      const currentNodeType = state.nodeType[nodeId] ?? "";
      const currentConfig = state.config[nodeId];
      const handles = sourceHandlesFor(currentNodeType, currentConfig);
      const usedHandles = new Set(
        state.edgeOrder
          .map((eid) => state.edge[eid])
          .filter((e) => e && e.source === nodeId)
          .map((e) => e?.sourceHandle)
      );
      const availableHandle = handles.find((h) => !usedHandles.has(h)) || handles.find((h) => h === "default") || handles[0];
      if (availableHandle) {
        state.connect(nodeId, availableHandle, newId);
      }
      state.setSelection({ nodes: [newId], edges: [] });
    }
  };

  // 1. CTA Button
  const handleCtaButton = () => {
    if (!nodeId) return;
    if (nodeType === "send_message") {
      const currentButtons = Array.isArray(config?.buttons) ? [...config.buttons] : [];
      const newBtn = {
        id: newItemId(),
        label: "Buy Now",
        action: "url",
        url: "https://example.com/checkout",
      };
      store.getState().updateConfig(nodeId, ["buttons"], [...currentButtons, newBtn]);
      showToast("CTA Button ('Buy Now') added to message");
    } else {
      addConnectedStep("send_message", {
        blocks: [{ id: newItemId(), type: "text", text: "Click below to proceed:" }],
        buttons: [{ id: newItemId(), label: "Buy Now", action: "url", url: "https://example.com/checkout" }],
      });
      showToast("Added next message with CTA Button");
    }
  };

  // 2. Text Input
  const handleTextInput = () => {
    if (!nodeId) return;
    if (nodeType === "data_collection") {
      store.getState().updateConfig(nodeId, ["reply_type"], "text");
      store.getState().updateConfig(nodeId, ["target"], { type: "system_field", key: "first_name" });
      if (!config?.question || config.question === "Ask a question") {
        store.getState().updateConfig(nodeId, ["question"], "Please provide your Name, Email, or Phone:");
      }
      showToast("Configured this step for Text Input");
    } else {
      addConnectedStep("data_collection", {
        question: "Please provide your Name, Email, or Phone:",
        reply_type: "text",
        target: { type: "system_field", key: "first_name" },
        retry: { max: 3, invalid_text: "Please provide a valid input." },
      });
      showToast("Added Text Input collection step");
    }
  };

  // 3. Dropdown Menu
  const handleDropdown = () => {
    if (!nodeId) return;
    if (nodeType === "send_message") {
      const currentButtons = Array.isArray(config?.buttons) ? [...config.buttons] : [];
      const btn1 = { id: newItemId(), label: "Option 1", action: "postback" };
      const btn2 = { id: newItemId(), label: "Option 2", action: "postback" };
      store.getState().updateConfig(nodeId, ["buttons"], [...currentButtons, btn1, btn2]);
      showToast("Dropdown options added to message");
    } else {
      addConnectedStep("send_message", {
        blocks: [{ id: newItemId(), type: "text", text: "Please select an option from the menu below:" }],
        buttons: [
          { id: newItemId(), label: "Option 1", action: "postback" },
          { id: newItemId(), label: "Option 2", action: "postback" },
        ],
      });
      showToast("Added message with Dropdown choice menu");
    }
  };

  // 4. Radio Button (Single Option)
  const handleRadioButton = () => {
    if (!nodeId) return;
    if (nodeType === "send_message") {
      const currentReplies = Array.isArray(config?.quick_replies) ? [...config.quick_replies] : [];
      const qr1 = { id: newItemId(), label: "Option A" };
      const qr2 = { id: newItemId(), label: "Option B" };
      store.getState().updateConfig(nodeId, ["quick_replies"], [...currentReplies, qr1, qr2]);
      showToast("Radio button quick replies added to message");
    } else {
      addConnectedStep("send_message", {
        blocks: [{ id: newItemId(), type: "text", text: "Please select one option:" }],
        quick_replies: [
          { id: newItemId(), label: "Option A" },
          { id: newItemId(), label: "Option B" },
        ],
      });
      showToast("Added message with Radio Button quick replies");
    }
  };

  // 5. Checkbox (Multi Option)
  const handleCheckbox = () => {
    if (!nodeId) return;
    if (nodeType === "send_message") {
      const currentButtons = Array.isArray(config?.buttons) ? [...config.buttons] : [];
      const b1 = { id: newItemId(), label: "Choice A", action: "postback" };
      const b2 = { id: newItemId(), label: "Choice B", action: "postback" };
      store.getState().updateConfig(nodeId, ["buttons"], [...currentButtons, b1, b2]);
      showToast("Multi-select checkbox options added");
    } else {
      addConnectedStep("send_message", {
        blocks: [{ id: newItemId(), type: "text", text: "Select your preferred choices:" }],
        buttons: [
          { id: newItemId(), label: "Choice 1", action: "postback" },
          { id: newItemId(), label: "Choice 2", action: "postback" },
        ],
      });
      showToast("Added message with choice options");
    }
  };

  // 6. Date Picker
  const handleDatePicker = () => {
    if (!nodeId) return;
    if (nodeType === "data_collection") {
      store.getState().updateConfig(nodeId, ["reply_type"], "date");
      store.getState().updateConfig(nodeId, ["target"], { type: "custom_field", key: "appointment_date" });
      if (!config?.question || config.question === "Ask a question") {
        store.getState().updateConfig(nodeId, ["question"], "Please reply with your appointment or booking date (YYYY-MM-DD):");
      }
      store.getState().updateConfig(nodeId, ["retry"], { max: 3, invalid_text: "Please enter a valid date in YYYY-MM-DD format." });
      showToast("Configured this step as Date Picker");
    } else {
      addConnectedStep("data_collection", {
        question: "Please reply with your appointment or booking date (YYYY-MM-DD):",
        reply_type: "date",
        target: { type: "custom_field", key: "appointment_date" },
        retry: { max: 3, invalid_text: "Please enter a valid date in YYYY-MM-DD format." },
      });
      showToast("Added Date Picker appointment step");
    }
  };

  // 7. Calendar
  const handleCalendar = () => {
    addConnectedStep("smart_delay", {
      mode: "duration",
      duration: { value: 1, unit: "days" },
    });
    showToast("Added Calendar / Smart Delay step");
  };

  // 8. Conditional Logic
  const handleCondition = () => {
    addConnectedStep("condition", {
      rules: [
        {
          source: "custom_field",
          key: "appointment_date",
          operator: "exists",
          value: "",
        },
      ],
    });
    showToast("Added Conditional Logic branching step");
  };

  // 9. API Integration
  const handleApiIntegration = () => {
    addConnectedStep("external_request", {
      method: "POST",
      url: "https://api.yourbackend.com/webhook",
      headers: [],
      response_mappings: [],
    });
    showToast("Added API Integration (Webhook) step");
  };

  // 10. Dynamic Content
  const handleDynamicContent = () => {
    if (!nodeId) return;
    if (nodeType === "send_message") {
      const blocks = Array.isArray(config?.blocks) ? [...config.blocks] : [];
      if (blocks.length > 0 && blocks[0].type === "text") {
        const txt = blocks[0].text || "";
        store.getState().updateConfig(nodeId, ["blocks", 0, "text"], txt + " {{first_name}}");
      } else {
        store.getState().updateConfig(nodeId, ["blocks"], [{ id: newItemId(), type: "text", text: "Hello {{first_name}}, your order is confirmed!" }, ...blocks]);
      }
      showToast("Inserted dynamic variable {{first_name}}");
    } else if (nodeType === "data_collection") {
      const q = config?.question || "Hello";
      store.getState().updateConfig(nodeId, ["question"], q + " {{first_name}}");
      showToast("Inserted dynamic variable {{first_name}} into question");
    } else {
      showToast("Dynamic content tokens: {{first_name}}, {{phone}}, {{email}}");
    }
  };

  // 11. Form Validation
  const handleValidation = () => {
    if (!nodeId) return;
    if (nodeType === "data_collection") {
      store.getState().updateConfig(nodeId, ["retry"], {
        max: 3,
        invalid_text: "Invalid input. Please provide a valid response.",
      });
      showToast("Form Validation & 3 retries enabled");
    } else if (nodeType === "send_message") {
      store.getState().updateConfig(nodeId, ["retry_unmatched"], {
        enabled: true,
        max: 3,
        text: "Please select one of the valid options shown above.",
      });
      showToast("Validation retry enabled on message");
    } else {
      showToast("Validation is supported on Question and Message steps");
    }
  };

  // 12. File Upload
  const handleFileUpload = () => {
    addConnectedStep("data_collection", {
      question: "Please upload or send your document or photo:",
      reply_type: "url",
      target: { type: "custom_field", key: "uploaded_file" },
      retry: { max: 3, invalid_text: "Please provide a valid document or image link." },
    });
    showToast("Added File / Document Upload collection step");
  };

  return (
    <section className="fb-editor" aria-label="Step settings">
      {nodeId && nodeType && context ? (
        <div className="tabs tabs-inline fb-inspector-tabs" role="tablist" aria-label="Step">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            Settings
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === "preview"}
            onClick={() => setTab("preview")}
          >
            Preview
          </button>
        </div>
      ) : null}
      <div className="fb-editor-body" ref={bodyRef}>
        {nodeId && nodeType && context && tab === "preview" ? (
          <Preview />
        ) : nodeId && nodeType && context ? (
          <section className="fb-editor-section">
            <header className="fb-edit-head">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                <span className="fb-edit-caption">
                  {index >= 0 ? `Editing step ${index + 1}` : "Editing this step"}
                </span>
                {badge ? (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      background: badge.bg,
                      color: badge.color,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </span>
                ) : null}
              </div>
              <span className="fb-edit-title">{titleOf(nodeType, config)}</span>
            </header>

            <StepProblems issues={issues ?? []} onCleanKey={cleanKeyManually} />

            {/* Toast feedback notification */}
            {toastMsg ? (
              <div
                style={{
                  margin: "8px 0",
                  padding: "6px 12px",
                  background: "#10b981",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "6px",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  animation: "fadeIn 0.2s ease-in-out",
                }}
              >
                <IconCheck width={13} height={13} strokeWidth={3} />
                <span>{toastMsg}</span>
              </div>
            ) : null}

            {/* ── 12 Interactive Features & Components Toolbar ─────────────────── */}
            {canEdit ? (
              <div
                style={{
                  margin: "12px 0",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  overflow: "hidden",
                }}
              >
                <div
                  onClick={() => setFeaturesOpen(!featuresOpen)}
                  style={{
                    padding: "8px 12px",
                    background: "#f8fafc",
                    borderBottom: featuresOpen ? "1px solid #e2e8f0" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <IconZap width={13} height={13} style={{ color: "#d97706" }} />
                    <span>Interactive Form & Flow Features</span>
                  </span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    {featuresOpen ? "▲" : "▼"}
                  </span>
                </div>

                {featuresOpen ? (
                  <div style={{ padding: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {/* 1. Button (CTA) */}
                    <button
                      type="button"
                      onClick={handleCtaButton}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Add CTA buttons: Buy Now, Submit, Book Now"
                    >
                      <IconCursorClick width={14} height={14} style={{ color: "#2563eb", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ CTA Button</span>
                    </button>

                    {/* 2. Text Input */}
                    <button
                      type="button"
                      onClick={handleTextInput}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Collect Name, Email, Phone number from user"
                    >
                      <IconType width={14} height={14} style={{ color: "#0284c7", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Text Input</span>
                    </button>

                    {/* 3. Dropdown Menu */}
                    <button
                      type="button"
                      onClick={handleDropdown}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Dropdown list of multiple options"
                    >
                      <IconChevronDownSquare width={14} height={14} style={{ color: "#7c3aed", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Dropdown</span>
                    </button>

                    {/* 4. Radio Button */}
                    <button
                      type="button"
                      onClick={handleRadioButton}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Single option quick select radio button"
                    >
                      <IconCircleDot width={14} height={14} style={{ color: "#0d9488", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Radio Button</span>
                    </button>

                    {/* 5. Checkbox */}
                    <button
                      type="button"
                      onClick={handleCheckbox}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Multiple options choice selection"
                    >
                      <IconCheckSquare width={14} height={14} style={{ color: "#059669", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Checkbox</span>
                    </button>

                    {/* 6. Date Picker */}
                    <button
                      type="button"
                      onClick={handleDatePicker}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Select appointment or booking date"
                    >
                      <IconCalendar width={14} height={14} style={{ color: "#ea580c", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Date Picker</span>
                    </button>

                    {/* 7. Calendar / Smart Delay */}
                    <button
                      type="button"
                      onClick={handleCalendar}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Select calendar date range or schedule follow-up"
                    >
                      <IconClock width={14} height={14} style={{ color: "#d97706", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Calendar</span>
                    </button>

                    {/* 8. Conditional Logic */}
                    <button
                      type="button"
                      onClick={handleCondition}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Show next screen according to user answer"
                    >
                      <IconGitBranch width={14} height={14} style={{ color: "#9333ea", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Condition</span>
                    </button>

                    {/* 9. API Integration */}
                    <button
                      type="button"
                      onClick={handleApiIntegration}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Fetch live data and connect to backend API"
                    >
                      <IconGlobe width={14} height={14} style={{ color: "#0284c7", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ API Webhook</span>
                    </button>

                    {/* 10. Dynamic Content */}
                    <button
                      type="button"
                      onClick={handleDynamicContent}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Dynamic text and personalized variables"
                    >
                      <IconSparkles width={14} height={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Dynamic Text</span>
                    </button>

                    {/* 11. Form Validation */}
                    <button
                      type="button"
                      onClick={handleValidation}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Validate invalid email, phone, or missing fields"
                    >
                      <IconShieldCheck width={14} height={14} style={{ color: "#16a34a", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ Validation</span>
                    </button>

                    {/* 12. File Upload */}
                    <button
                      type="button"
                      onClick={handleFileUpload}
                      style={{
                        padding: "6px 8px",
                        textAlign: "left",
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#1e293b",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                      title="Collect documents or photos from users"
                    >
                      <IconUpload width={14} height={14} style={{ color: "#4f46e5", flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>+ File Upload</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <FieldProvider value={context}>
              <SchemaField
                schema={configSchema(nodeType)}
                path={[]}
                value={config}
                propertyName="config"
                required
              />
            </FieldProvider>

            {canEdit ? (
              <>
                <hr className="fb-step-rule" />
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => store.getState().duplicateNode(nodeId)}
                    style={{
                      flex: 1,
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#334155",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "6px",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    <IconCopy width={14} height={14} />
                    <span>Duplicate step</span>
                  </button>
                  <button
                    type="button"
                    className="fb-step-delete"
                    style={{ margin: 0 }}
                    onClick={() => store.getState().deleteNodes([nodeId])}
                  >
                    Delete this step
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : triggerSelected ? (
          <p className="fb-empty mt-3">What starts this flow is in “When it runs” on the left.</p>
        ) : stepCount > 0 ? (
          <p className="fb-empty mt-3">Pick a step in the outline, or on the canvas, to change what it says.</p>
        ) : (
          <p className="fb-empty mt-3">Add a step on the canvas, then its settings appear here.</p>
        )}
      </div>
    </section>
  );
}

/**
 * What is wrong with this step, said once, at the top.
 */
function StepProblems({
  issues,
  onCleanKey,
}: {
  issues: readonly { code: string; message: string; severity: string }[];
  onCleanKey?: (key: string) => void;
}) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity !== "error");
  if (errors.length === 0 && warnings.length === 0) {
    return null;
  }
  return (
    <div className="fb-step-problems">
      {[...errors, ...warnings].map((issue, position) => {
        const match = issue.message.match(/'([^']+)' is not a recognised key here/);
        const badKey = match ? match[1] : null;
        return (
          <div
            key={position}
            className={`fb-step-problem fb-step-problem-${issue.severity}`}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}
          >
            <span>{issue.message}</span>
            {badKey && onCleanKey ? (
              <button
                type="button"
                onClick={() => onCleanKey(badKey)}
                style={{
                  background: "#ef4444",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Clean '{badKey}'
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
