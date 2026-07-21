import React, { useEffect, useRef, useState } from "react";

declare const __APP_BUILD_INFO__: {
  version: string;
  buildNumber: string;
  buildDate: string;
  commit: string;
};

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

const getBuildInfo = () => typeof __APP_BUILD_INFO__ !== "undefined" ? __APP_BUILD_INFO__ : {
  version: "unavailable",
  buildNumber: "unavailable",
  buildDate: "unavailable",
  commit: "unavailable",
};

export const formatMentorDebugLog = (events: MentorDebugEvent[]) => {
  const buildInfo = getBuildInfo();
  return [
  "BiteCode AI Mentor debug log",
  `Copied: ${new Date().toISOString()}`,
  `Version: ${buildInfo.version}`,
  `Build number: ${buildInfo.buildNumber}`,
  `Build date: ${buildInfo.buildDate}`,
  `Commit: ${buildInfo.commit}`,
  `Events: ${events.length}`,
  "",
  ...events.flatMap((event) => [
    `[${event.timestamp}] [${event.category.toUpperCase()}] ${event.label}`,
    ...(event.data === undefined ? [] : [formatDebugData(event.data)]),
    "",
  ]),
  ].join("\n").trimEnd();
};

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
  const [isExpanded, setIsExpanded] = useState(false);
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

  const handleDownloadLog = () => {
    const blob = new Blob([formatMentorDebugLog(events)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.href = url;
    link.download = `bitecode-ai-mentor-debug-${timestamp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mentor-debug-panel" aria-label="AI Mentor debug information">
      <div className="mentor-debug-header">
        <button
          type="button"
          className="mentor-debug-toggle"
          aria-expanded={isExpanded}
          aria-controls="mentor-debug-stream"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          <span className="mentor-debug-chevron" aria-hidden="true">{isExpanded ? "▼" : "▶"}</span>
          <span>AI Mentor debug</span>
          <span className="mentor-debug-event-count">{events.length}</span>
        </button>
        <div className="mentor-debug-actions">
          <span className="mentor-debug-live">LIVE</span>
          <button
            type="button"
            className="mentor-debug-copy"
            onClick={handleDownloadLog}
            disabled={events.length === 0}
          >
            Download log
          </button>
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
      <div
        id="mentor-debug-stream"
        className="mentor-debug-stream"
        role="log"
        aria-live="polite"
        hidden={!isExpanded}
      >
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
