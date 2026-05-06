import React, { useState, useEffect, useRef } from "react";
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
  const [conversationState, setConversationState] = useState<
    "idle" | "listening" | "thinking" | "speaking"
  >("idle");
  const [isMuted, setIsMuted] = useState(true);
  const conversationRef = useRef<any>(null);

  const mentorName = "AI Mentor";

  // Auto-mute when agent is speaking
  useEffect(() => {
    if (conversationState === "speaking") {
      setIsMuted(true);
    }
  }, [conversationState]);

  // Auto-enable unmute after agent finishes speaking (with delay to allow for response processing)
  useEffect(() => {
    if (conversationState === "listening" && isMuted) {
      // Small delay to ensure agent has fully stopped speaking
      const timer = setTimeout(() => {
        setIsMuted(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [conversationState, isMuted]);

  // Config error state: when present we show an error page instead of the Mentor UI.
  const [configError, setConfigError] = useState<string | null>(null);

  /** ------------------------------------------------------------------
   * Start a new AI mentor session
   * ------------------------------------------------------------------ */
  const handleStartConversation = async () => {
    try {
      // Dynamically import config and require WORKER_AGENT_URL to be present.
      let WORKER_AGENT_URL: string | undefined;
      try {
        const cfg = await import("../config/workerConfig");
        if (cfg && cfg.WORKER_AGENT_URL) {
          WORKER_AGENT_URL = cfg.WORKER_AGENT_URL;
        }
      } catch (cfgErr) {
        const errAny = cfgErr as any;
        const msg = errAny?.message ?? String(cfgErr);
        console.error("Failed to load agent config:", cfgErr);
        setConfigError(`Failed to load agent config: ${msg}`);
        return;
      }

      if (!WORKER_AGENT_URL) {
        const message = "Missing WORKER_AGENT_URL in src/config/agentConfig.ts";
        console.error(message);
        setConfigError(message);
        return;
      }

      // --- 1️⃣ Request a signed session URL from the Cloudflare Worker
      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json();

      if (!res.ok || !data.signed_url) {
        console.warn("⚠️ Unable to get a signed session. Try again later.");
        return;
      }

      const signedUrl = data.signed_url;
      console.log("🔐 Signed URL received:", signedUrl);

      console.log("Sending initial parameters to Elevenlabs: ", userfirstname, coursename, lessonname, knowledgelevel, content);

      // --- 2️⃣ Start the ElevenLabs conversation session
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
            console.log("AI ->", message);
            setConversationState("speaking");

            // Auto-transition back to listening after a delay (estimate speaking duration)
            // This is a heuristic - adjust the delay based on typical response lengths
            setTimeout(() => {
              if (conversationRef.current) {
                setConversationState("listening");
              }
            }, 2000); // 2 second delay - adjust as needed
          },

          onUserMessage: async (payload: any) => {
            const message = payload?.message ?? payload;
            console.log("User ->", message);
            setConversationState("thinking");
          },

          onEnd: async () => {
            console.log("Conversation ended.");
            setConversationState("idle");
          },
        },
      });

      conversationRef.current = convo;
      setConversationState("thinking");
      setIsMuted(true);
      console.log("📡 Dynamic variables sent to ElevenLabs successfully.");
    } catch (err) {
      console.error("❌ Conversation start error:", err);
      console.error("❌ Error starting conversation.");
    }
  };

  // Resolve image src (some bundlers return a module object with `default`)
  const mentorPhotoSrc = ((mentorPhoto as any)?.default as string) || (mentorPhoto as string);

  /** ------------------------------------------------------------------
   * Send a follow-up question during an active session
   * ------------------------------------------------------------------ */
  // single-button flow — ask or end handled via handleStartConversation / handleEndConversation

  /** ------------------------------------------------------------------
   * End the current conversation manually
   * ------------------------------------------------------------------ */
  const handleEndConversation = async () => {
    try {
      if (conversationRef.current && conversationRef.current.endSession) {
        await conversationRef.current.endSession();
        console.log("👋 Session closed by user.");
      }
    } catch (e) {
      console.error("endSession error", e);
    } finally {
      conversationRef.current = null;
      setConversationState("idle");
      setIsMuted(true);
    }
  };

  /** ------------------------------------------------------------------
   * Toggle microphone mute state
   * ------------------------------------------------------------------ */
  const handleToggleMute = () => {
    if (!conversationRef.current) return;

    setIsMuted(!isMuted);
    console.log(isMuted ? "🎤 Microphone unmuted" : "🔇 Microphone muted");
  };

  return (
  <div className="relative h-full min-h-[500px] lg:min-h-[600px] rounded-3xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100">
      {configError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <Card className="max-w-lg mx-6 p-6 text-center">
            <h3 className="text-lg font-semibold">Configuration error</h3>
            <p className="mt-2 text-sm text-muted-foreground">{configError}</p>
            <div className="mt-4">
              <Button onClick={() => setConfigError(null)}>Dismiss</Button>
            </div>
          </Card>
        </div>
      )}
      {/* Mentor Image: on mobile show top 2/3 (cropped bottom); on desktop show full image */}
      <div className="absolute left-0 right-0 top-0 h-[66%] lg:h-full overflow-hidden">
        {/* Use an <img> for reliable loading and object-position control */}
        <img
          src={mentorPhotoSrc}
          alt="Mentor"
          className="w-full h-full object-top object-cover lg:object-contain lg:object-center"
          style={{
            filter: conversationState === "listening" || conversationState === "speaking" ? "brightness(0.7)" : "brightness(1)",
            transition: "filter 0.3s ease",
          }}
          onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
            console.error("Mentor image failed to load:", (e.target as HTMLImageElement).src);
            // Don't set configError here; showing a config overlay hides the mentor UI entirely.
            // Keep the failure logged so you can inspect the network/console in the browser.
          }}
        />
      </div>
      
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
                  <span className="text-[#1376C8]">
                    {isMuted ? "Waiting for you to unmute..." : "Listening..."}
                  </span>
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
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-2">
            {conversationState === "listening" && (
              <Button
                onClick={handleToggleMute}
                size="lg"
                className={`rounded-full shadow-2xl disabled:opacity-60 ${
                  isMuted
                    ? "bg-[#1376C8] hover:bg-[#0f5a99] text-white"
                    : "bg-[#F59E0B] hover:bg-[#d97706] text-white"
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-2">
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  <span className="font-medium">
                    {isMuted ? "Unmute" : "Mute"}
                  </span>
                </div>
              </Button>
            )}

            {conversationState !== "idle" && isMuted && (
              <Button
                onClick={handleEndConversation}
                size="lg"
                className="bg-red-500 hover:bg-red-600 text-white shadow-2xl rounded-full"
              >
                <div className="flex items-center gap-3 px-4 py-2">
                  <VolumeX size={20} />
                  <span className="font-medium">Stop Conversation</span>
                </div>
              </Button>
            )}

            {conversationState === "idle" && (
              <Button
                onClick={handleStartConversation}
                disabled={conversationState === "thinking"}
                size="lg"
                className="bg-[#00CE8D] hover:bg-[#00b87d] text-white shadow-2xl rounded-full disabled:opacity-60"
              >
                <div className="flex items-center gap-3 px-4 py-2">
                  <MessageSquare size={20} />
                  <span className="font-medium">Start lesson..</span>
                </div>
              </Button>
            )}
          </div>
      
    </div>
  );
};

export default MentorPanel;
