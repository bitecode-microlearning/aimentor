import React, { useEffect, useRef, useState } from "react";

export type MentorDebugEvent = {
  id: number;
  timestamp: string;
  category: string;
  label: string;
  data?: unknown;
};

interface MentorDebugPanelProps {
  events: MentorDebugEvent[];
}

const formatDebugData = (data: unknown) => {
  if (data === undefined) return "";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
};

export const formatMentorDebugLog = (events: MentorDebugEvent[]) => [
  "BiteCode AI Mentor debug log",
  `Copied: ${new Date().toISOString()}`,
  `Events: ${events.length}`,
  "",
  ...events.flatMap((event) => [
    `[${event.timestamp}] [${event.category.toUpperCase()}] ${event.label}`,
    ...(event.data === undefined ? [] : [formatDebugData(event.data)]),
    "",
  ]),
].join("\n").trimEnd();

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard copy was rejected by the browser.");
};

export function MentorDebugPanel({ events }: MentorDebugPanelProps) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const resetCopyStateTimerRef = useRef<number | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [events]);

  useEffect(() => () => {
    if (resetCopyStateTimerRef.current !== null) {
      window.clearTimeout(resetCopyStateTimerRef.current);
    }
  }, []);

  const handleCopyLog = async () => {
    try {
      await copyText(formatMentorDebugLog(events));
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }

    if (resetCopyStateTimerRef.current !== null) {
      window.clearTimeout(resetCopyStateTimerRef.current);
    }
    resetCopyStateTimerRef.current = window.setTimeout(() => setCopyState("idle"), 2500);
  };

  return (
    <section className="mentor-debug-panel" aria-label="AI Mentor debug information">
      <div className="mentor-debug-header">
        <span>AI Mentor debug</span>
        <div className="mentor-debug-actions">
          <span className="mentor-debug-live">LIVE</span>
          <button
            type="button"
            className={`mentor-debug-copy mentor-debug-copy-${copyState}`}
            onClick={handleCopyLog}
            disabled={events.length === 0}
          >
            {copyState === "copied" ? "Copied" : copyState === "error" ? "Copy failed" : "Copy full log"}
          </button>
        </div>
      </div>
      <div className="mentor-debug-stream" role="log" aria-live="polite">
        {events.length === 0 ? (
          <div className="mentor-debug-empty">Waiting for session events…</div>
        ) : events.map((event) => (
          <article className="mentor-debug-entry" key={event.id}>
            <div className="mentor-debug-entry-heading">
              <time>{event.timestamp}</time>
              <span>{event.category}</span>
              <strong>{event.label}</strong>
            </div>
            {event.data !== undefined && <pre>{formatDebugData(event.data)}</pre>}
          </article>
        ))}
        <div ref={endRef} />
      </div>
    </section>
  );
}
