import React, { useState } from "react";
import { Conversation } from "@elevenlabs/client";

const WORKER_URL =
  "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/agent";

interface MentorPanelProps {
  userName: string;
}

const MentorPanel: React.FC<MentorPanelProps> = ({ userName }) => {
  const [isCalling, setIsCalling] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  function addMsg(sender: string, msg: string) {
    setLog((prev) => [...prev, `${sender}: ${msg}`]);
  }

  async function startMentor() {
    try {
      setIsCalling(true);
      addMsg("System", "Calling your AI mentor...");

      const res = await fetch(WORKER_URL);
      const data = await res.json();

      if (!data.signed_url) {
        addMsg("⚠️", "Worker did not return a signed_url.");
        console.error("Worker response:", data);
        setIsCalling(false);
        return;
      }

      const signedUrl = data.signed_url;
      console.log("🔐 Signed URL received:", signedUrl);

      const conversation = await Conversation.startSession({
        signedUrl,
        connectionType: "websocket",
        clientTools: {
          logMessage: async ({ message }) => addMsg("🤖", message),
          onUserMessage: async ({ message }) => addMsg("👤", message),
          onEnd: async () => addMsg("✅", "Conversation ended."),
        },
      });

      addMsg("System", "Connected to ElevenLabs successfully.");

      const convId =
        conversation?.conversationId ||
        conversation?.id ||
        conversation?.state?.conversationId;
      if (convId) console.log("🧠 Conversation ID:", convId);

      await conversation.sendUserMessage(
        `Hi ${userName}, let's start the mentoring session.`
      );
    } catch (err) {
      console.error("❌ Error starting conversation:", err);
      addMsg("❌", "Unexpected error occurred. See console for details.");
    } finally {
      setIsCalling(false);
    }
  }

  return (
    <div className="mentor-panel">
      <button onClick={startMentor} disabled={isCalling}>
        {isCalling ? "Calling your AI mentor..." : "Call your AI mentor"}
      </button>
      <div id="chatLog" className="chat-log">
        {log.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
      </div>
    </div>
  );
};

export default MentorPanel;
