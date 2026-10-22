/**
 * Production-ready WhatsApp & Messaging Interactive Phone Preview:
 * - Full Conversation Flow Simulation (walk through entire flow step-by-step)
 * - Interactive Button & Quick Reply clicking (routes to connected steps in real time)
 * - Real User Input support for Data Collection / Form Questions
 * - Single Step Inspection toggle
 * - Authentic WhatsApp Smartphone UI (Status bar, WhatsApp Header, Ticks, Media previews)
 * - Image, Audio, Video & Document visual cards
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { nodeSpec } from "../schema/artifact";
import { selectEntryIds } from "../store/selectors";
import { useBuilder, useBuilderStore } from "../store/context";
import {
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
  IconClock,
  IconGitBranch,
  IconGlobe,
  IconZap,
  IconBot,
  IconImage,
  IconFile,
  IconLock,
  IconSignal,
  IconBattery,
  IconPlay,
  IconDownload,
  IconChevronLeft,
  IconSettings,
  IconInfo,
} from "../icons/LucideIcons";
import { useResolvedMedia } from "../media/mediaResolver";



function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface SimMessage {
  id: string;
  sender: "bot" | "user" | "system";
  nodeId?: string;
  nodeType?: string;
  text?: string;
  blocks?: Record<string, unknown>[];
  buttons?: Array<{ id: string; label: string; action: string; url?: string }>;
  quick_replies?: Array<{ id: string; label: string }>;
  time: string;
}

export function Preview() {
  const store = useBuilderStore();
  const selected = useBuilder((state) => state.selection.nodes);
  const selectedNodeId = selected.length === 1 ? (selected[0] as string) : null;
  const nodeType = useBuilder((state) => (selectedNodeId ? state.nodeType[selectedNodeId] : undefined));
  const config = useBuilder((state) => (selectedNodeId ? state.config[selectedNodeId] : undefined));

  const nodeOrder = useBuilder((state) => state.nodeOrder);
  const nodeTypeMap = useBuilder((state) => state.nodeType);
  const configMap = useBuilder((state) => state.config);
  const edgeOrder = useBuilder((state) => state.edgeOrder);
  const edgeMap = useBuilder((state) => state.edge);
  const flow = useBuilder((state) => state.flow);
  const entryIds = useBuilder((state) => selectEntryIds(state));

  const [mode, setMode] = useState<"full" | "single">("full");
  const [history, setHistory] = useState<SimMessage[]>([]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [useSampleData, setUseSampleData] = useState(true);
  const screenRef = useRef<HTMLDivElement>(null);

  // Auto-scroll phone screen to bottom on new messages
  useEffect(() => {
    if (screenRef.current) {
      screenRef.current.scrollTop = screenRef.current.scrollHeight;
    }
  }, [history, isTyping]);

  // Start node is either the first entry node or the first node in order
  const startNodeId = useMemo(() => {
    const fromEntries = Array.from(entryIds)[0];
    if (fromEntries && nodeTypeMap[fromEntries]) return fromEntries;
    return nodeOrder[0] || null;
  }, [entryIds, nodeOrder, nodeTypeMap]);

  const [collectedData, setCollectedData] = useState<Record<string, string>>({});

  // Helper to resolve dynamic tokens
  const formatText = useCallback(
    (str: string) => {
      if (!str) return "";
      const defaultName = useSampleData ? "Ahmed Khan" : "";
      const defaultEmail = useSampleData ? "ahmed.khan@example.com" : "";
      const defaultPhone = useSampleData ? "+92 300 1234567" : "";

      return str
        .replace(/\{\{\s*(?:contact\.)?(?:first_name|name)\s*\}\}/gi, collectedData["first_name"] || defaultName || "Ahmed Khan")
        .replace(/\{\{\s*(?:contact\.)?last_name\s*\}\}/gi, collectedData["last_name"] || "Khan")
        .replace(/\{\{\s*(?:contact\.)?phone\s*\}\}/gi, collectedData["phone"] || defaultPhone || "+92 300 1234567")
        .replace(/\{\{\s*(?:contact\.)?email\s*\}\}/gi, collectedData["email"] || defaultEmail || "ahmed.khan@example.com")
        .replace(/\{\{\s*(?:contact\.)?(?:booking_date|appointment_date)\s*\}\}/gi, "2026-10-25");
    },
    [useSampleData, collectedData]
  );

  const getCurrentTimeString = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Build a message object from a node
  const buildNodeMessage = useCallback(
    (nId: string): SimMessage | null => {
      const type = nodeTypeMap[nId];
      const cfg = configMap[nId];
      if (!type || !isRecord(cfg)) return null;

      const tStr = getCurrentTimeString();

      if (type === "send_message") {
        const rawBlocks = records(cfg["blocks"]).map((b) => {
          if (b["type"] === "text" && typeof b["text"] === "string") {
            return { ...b, text: formatText(b["text"]) };
          }
          if (b["caption"] && typeof b["caption"] === "string") {
            return { ...b, caption: formatText(b["caption"]) };
          }
          return b;
        });
        const buttons = records(cfg["buttons"]).map((b) => ({
          id: text(b["id"]),
          label: formatText(text(b["label"])) || "Button",
          action: text(b["action"]) || "postback",
          url: text(b["url"]),
        }));
        const quick_replies = records(cfg["quick_replies"]).map((q) => ({
          id: text(q["id"]),
          label: formatText(text(q["label"])) || "Option",
        }));

        return {
          id: `msg_${nId}_${Date.now()}`,
          sender: "bot",
          nodeId: nId,
          nodeType: type,
          blocks: rawBlocks,
          buttons,
          quick_replies,
          time: tStr,
        };
      }

      if (type === "data_collection") {
        const qText = text(cfg["question"]) || "Please provide your answer:";
        return {
          id: `q_${nId}_${Date.now()}`,
          sender: "bot",
          nodeId: nId,
          nodeType: type,
          text: formatText(qText),
          time: tStr,
        };
      }

      if (type === "smart_delay") {
        const modeVal = text(cfg["mode"]) || "duration";
        const dur = isRecord(cfg["duration"]) ? `${cfg["duration"]["value"]} ${cfg["duration"]["unit"]}` : "1 day";
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: `⏳ Wait Delay: ${modeVal === "duration" ? dur : "Specific Date"}`,
          time: tStr,
        };
      }

      if (type === "condition") {
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: "⚖️ Condition Evaluated (Next Path)",
          time: tStr,
        };
      }

      if (type === "randomizer") {
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: "🔀 Randomizer: A/B Split Selected",
          time: tStr,
        };
      }

      if (type === "external_request") {
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: `🌐 Webhook API: ${text(cfg["method"]) || "POST"} Request triggered`,
          time: tStr,
        };
      }

      if (type === "send_email") {
        const subj = text(cfg["subject"]) || "Brochure & Welcome Pack";
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: `✉️ Email Dispatched: "${formatText(subj)}"`,
          time: tStr,
        };
      }

      if (type === "send_sms") {
        const smsTxt = text(cfg["text"]) || "SMS Alert Sent";
        const shortTxt = smsTxt.length > 50 ? smsTxt.slice(0, 50) + "..." : smsTxt;
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: `💬 SMS Sent: "${formatText(shortTxt)}"`,
          time: tStr,
        };
      }

      if (type === "start_flow") {
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: "➡️ Handed over to Counselor Live Booking Flow",
          time: tStr,
        };
      }

      if (type === "action") {
        return {
          id: `sys_${nId}_${Date.now()}`,
          sender: "system",
          nodeId: nId,
          nodeType: type,
          text: "⚡ Action: Updated contact attributes & assigned counselor",
          time: tStr,
        };
      }

      return null;
    },
    [nodeTypeMap, configMap, formatText]
  );

  // Checks whether a node requires user intervention (click button or type text)
  const isInteractiveNode = useCallback(
    (nId: string): boolean => {
      const type = nodeTypeMap[nId];
      const cfg = configMap[nId];
      if (type === "data_collection") return true;
      if (type === "send_message") {
        if (!isRecord(cfg)) return false;
        const buttons = records(cfg["buttons"]);
        const quick_replies = records(cfg["quick_replies"]);
        return buttons.length > 0 || quick_replies.length > 0;
      }
      return false;
    },
    [nodeTypeMap, configMap]
  );

  const advanceRef = useRef<((sourceId: string, handleName: string, replyText?: string, depth?: number) => void) | null>(null);

  // Navigate along edge from a node handle
  const advanceFromNode = useCallback(
    (sourceId: string, handleName: string, replyText?: string, depth = 0) => {
      if (depth > 20) return; // avoid infinite loop

      // Find outgoing edge
      const matchingEdges = edgeOrder
        .map((eid) => edgeMap[eid])
        .filter((e) => e && e.source === sourceId);

      let targetEdge = matchingEdges.find((e) => e?.sourceHandle === handleName);
      if (!targetEdge && handleName !== "default") {
        targetEdge = matchingEdges.find((e) => e?.sourceHandle === "default");
      }
      if (!targetEdge && matchingEdges.length > 0) {
        targetEdge = matchingEdges[0];
      }

      if (replyText) {
        const userMsg: SimMessage = {
          id: `usr_${Date.now()}`,
          sender: "user",
          text: replyText,
          time: getCurrentTimeString(),
        };
        setHistory((prev) => [...prev, userMsg]);
      }

      if (!targetEdge || !targetEdge.target) {
        return;
      }

      const nextId = targetEdge.target;
      setIsTyping(true);

      setTimeout(() => {
        setIsTyping(false);
        const nextMsg = buildNodeMessage(nextId);
        if (nextMsg) {
          setHistory((prev) => [...prev, nextMsg]);
          setCurrentNodeId(nextId);

          // If next node does NOT wait for user input, automatically cascade forward!
          if (!isInteractiveNode(nextId)) {
            setTimeout(() => {
              const nextType = nodeTypeMap[nextId];
              let nextHandle = "default";
              if (nextType === "condition") {
                nextHandle = "cond:true";
              }
              advanceRef.current?.(nextId, nextHandle, undefined, depth + 1);
            }, 600);
          }
        }
      }, 450);
    },
    [edgeOrder, edgeMap, buildNodeMessage, isInteractiveNode, nodeTypeMap]
  );
  advanceRef.current = advanceFromNode;

  // Initialize or restart full simulation
  const restartSimulation = useCallback(() => {
    setCollectedData({});
    if (!startNodeId) {
      setHistory([]);
      setCurrentNodeId(null);
      return;
    }

    const firstMsg = buildNodeMessage(startNodeId);
    if (firstMsg) {
      setHistory([firstMsg]);
      setCurrentNodeId(startNodeId);

      if (!isInteractiveNode(startNodeId)) {
        setTimeout(() => {
          advanceFromNode(startNodeId, "default", undefined, 1);
        }, 600);
      }
    } else {
      setHistory([]);
      setCurrentNodeId(null);
    }
  }, [startNodeId, buildNodeMessage, isInteractiveNode, advanceFromNode]);

  useEffect(() => {
    if (mode === "full" && history.length === 0 && startNodeId) {
      restartSimulation();
    }
  }, [mode, startNodeId, history.length, restartSimulation]);

  // User clicked a button or quick reply
  const handleOptionClick = (btnId: string, label: string, isQuickReply: boolean) => {
    if (!currentNodeId) return;
    const handleKey = isQuickReply ? `qr:${btnId}` : `btn:${btnId}`;
    advanceFromNode(currentNodeId, handleKey, label);
  };

  // User submitted text in data collection
  const handleUserSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!userInput.trim() || !currentNodeId) return;
    const val = userInput.trim();
    setUserInput("");

    // Save to collectedData if node is data_collection
    const cfg = configMap[currentNodeId];
    if (isRecord(cfg) && isRecord(cfg["target"])) {
      const fieldKey = text(cfg["target"]["key"]);
      if (fieldKey) {
        setCollectedData((prev) => ({ ...prev, [fieldKey]: val }));
      }
    }

    advanceFromNode(currentNodeId, "default", val);
  };

  return (
    <section
      className="fb-preview"
      aria-label="Interactive Preview"
      style={{
        padding: "12px 10px 30px",
        background: "#f8fafc",
        maxHeight: "none",
        height: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
    >
      {/* ── Mode Switcher & Tools Bar ─────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "14px",
          background: "#ffffff",
          padding: "8px 10px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        {/* Segmented Mode Switcher */}
        <div
          style={{
            display: "flex",
            background: "#f1f5f9",
            padding: "3px",
            borderRadius: "8px",
            gap: "3px",
          }}
        >
          <button
            type="button"
            onClick={() => setMode("full")}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: mode === "full" ? 600 : 500,
              borderRadius: "6px",
              cursor: "pointer",
              border: "none",
              background: mode === "full" ? "#ffffff" : "transparent",
              color: mode === "full" ? "#0f172a" : "#64748b",
              boxShadow: mode === "full" ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" : "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <IconSmartphone width={14} height={14} style={{ color: mode === "full" ? "#0284c7" : "currentColor" }} />
            <span>Simulation</span>
          </button>
          <button
            type="button"
            onClick={() => setMode("single")}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: mode === "single" ? 600 : 500,
              borderRadius: "6px",
              cursor: "pointer",
              border: "none",
              background: mode === "single" ? "#ffffff" : "transparent",
              color: mode === "single" ? "#0f172a" : "#64748b",
              boxShadow: mode === "single" ? "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" : "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s ease",
            }}
          >
            <IconCrosshair width={14} height={14} style={{ color: mode === "single" ? "#0284c7" : "currentColor" }} />
            <span>Single Step</span>
          </button>
        </div>

        {/* Actions Sub-bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: "2px",
          }}
        >
          {mode === "full" ? (
            <button
              type="button"
              onClick={restartSimulation}
              title="Restart conversation simulation from the beginning"
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#475569",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                padding: "4px 9px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
            >
              <IconRotateCcw width={12} height={12} />
              <span>Restart Chat</span>
            </button>
          ) : (
            <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500, paddingLeft: "4px" }}>
              Active Node Preview
            </span>
          )}

          <button
            type="button"
            onClick={() => setUseSampleData(!useSampleData)}
            title="Toggle sample contact variables (Alex Johnson, etc.)"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: useSampleData ? "#047857" : "#64748b",
              background: useSampleData ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${useSampleData ? "#a7f3d0" : "#e2e8f0"}`,
              borderRadius: "6px",
              padding: "4px 9px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 0.15s ease",
            }}
          >
            <IconCheck
              width={11}
              height={11}
              strokeWidth={3}
              style={{
                color: useSampleData ? "#059669" : "#cbd5e1",
                opacity: useSampleData ? 1 : 0.4,
              }}
            />
            <span>{useSampleData ? "Sample Data: ON" : "Raw {{tags}}"}</span>
          </button>
        </div>
      </div>

      {/* ── Realistic Smartphone Frame ────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: "340px",
          margin: "0 auto",
          background: "#0f172a",
          padding: "10px",
          borderRadius: "36px",
          boxShadow: "0 20px 30px -10px rgba(15, 23, 42, 0.35), 0 0 0 2px #334155",
        }}
      >
        <div
          style={{
            background: "#efeae2",
            borderRadius: "28px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            height: "480px",
            position: "relative",
          }}
        >
          {/* Phone Status Bar */}
          <div
            style={{
              height: "24px",
              background: "#075e54",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              color: "#ffffff",
              fontSize: "10px",
              fontWeight: 600,
            }}
          >
            <span>9:41</span>
            <div style={{ width: "60px", height: "12px", background: "#054c44", borderRadius: "10px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <IconSignal width={12} height={12} />
              <IconBattery width={14} height={14} />
            </div>
          </div>

          {/* WhatsApp Header */}
          <div
            style={{
              height: "46px",
              background: "#075e54",
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              color: "#ffffff",
              gap: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              zIndex: 2,
            }}
          >
            <IconChevronLeft width={18} height={18} style={{ cursor: "pointer", opacity: 0.9 }} />
            <div
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "50%",
                background: "#128c7e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              <IconBot width={18} height={18} stroke="#ffffff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {flow?.name || "WhatsApp Bot"}
              </div>
              <div style={{ fontSize: "10px", color: "#a7f3d0", display: "flex", alignItems: "center", gap: "3px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#4ade80" }} />
                <span>online</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", opacity: 0.9 }}>
              <IconVideo width={15} height={15} stroke="#ffffff" />
              <IconPhone width={14} height={14} stroke="#ffffff" />
              <IconMoreVertical width={14} height={14} fill="#ffffff" stroke="none" />
            </div>
          </div>

          {/* Chat Messages Screen */}
          <div
            ref={screenRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 10px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "#efeae2",
              backgroundImage:
                "radial-gradient(#d1d5db 0.75px, transparent 0.75px), radial-gradient(#d1d5db 0.75px, #efeae2 0.75px)",
              backgroundSize: "20px 20px",
              backgroundPosition: "0 0, 10px 10px",
            }}
          >
            {/* Encryption Notice */}
            <div
              style={{
                textAlign: "center",
                fontSize: "9px",
                color: "#54656f",
                background: "#ffeecd",
                padding: "4px 8px",
                borderRadius: "6px",
                margin: "0 auto 4px",
                boxShadow: "0 1px 1px rgba(0,0,0,0.06)",
                maxWidth: "85%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              <IconLock width={10} height={10} />
              <span>Messages are end-to-end encrypted.</span>
            </div>

            {mode === "full" ? (
              history.length === 0 ? (
                <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", marginTop: "40px" }}>
                  <p>No messages in flow yet.</p>
                  <p style={{ fontSize: "11px", marginTop: "4px" }}>Add a step on the canvas to preview it.</p>
                </div>
              ) : (
                history.map((item) => (
                  <MessageBubble
                    key={item.id}
                    msg={item}
                    formatText={formatText}
                    onOptionClick={handleOptionClick}
                    onSelectStep={(nId) => store.getState().setSelection({ nodes: [nId], edges: [] })}
                  />
                ))
              )
            ) : selectedNodeId && nodeType ? (
              <SingleStepPreview
                nodeId={selectedNodeId}
                type={nodeType}
                config={config}
                formatText={formatText}
                time={getCurrentTimeString()}
              />
            ) : (
              <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", marginTop: "40px" }}>
                <p>Pick a step on canvas to preview.</p>
              </div>
            )}

            {isTyping ? (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: "#ffffff",
                  padding: "6px 12px",
                  borderRadius: "14px",
                  fontSize: "11px",
                  color: "#64748b",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
                }}
              >
                <span>typing</span>
                <span style={{ animation: "pulse 1s infinite" }}>...</span>
              </div>
            ) : null}
          </div>

          {/* Interactive Chat Input Bar */}
          <form
            onSubmit={handleUserSubmit}
            style={{
              background: "#f0f2f5",
              padding: "6px 8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderTop: "1px solid #e2e8f0",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", cursor: "pointer", color: "#54656f" }}>
              <IconSmile width={18} height={18} />
            </span>
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type user reply..."
              style={{
                flex: 1,
                border: "none",
                borderRadius: "18px",
                padding: "6px 12px",
                fontSize: "12px",
                background: "#ffffff",
                outline: "none",
                boxShadow: "0 1px 1px rgba(0,0,0,0.05)",
              }}
            />
            <span style={{ display: "flex", alignItems: "center", cursor: "pointer", color: "#54656f" }}>
              <IconPaperclip width={16} height={16} />
            </span>
            <button
              type="submit"
              disabled={!userInput.trim()}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: userInput.trim() ? "#00a884" : "#94a3b8",
                border: "none",
                color: "#ffffff",
                cursor: userInput.trim() ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSend width={12} height={12} />
            </button>
          </form>
        </div>
      </div>

      <div style={{ marginTop: "10px", textAlign: "center", fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
        <IconInfo width={13} height={13} />
        <span>Tap buttons or type in input bar to test full conversation flow.</span>
      </div>
    </section>
  );
}

// ── Message Bubble Component ──────────────────────────────────────────────────
function MessageBubble({
  msg,
  formatText,
  onOptionClick,
  onSelectStep,
}: {
  msg: SimMessage;
  formatText: (t: string) => string;
  onOptionClick?: (btnId: string, label: string, isQuickReply: boolean) => void;
  onSelectStep?: (nodeId: string) => void;
}) {
  if (msg.sender === "system") {
    let icon = <IconSettings width={12} height={12} />;
    if (msg.nodeType === "smart_delay") icon = <IconClock width={12} height={12} />;
    if (msg.nodeType === "condition") icon = <IconGitBranch width={12} height={12} />;
    if (msg.nodeType === "external_request") icon = <IconGlobe width={12} height={12} />;
    if (msg.nodeType === "action") icon = <IconZap width={12} height={12} />;

    return (
      <div style={{ textAlign: "center", margin: "4px 0" }}>
        <span
          onClick={() => msg.nodeId && onSelectStep?.(msg.nodeId)}
          style={{
            fontSize: "10px",
            color: "#475569",
            background: "#e2e8f0",
            padding: "3px 10px",
            borderRadius: "9999px",
            cursor: msg.nodeId ? "pointer" : "default",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            boxShadow: "0 1px 1px rgba(0,0,0,0.05)",
          }}
        >
          {icon}
          <span>{msg.text}</span>
        </span>
      </div>
    );
  }

  if (msg.sender === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "80%",
          background: "#d9fdd3",
          padding: "6px 10px 4px",
          borderRadius: "10px 10px 2px 10px",
          boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
          fontSize: "12px",
          color: "#111b21",
          wordBreak: "break-word",
        }}
      >
        <div>{msg.text}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "3px", marginTop: "2px" }}>
          <span style={{ fontSize: "9px", color: "#667781" }}>{msg.time}</span>
          <span style={{ fontSize: "10px", color: "#53bdeb" }}>✓✓</span>
        </div>
      </div>
    );
  }

  // Bot Message
  const hasBlocks = Array.isArray(msg.blocks) && msg.blocks.length > 0;

  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "86%", display: "flex", flexDirection: "column", gap: "6px" }}>
      {hasBlocks ? (
        msg.blocks!.map((b, idx) => (
          <BlockCard
            key={idx}
            block={b}
            time={msg.time}
            formatText={formatText}
            onSelectNode={() => msg.nodeId && onSelectStep?.(msg.nodeId)}
          />
        ))
      ) : msg.text ? (
        <div
          onClick={() => msg.nodeId && onSelectStep?.(msg.nodeId)}
          style={{
            background: "#ffffff",
            padding: "6px 10px 4px",
            borderRadius: "10px 10px 10px 2px",
            boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
            fontSize: "12px",
            color: "#111b21",
            wordBreak: "break-word",
            cursor: "pointer",
          }}
        >
          <div>{formatText(msg.text)}</div>
          <div style={{ textAlign: "right", marginTop: "2px", fontSize: "9px", color: "#667781" }}>{msg.time}</div>
        </div>
      ) : null}

      {/* CTA Buttons list */}
      {msg.buttons && msg.buttons.length > 0 ? (
        <div
          style={{
            background: "#ffffff",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
            marginTop: "-2px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {msg.buttons.map((btn, idx) => (
            <button
              key={btn.id || idx}
              type="button"
              onClick={() => onOptionClick?.(btn.id, btn.label, false)}
              style={{
                background: "transparent",
                border: "none",
                borderTop: idx > 0 ? "1px solid #f1f5f9" : "none",
                padding: "8px 12px",
                color: "#0284c7",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
              }}
            >
              {btn.action === "url" ? <IconExternalLink width={13} height={13} /> : <IconCursorClick width={13} height={13} />}
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Quick Replies chips */}
      {msg.quick_replies && msg.quick_replies.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "2px" }}>
          {msg.quick_replies.map((qr, idx) => (
            <button
              key={qr.id || idx}
              type="button"
              onClick={() => onOptionClick?.(qr.id, qr.label, true)}
              style={{
                background: "#ffffff",
                border: "1px solid #00a884",
                color: "#00a884",
                borderRadius: "14px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
              {qr.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Block Card Renderer (Images, Audios, Videos, Files, Cards) ───────────────
function BlockCard({
  block,
  time,
  formatText,
  onSelectNode,
}: {
  block: Record<string, unknown>;
  time: string;
  formatText: (t: string) => string;
  onSelectNode?: () => void;
}) {
  const env = useBuilder((state) => state.env);
  const kind = text(block["type"]) || "text";
  const bodyText = text(block["text"]);
  const caption = text(block["caption"]);
  const directUrl = text(block["url"]);
  const mediaId = text(block["media_id"]);
  const { url: resolvedUrl, asset: resolvedAsset } = useResolvedMedia(mediaId, directUrl, env);
  const activeUrl = resolvedUrl || directUrl;

  if (kind === "text") {
    return (
      <div
        onClick={onSelectNode}
        style={{
          background: "#ffffff",
          padding: "6px 10px 4px",
          borderRadius: "10px 10px 10px 2px",
          boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
          fontSize: "12px",
          color: "#111b21",
          wordBreak: "break-word",
          cursor: "pointer",
        }}
      >
        <div>{formatText(bodyText || "No message text")}</div>
        <div style={{ textAlign: "right", marginTop: "2px", fontSize: "9px", color: "#667781" }}>{time}</div>
      </div>
    );
  }

  if (kind === "image") {
    return (
      <div
        onClick={onSelectNode}
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          cursor: "pointer",
        }}
      >
        {activeUrl ? (
          <img
            src={activeUrl}
            alt={caption || resolvedAsset?.alt_text || "Attached image"}
            style={{ width: "100%", maxHeight: "200px", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              height: "120px",
              background: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#4338ca",
              fontSize: "12px",
              fontWeight: 600,
              gap: "6px",
            }}
          >
            <IconImage width={32} height={32} />
            <span>Image Attached</span>
          </div>
        )}
        {caption ? (
          <div style={{ padding: "6px 10px 4px", fontSize: "11px", color: "#111b21" }}>{formatText(caption)}</div>
        ) : null}
        <div style={{ padding: "0 10px 4px", textAlign: "right", fontSize: "9px", color: "#667781" }}>{time}</div>
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div
        onClick={onSelectNode}
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          padding: "8px 10px 4px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: "#00a884",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
            }}
          >
            <IconPlay width={13} height={13} />
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "2px" }}>
            {[4, 8, 14, 6, 12, 16, 10, 8, 14, 18, 10, 6, 12, 8, 16, 12, 6, 10].map((h, i) => (
              <span
                key={i}
                style={{
                  width: "2.5px",
                  height: `${h}px`,
                  background: i < 7 ? "#00a884" : "#cbd5e1",
                  borderRadius: "2px",
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: "10px", color: "#64748b" }}>0:18</span>
        </div>
        <div style={{ textAlign: "right", fontSize: "9px", color: "#667781" }}>{time}</div>
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div
        onClick={onSelectNode}
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          cursor: "pointer",
        }}
      >
        {activeUrl ? (
          <video
            src={activeUrl}
            controls
            style={{ width: "100%", maxHeight: "180px", display: "block", background: "#000000" }}
          />
        ) : (
          <div
            style={{
              height: "120px",
              background: "#1e293b",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              position: "relative",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconPlay width={18} height={18} />
            </div>
            <span style={{ fontSize: "11px", marginTop: "4px", opacity: 0.8 }}>Video (MP4)</span>
          </div>
        )}
        {caption ? (
          <div style={{ padding: "6px 10px 4px", fontSize: "11px", color: "#111b21" }}>{formatText(caption)}</div>
        ) : null}
        <div style={{ padding: "0 10px 4px", textAlign: "right", fontSize: "9px", color: "#667781" }}>{time}</div>
      </div>
    );
  }

  if (kind === "file") {
    const filename = resolvedAsset?.filename || (activeUrl ? activeUrl.split("/").pop() : "document.pdf");
    return (
      <div
        onClick={onSelectNode}
        style={{
          background: "#ffffff",
          borderRadius: "10px",
          padding: "8px 10px 4px",
          boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#f1f5f9", padding: "6px 8px", borderRadius: "6px" }}>
          <IconFile width={22} height={22} stroke="#334155" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {filename}
            </div>
            <div style={{ fontSize: "9px", color: "#64748b" }}>245 KB · PDF Document</div>
          </div>
          <IconDownload width={14} height={14} stroke="#00a884" />
        </div>
        {caption ? (
          <div style={{ padding: "4px 2px 2px", fontSize: "11px", color: "#111b21" }}>{formatText(caption)}</div>
        ) : null}
        <div style={{ textAlign: "right", marginTop: "2px", fontSize: "9px", color: "#667781" }}>{time}</div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelectNode}
      style={{
        background: "#ffffff",
        padding: "6px 10px 4px",
        borderRadius: "10px 10px 10px 2px",
        boxShadow: "0 1px 1px rgba(0,0,0,0.12)",
        fontSize: "12px",
        color: "#64748b",
        cursor: "pointer",
      }}
    >
      <div>[{kind.toUpperCase()}] {formatText(bodyText || caption || "Item")}</div>
      <div style={{ textAlign: "right", marginTop: "2px", fontSize: "9px", color: "#667781" }}>{time}</div>
    </div>
  );
}

// ── Single Step Inspector Preview ─────────────────────────────────────────────
function SingleStepPreview({
  nodeId,
  type,
  config,
  formatText,
  time,
}: {
  nodeId: string;
  type: string;
  config: unknown;
  formatText: (t: string) => string;
  time: string;
}) {
  const cfg = isRecord(config) ? config : {};

  if (type === "send_message") {
    const rawBlocks = records(cfg["blocks"]);
    const buttons = records(cfg["buttons"]).map((b) => ({
      id: text(b["id"]),
      label: text(b["label"]) || "Button",
      action: text(b["action"]) || "postback",
      url: text(b["url"]),
    }));
    const quick_replies = records(cfg["quick_replies"]).map((q) => ({
      id: text(q["id"]),
      label: text(q["label"]) || "Option",
    }));

    return (
      <MessageBubble
        msg={{
          id: `step_${nodeId}`,
          sender: "bot",
          nodeId,
          nodeType: type,
          blocks: rawBlocks,
          buttons,
          quick_replies,
          time,
        }}
        formatText={formatText}
      />
    );
  }

  if (type === "data_collection") {
    const qText = text(cfg["question"]) || "Please provide your answer:";
    const replyType = text(cfg["reply_type"]) || "text";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <MessageBubble
          msg={{
            id: `step_${nodeId}`,
            sender: "bot",
            nodeId,
            nodeType: type,
            text: qText,
            time,
          }}
          formatText={formatText}
        />
        <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "#e2e8f0", padding: "6px 10px", borderRadius: "8px", fontSize: "11px", color: "#475569" }}>
          Expected user input: <strong>{replyType.toUpperCase()}</strong>
        </div>
      </div>
    );
  }

  const specLabel = nodeSpec(type)?.label ?? type;
  return (
    <div style={{ textAlign: "center", padding: "20px 10px", color: "#64748b", fontSize: "12px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
        <IconSettings width={28} height={28} />
      </div>
      <div style={{ fontWeight: 600, color: "#1e293b" }}>{specLabel}</div>
      <div style={{ fontSize: "11px", marginTop: "4px" }}>This logic step does not display a message to the contact.</div>
    </div>
  );
}
