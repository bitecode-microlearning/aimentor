import React, { useState, useEffect } from "react";
import { Conversation } from "@elevenlabs/client";
import mentorPhoto from "./img/AI_anna.gif";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { MessageSquare, Volume2, VolumeX } from "lucide-react";

interface MentorPanelProps {
  userfirstname?: string;
  coursename?: string;
  lessonname?: string;
  content?: string;
  knowledgelevel?: string;
}

const MentorPanel: React.FC<MentorPanelProps> = ({
  userfirstname,
  coursename,
  lessonname,
  content,
  knowledgelevel,
}) => {
  // --- UI and conversation state variables
  const [conversationRef, setConversationRef] = useState<any>(null);
  const [conversationState, setConversationState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");

  const mentorName = "AI Mentor";

  const WORKER_AGENT_URL =
    "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/agent";

  /** ------------------------------------------------------------------
   * Start a new AI mentor session
   * ------------------------------------------------------------------ */
  const handleStartConversation = async () => {
    try {
  setConversationState("listening");

      // --- 1️⃣ Request a signed session URL from the Cloudflare Worker
      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json();

      if (!res.ok || !data.signed_url) {
        console.warn("⚠️ Unable to get a signed session. Try again later.");
        setConversationState("idle");
        return;
      }

      const signedUrl = data.signed_url;
      console.log("🔐 Signed URL received:", signedUrl);

      console.log("Sending initial parameters to Elevenlabs: ", userfirstname, coursename, lessonname, knowledgelevel, content);

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
          logMessage: async (payload: any) => {
            const message = payload?.message ?? payload;
            // AI produced output — switch to speaking state
            console.log("AI ->", message);
            setConversationState("speaking");
          },

          onUserMessage: async (payload: any) => {
            const message = payload?.message ?? payload;
            console.log("User ->", message);
          },

          onEnd: async () => {
            console.log("Conversation ended.");
            setConversationState("idle");
          },
        },
      });

      // --- 3️⃣ Store reference for later
      // store session reference and mark as thinking while we wait for AI
      setConversationRef(convo);
      setConversationState("thinking");
      console.log("📡 Dynamic variables sent to ElevenLabs successfully.");
    } catch (err) {
      console.error("❌ Conversation start error:", err);
      console.error("❌ Error starting conversation.");
      setConversationState("idle");
    }
  };

  /** ------------------------------------------------------------------
   * Send a follow-up question during an active session
   * ------------------------------------------------------------------ */
  // single-button flow — ask or end handled via handleStartConversation / handleEndConversation

  /** ------------------------------------------------------------------
   * End the current conversation manually
   * ------------------------------------------------------------------ */
  const handleEndConversation = async () => {
    try {
      if (conversationRef && conversationRef.endSession) {
        await conversationRef.endSession();
        console.log("👋 Session closed by user.");
      }
    } catch (e) {
      console.error("endSession error", e);
    } finally {
      setConversationRef(null);
      setConversationState("idle");
    }
  };

  return (
  <div className="relative h-full min-h-[500px] lg:min-h-[600px] rounded-3xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Mentor Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${mentorPhoto})`,
          filter: conversationState === 'listening' || conversationState === 'speaking' ? 'brightness(0.7)' : 'brightness(1)',
          transition: 'filter 0.3s ease'
        }}
      />
      
      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      
      {/* Status Indicator (shows when not idle) */}
      {conversationState !== "idle" && (
        <div className="absolute top-4 left-4 right-4 z-10">
          <Card className="bg-white/95 backdrop-blur-sm px-4 py-3 shadow-lg border-0">
            <div className="flex items-center gap-3">
              {conversationState === "listening" && (
                <>
                  <div className="flex gap-1">
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                    <div className="w-1 h-6 bg-[#1376C8] rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[#1376C8]">Listening...</span>
                </>
              )}

              {conversationState === "thinking" && (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-[#F59E0B] animate-pulse" />
                  <span className="text-[#F59E0B]">Thinking...</span>
                </>
              )}

              {conversationState === "speaking" && (
                <>
                  <Volume2 className="text-[#00CE8D] animate-pulse" size={24} />
                  <span className="text-[#00CE8D]">{mentorName} is speaking...</span>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
      
      {/* Chat removed - single-button flow */}
      
      {/* Control Buttons */}
      <div className="absolute bottom-4 right-4 z-10">
        <Button
          onClick={conversationState === "idle" ? handleStartConversation : handleEndConversation}
          disabled={conversationState === "listening" || conversationState === "thinking"}
          size="lg"
          className="bg-[#00CE8D] hover:bg-[#00b87d] text-white shadow-2xl rounded-full w-16 h-16 p-0 disabled:opacity-60"
        >
          {conversationState === "idle" ? <MessageSquare size={28} /> : <VolumeX size={28} />}
        </Button>
      </div>
      
    </div>
  );
};

export default MentorPanel;
