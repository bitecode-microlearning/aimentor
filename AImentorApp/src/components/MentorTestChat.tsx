import React, { useState } from "react";

export interface TestChatMessage { role: "user" | "agent"; text: string; timestamp: string }

export function MentorTestChat({ messages, connected, onSend, onEnd, sessionId, lessonId }: {
  messages: TestChatMessage[]; connected: boolean;
  onSend: (text: string) => Promise<void>; onEnd: () => void;
  sessionId?: string; lessonId?: string;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy || !connected) return;
    setBusy(true); setError("");
    try { await onSend(draft.trim()); setDraft(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Message could not be sent."); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, sessionId, lessonId, messages }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "mentor-test-transcript.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section aria-label="Course test chat" className="rounded-2xl border bg-white p-5 mt-4 text-left">
    <h2 className="text-lg font-semibold">Course test chat</h2>
    <p className="text-sm text-gray-600">Text session · no lesson or recap delivery</p>
    <p role="status">{connected ? "Connected" : "Disconnected — start the mentor session to chat"}</p>
    <ol role="log" aria-label="Mentor test transcript" aria-live="polite" className="max-h-96 overflow-auto space-y-3 my-4">
      {messages.map((message, index) => <li key={index} data-role={message.role} className="rounded-lg bg-gray-50 p-3 whitespace-pre-wrap">
        <strong>{message.role === "user" ? "Tester" : "Mentor"}: </strong>{message.text}
      </li>)}
    </ol>
    <form onSubmit={send}>
      <label htmlFor="mentor-test-message">Message to mentor</label>
      <textarea id="mentor-test-message" value={draft} onChange={event => setDraft(event.target.value)} maxLength={10000}
        disabled={!connected || busy} rows={3} className="block w-full border rounded-lg p-3 my-2" />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={!connected || busy || !draft.trim()} className="rounded-lg bg-blue-600 text-white px-4 py-2 disabled:opacity-50">Send message</button>
        <button type="button" onClick={onEnd} disabled={!connected} className="border rounded-lg px-4 py-2">End test session</button>
        <button type="button" onClick={download} disabled={!messages.length} className="border rounded-lg px-4 py-2">Download transcript</button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  </section>;
}
