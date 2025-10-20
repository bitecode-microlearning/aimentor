import React, { useState } from "react";
import { Card } from "./ui/card";
import { Conversation } from "@elevenlabs/client";

interface MentorPanelProps {
  mentorName: string;
  userfirstname?: string;
  coursename?: string;
  lessonname?: string;
  content?: string;
  knowledgelevel?: string;
}

const MentorPanel: React.FC<MentorPanelProps> = ({
  mentorName,
  userfirstname,
  coursename,
  lessonname,
  content,
  knowledgelevel,
}) => {
  // --- UI and conversation state variables
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [conversationRef, setConversationRef] = useState<any>(null);

  const WORKER_AGENT_URL =
    "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/agent";

  /** ------------------------------------------------------------------
   * Start a new AI mentor session
   * ------------------------------------------------------------------ */
  const handleStartConversation = async () => {
    try {
      setIsListening(true);
      setShowChat(true);
      setMessages([{ role: "ai", text: "Calling your AI mentor..." }]);

      // --- 1️⃣ Request a signed session URL from the Cloudflare Worker
      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json();

      if (!res.ok || !data.signed_url) {
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "⚠️ Unable to get a signed session. Try again later." },
        ]);
        setIsListening(false);
        return;
      }

      const signedUrl = data.signed_url;
      console.log("🔐 Signed URL received:", signedUrl);

      // --- 2️⃣ Start the ElevenLabs conversation session
      //     (now correctly passing dynamicVariables directly)
      const convo = await Conversation.startSession({
        signedUrl,                     // or agentId if you prefer static mode
        connectionType: "websocket",   // required for real-time
        dynamicVariables: {
          userfirstname: userfirstname || "User",
          coursename: coursename || "Unknown Course",
          lessonname: lessonname || "Untitled Lesson",
          knowledgelevel: knowledgelevel || "beginner",
          content: content || "",
        },
        clientTools: {
          logMessage: async ({ message }) =>
            setMessages((prev) => [...prev, { role: "ai", text: message }]),

          onUserMessage: async ({ message }) =>
            setMessages((prev) => [...prev, { role: "user", text: message }]),

          onEnd: async () =>
            setMessages((prev) => [
              ...prev,
              { role: "ai", text: "✅ Conversation ended." },
            ]),
        },
      });

      // --- 3️⃣ Store reference for later
      setConversationRef(convo);
      setIsListening(false);
      setIsSpeaking(true);

      // Optional info message
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: "📡 Dynamic variables sent to ElevenLabs successfully.",
        },
      ]);
    } catch (err) {
      console.error("❌ Conversation start error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "❌ Error starting conversation." },
      ]);
      setIsListening(false);
    }
  };

  /** ------------------------------------------------------------------
   * Send a follow-up question during an active session
   * ------------------------------------------------------------------ */
  const handleAskQuestion = async () => {
    if (!conversationRef) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "ℹ️ Start the session first." },
      ]);
      return;
    }

    try {
      setIsListening(true);
      const userQuestion = "Can you explain this concept in more detail?";
      setMessages((prev) => [...prev, { role: "user", text: userQuestion }]);
      await conversationRef.sendUserMessage(userQuestion);
    } catch (e) {
      console.error("sendUserMessage error", e);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "❌ Failed to send message." },
      ]);
    } finally {
      setIsListening(false);
    }
  };

  /** ------------------------------------------------------------------
   * End the current conversation manually
   * ------------------------------------------------------------------ */
  const handleEndConversation = async () => {
    try {
      if (conversationRef && conversationRef.endSession) {
        await conversationRef.endSession();
        setMessages((prev) => [
          ...prev,
          { role: "ai", text: "👋 Session closed by user." },
        ]);
      }
    } catch (e) {
      console.error("endSession error", e);
    } finally {
      setIsSpeaking(false);
      setConversationRef(null);
    }
  };

  return (
    <Card className="p-6 bg-white rounded-3xl shadow-md border border-gray-200">
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">
          🎓 {mentorName} – Your AI Mentor
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Start an interactive conversation with your mentor.
        </p>

        {/* --- Control buttons --- */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleStartConversation}
            disabled={isListening}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-md transition"
          >
            {isListening ? "Calling your AI mentor..." : "Call your AI mentor"}
          </button>

          {isSpeaking && (
            <>
              <button
                onClick={handleAskQuestion}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-md transition"
              >
                Ask a question
              </button>
              <button
                onClick={handleEndConversation}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold shadow-md transition"
              >
                End session
              </button>
            </>
          )}
        </div>

        {/* --- Chat log --- */}
        {showChat && (
          <div
            id="chatLog"
            className="mt-5 text-left p-4 bg-gray-50 rounded-lg max-h-80 overflow-y-auto text-sm"
          >
            {messages.map((msg, i) => (
              <div key={i} className="mb-1">
                <b>
                  {msg.role === "ai"
                    ? "🤖 Mentor"
                    : msg.role === "user"
                    ? "👤 You"
                    : msg.role}
                  :
                </b>{" "}
                {msg.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default MentorPanel;
