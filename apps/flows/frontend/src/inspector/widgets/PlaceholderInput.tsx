/**
 * A text field that knows about `{{placeholder}}` tokens with production-grade
 * personalization controls:
 * - 1-Click quick variable insert pills (+ First Name, + Phone, + Email...)
 * - Searchable variable picker popover with category labels
 * - Real-time character counter against schema limits
 * - Keyboard-friendly {{ trigger
 */
import { useId, useRef, useState } from "react";

import { FieldShell, fieldId, type FieldProps } from "../fields";
import { useField } from "../FieldContext";

/** SPEC §9.2's system fields. Custom fields and variables come from the API. */
export const SYSTEM_TOKENS = ["first_name", "last_name", "email", "phone"];

const TOKEN_LABELS: Record<string, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  email: "Email",
  phone: "Phone",
};

export function PlaceholderInput(props: FieldProps) {
  const { set, readOnly, picklists } = useField();
  const { schema, path, value } = props;
  const [open, setOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const input = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const listboxId = useId();

  const text = typeof value === "string" ? value : "";
  const long = (schema.maxLength ?? 0) > 512;
  const maxLen = schema.maxLength;

  const customTokens = picklists.custom_fields.map((field) => field.id);
  const allTokens = [...SYSTEM_TOKENS, ...customTokens];

  const filteredTokens = allTokens.filter(
    (tok) =>
      tok.toLowerCase().includes(filterQuery.toLowerCase()) ||
      (TOKEN_LABELS[tok] || tok).toLowerCase().includes(filterQuery.toLowerCase())
  );

  const insert = (token: string) => {
    const element = input.current;
    const at = element?.selectionStart ?? text.length;
    // Replace trailing {{ if present, else insert cleanly
    const before = text.slice(0, at).replace(/\{\{$/, "");
    const after = text.slice(at);
    const nextText = `${before}{{${token}}}${after}`;
    set(path, nextText, `text:${path.join(".")}`);
    setOpen(false);
    setFilterQuery("");

    // Restore focus and place cursor right after inserted token
    setTimeout(() => {
      if (element) {
        element.focus();
        const nextPos = before.length + token.length + 4;
        element.setSelectionRange?.(nextPos, nextPos);
      }
    }, 10);
  };

  const onChange = (next: string, caret: number) => {
    set(path, next, `text:${path.join(".")}`);
    if (next.slice(Math.max(0, caret - 2), caret) === "{{") {
      setOpen(true);
      setFilterQuery("");
    }
  };

  const common = {
    id: fieldId(path),
    className: "form-input-styled",
    value: text,
    disabled: readOnly,
    maxLength: schema.maxLength,
    style: { width: "100%", boxSizing: "border-box" as const },
  };

  return (
    <FieldShell {...props}>
      <div style={{ position: "relative" }}>
        {long ? (
          <textarea
            {...common}
            rows={5}
            ref={input as React.RefObject<HTMLTextAreaElement>}
            onChange={(event) => onChange(event.target.value, event.target.selectionStart ?? 0)}
          />
        ) : (
          <input
            {...common}
            type="text"
            ref={input as React.RefObject<HTMLInputElement>}
            onChange={(event) => onChange(event.target.value, event.target.selectionStart ?? 0)}
          />
        )}

        {/* Character Count Badge */}
        {maxLen ? (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "2px",
              marginBottom: "4px",
              fontSize: "11px",
              color: text.length >= maxLen ? "#ef4444" : "#94a3b8",
              fontWeight: 500,
            }}
          >
            <span>
              {text.length} / {maxLen}
            </span>
          </div>
        ) : null}

        {/* 1-Click Variable Quick Pills */}
        {!readOnly ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "5px",
              marginTop: "6px",
            }}
          >
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Insert:</span>
            {SYSTEM_TOKENS.map((tok) => (
              <button
                key={tok}
                type="button"
                onClick={() => insert(tok)}
                style={{
                  fontSize: "11px",
                  padding: "2px 7px",
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  cursor: "pointer",
                  color: "#334155",
                  fontWeight: 500,
                  transition: "all 0.15s ease",
                }}
                title={`Insert {{${tok}}}`}
              >
                + {TOKEN_LABELS[tok] || tok}
              </button>
            ))}

            <button
              type="button"
              onClick={() => {
                setOpen((prev) => !prev);
                setFilterQuery("");
              }}
              style={{
                fontSize: "11px",
                padding: "2px 8px",
                background: open ? "#e0e7ff" : "#ffffff",
                border: "1px solid #4f46e5",
                borderRadius: "6px",
                cursor: "pointer",
                color: "#4f46e5",
                fontWeight: 600,
              }}
            >
              {open ? "✕ Close" : "{…} More"}
            </button>
          </div>
        ) : null}

        {/* Searchable Variable Popover */}
        {open && !readOnly ? (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Insert a placeholder"
            style={{
              position: "absolute",
              zIndex: 30,
              top: "100%",
              left: 0,
              right: 0,
              marginTop: "4px",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              maxHeight: "220px",
              overflowY: "auto",
              padding: "6px",
            }}
          >
            <input
              type="text"
              placeholder="Search variables..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "4px 8px",
                fontSize: "11px",
                borderRadius: "4px",
                border: "1px solid #e2e8f0",
                marginBottom: "6px",
                boxSizing: "border-box",
              }}
              autoFocus
            />

            {filteredTokens.length === 0 ? (
              <p style={{ margin: "6px", fontSize: "11px", color: "#94a3b8" }}>No matching variables found</p>
            ) : (
              filteredTokens.map((token) => (
                <button
                  key={token}
                  type="button"
                  role="option"
                  onClick={() => insert(token)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    textAlign: "left",
                    padding: "5px 8px",
                    borderRadius: "4px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: "11px",
                    color: "#1e293b",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontWeight: 600, color: "#4f46e5" }}>{`{{${token}}}`}</span>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>
                    {TOKEN_LABELS[token] || (customTokens.includes(token) ? "Custom Field" : "System")}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
