import React, { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import mentorPhoto from "./img/AI_anna.gif";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { MentorControlBar } from "./MentorControlBar";
import {
  debugMentorControls,
  getReadableError,
  isMentorAskingQuestion,
  type MentorControlState,
  type SpeakingSpeedPreference,
} from "./mentorControls";
import { MessageSquare, Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";

interface MentorPanelProps {
  userfirstname?: string;
  coursename?: string;
  lessonname?: string;
  content?: string;
  knowledgelevel?: string;
}

type ConversationInstance = {
  endSession?: () => Promise<void> | void;
  setMicMuted?: (muted: boolean) => Promise<void> | void;
  sendUserMessage?: (message: string) => Promise<void> | void;
  sendContextualUpdate?: (message: string) => Promise<void> | void;
  sendUserActivity?: () => Promise<void> | void;
};

const MentorPanel: React.FC<MentorPanelProps> = ({
  userfirstname,
  coursename,
  lessonname,
  content,
  knowledgelevel,
}) => {
  const [mentorSessionState, setMentorSessionState] = useState<MentorControlState>("idle");
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [userManuallyMuted, setUserManuallyMuted] = useState(false);
  const [lastMentorMessage, setLastMentorMessage] = useState("");
  const [speedPreference, setSpeedPreference] = useState<SpeakingSpeedPreference>("normal");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);

  const conversationRef = useRef<ConversationInstance | null>(null);
  const unmuteTimerRef = useRef<number | null>(null);
  const stateRef = useRef<MentorControlState>("idle");
  const userManuallyMutedRef = useRef(false);
  const lastMentorMessageRef = useRef("");
  const previousSafeStateRef = useRef<MentorControlState>("muted_waiting");

  const mentorPhotoSrc = ((mentorPhoto as any)?.default as string) || (mentorPhoto as string);
  const isSessionActive =
    mentorSessionState !== "idle" &&
    mentorSessionState !== "disconnected" &&
    mentorSessionState !== "error";

  const setControlState = (nextState: MentorControlState) => {
    debugMentorControls("state change", { from: stateRef.current, to: nextState });
    stateRef.current = nextState;
    setMentorSessionState(nextState);
  };

  const clearPendingUnmute = () => {
    if (unmuteTimerRef.current !== null) {
      window.clearTimeout(unmuteTimerRef.current);
      unmuteTimerRef.current = null;
    }
  };

  const setMicrophoneMuted = (muted: boolean) => {
    clearPendingUnmute();
    setIsMicMuted(muted);

    try {
      const muteResult = conversationRef.current?.setMicMuted?.(muted);
      if (muteResult && typeof (muteResult as Promise<void>).catch === "function") {
        (muteResult as Promise<void>).catch((error) => {
          debugMentorControls("failed to update microphone", error);
          setErrorMessage("Could not update the microphone state.");
          setControlState("error");
        });
      }
      debugMentorControls(muted ? "microphone muted" : "microphone unmuted");
    } catch (error) {
      debugMentorControls("failed to update microphone", error);
      setErrorMessage("Could not update the microphone state.");
      setControlState("error");
    }
  };

  const resetSessionState = (nextState: MentorControlState = "disconnected") => {
    conversationRef.current = null;
    clearPendingUnmute();
    userManuallyMutedRef.current = false;
    setUserManuallyMuted(false);
    setIsMicMuted(true);
    setSpeedPreference("normal");
    setLastMentorMessage("");
    lastMentorMessageRef.current = "";
    setIsActionBusy(false);
    setControlState(nextState);
  };

  const sendMentorInstruction = async (instruction: string) => {
    const conversation = conversationRef.current;

    if (!conversation) {
      setErrorMessage("The mentor session is not connected.");
      setControlState("error");
      return;
    }

    setIsActionBusy(true);
    try {
      if (conversation.sendUserMessage) {
        await conversation.sendUserMessage(instruction);
      } else if (conversation.sendContextualUpdate) {
        await conversation.sendContextualUpdate(instruction);
      } else {
        throw new Error("This ElevenLabs SDK instance cannot send user messages.");
      }
    } catch (error) {
      setErrorMessage(getReadableError(error));
      setControlState("error");
    } finally {
      setIsActionBusy(false);
    }
  };

  const extractMessageText = (message: any) => {
    return String(message?.message ?? message?.text ?? message?.transcript ?? "");
  };

  const extractMessageSource = (message: any) => {
    return String(message?.source ?? message?.role ?? "").toLowerCase();
  };

  const handleMentorMessage = (message: any) => {
    const text = extractMessageText(message);
    const source = extractMessageSource(message);

    if (!text) return;

    if (source === "user") {
      if (stateRef.current === "mentor_waiting_for_answer" || stateRef.current === "user_question_mode") {
        setControlState("user_speaking");
      }
      return;
    }

    if (source === "ai" || source === "agent" || source === "assistant") {
      lastMentorMessageRef.current = text;
      setLastMentorMessage(text);
      debugMentorControls("mentor message", text);
    }
  };

  const handleModeChange = (modeEvent: any) => {
    const nextMode = String(modeEvent?.mode ?? modeEvent ?? "").toLowerCase();
    debugMentorControls("mode event", modeEvent);

    if (nextMode === "speaking") {
      if (stateRef.current === "user_question_mode" || stateRef.current === "user_speaking") return;
      previousSafeStateRef.current = "mentor_speaking";
      setUserManuallyMuted(false);
      userManuallyMutedRef.current = false;
      setControlState("mentor_speaking");
      return;
    }

    if (nextMode === "listening") {
      if (stateRef.current === "user_question_mode" || stateRef.current === "user_speaking") return;

      if (isMentorAskingQuestion(lastMentorMessageRef.current)) {
        userManuallyMutedRef.current = false;
        setUserManuallyMuted(false);
        setControlState("mentor_waiting_for_answer");
      } else {
        setControlState("muted_waiting");
      }
      return;
    }

    debugMentorControls("unexpected mode event", modeEvent);
  };

  useEffect(() => {
    if (!conversationRef.current) return;

    clearPendingUnmute();

    if (mentorSessionState === "mentor_speaking" || mentorSessionState === "connecting" || mentorSessionState === "muted_waiting") {
      setMicrophoneMuted(true);
      return;
    }

    if (mentorSessionState === "mentor_waiting_for_answer") {
      if (userManuallyMutedRef.current) {
        setMicrophoneMuted(true);
        return;
      }

      unmuteTimerRef.current = window.setTimeout(() => {
        setMicrophoneMuted(false);
      }, 200);
      return clearPendingUnmute;
    }

    if (mentorSessionState === "user_question_mode" || mentorSessionState === "user_speaking") {
      setMicrophoneMuted(false);
    }

    return clearPendingUnmute;
  }, [mentorSessionState]);

  useEffect(() => {
    return () => {
      clearPendingUnmute();
      conversationRef.current?.endSession?.();
      conversationRef.current = null;
    };
  }, []);

  const handleStartConversation = async () => {
    if (mentorSessionState === "connecting" || isSessionActive) return;

    setErrorMessage(null);
    setControlState("connecting");
    setIsMicMuted(true);

    try {
      let WORKER_AGENT_URL: string | undefined;
      try {
        const cfg = await import("../config/workerConfig");
        WORKER_AGENT_URL = cfg?.WORKER_AGENT_URL;
      } catch (error) {
        throw new Error(`Failed to load agent config: ${getReadableError(error)}`);
      }

      if (!WORKER_AGENT_URL) {
        throw new Error("Missing WORKER_AGENT_URL in src/config/workerConfig.ts");
      }

      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json();

      if (!res.ok || !data.signed_url) {
        throw new Error("Unable to get a signed mentor session. Please try again later.");
      }

      const convo = await Conversation.startSession({
        signedUrl: data.signed_url,
        connectionType: "websocket",
        dynamicVariables: {
          userfirstname: userfirstname || "User",
          coursename: coursename || "Unknown Course",
          lessonname: lessonname || "Untitled Lesson",
          knowledgelevel: knowledgelevel || "beginner",
          content: content || "",
        },
        onConnect: () => {
          debugMentorControls("session connected");
        },
        onDisconnect: () => {
          debugMentorControls("session disconnected");
          resetSessionState("disconnected");
        },
        onError: (error: unknown) => {
          setErrorMessage(getReadableError(error));
          resetSessionState("error");
        },
        onStatusChange: (status: any) => {
          debugMentorControls("status event", status);
        },
        onModeChange: handleModeChange,
        onMessage: handleMentorMessage,
        clientTools: {
          logMessage: async (payload: any) => {
            handleMentorMessage({ source: "agent", message: payload?.message ?? payload });
          },
          onUserMessage: async (payload: any) => {
            handleMentorMessage({ source: "user", message: payload?.message ?? payload });
          },
          onEnd: async () => {
            resetSessionState("disconnected");
          },
        },
      });

      conversationRef.current = convo as ConversationInstance;
      setMicrophoneMuted(true);
      debugMentorControls("dynamic variables sent", { userfirstname, coursename, lessonname, knowledgelevel });
    } catch (error) {
      setErrorMessage(getReadableError(error));
      resetSessionState("error");
    }
  };

  const handleEndConversation = async () => {
    if (isActionBusy) return;

    const conversation = conversationRef.current;
    setIsActionBusy(true);
    setMicrophoneMuted(true);

    try {
      if (conversation?.endSession) {
        await conversation.endSession();
      }
      resetSessionState("disconnected");
    } catch (error) {
      setErrorMessage(`Failed to end session cleanly: ${getReadableError(error)}`);
      resetSessionState("error");
    }
  };

  const handleRepeat = () => {
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("Please repeat the last explanation briefly and clearly. Do not introduce a new concept.");
  };

  const handleSlower = () => {
    setSpeedPreference("slow");
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("Please continue slower, use shorter sentences, and pause slightly between ideas.");
  };

  const handleFaster = () => {
    setSpeedPreference("fast");
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("Please continue a bit faster and be more concise. Keep the explanation clear.");
  };

  const handleAsk = async () => {
    if (!conversationRef.current) return;

    previousSafeStateRef.current = stateRef.current === "mentor_speaking" ? "mentor_speaking" : "muted_waiting";
    userManuallyMutedRef.current = false;
    setUserManuallyMuted(false);
    setControlState("user_question_mode");
    setMicrophoneMuted(false);

    try {
      await conversationRef.current.sendUserActivity?.();
    } catch (error) {
      debugMentorControls("failed to send user activity", error);
    }
  };

  const handleHint = () => {
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("Give the learner a small hint for the current question, but do not reveal the full answer.");
  };

  const handleSkip = () => {
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("Skip this question. Briefly explain the correct answer, then continue with the lesson.");
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMicMuted;

    if (mentorSessionState === "mentor_waiting_for_answer") {
      userManuallyMutedRef.current = nextMuted;
      setUserManuallyMuted(nextMuted);
    }

    setMicrophoneMuted(nextMuted);
  };

  const handleDone = () => {
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    sendMentorInstruction("I'm done answering. Please evaluate my answer and continue.");
  };

  const handleCancelAsk = () => {
    userManuallyMutedRef.current = true;
    setUserManuallyMuted(true);
    setMicrophoneMuted(true);
    setControlState(previousSafeStateRef.current === "mentor_speaking" ? "muted_waiting" : previousSafeStateRef.current);
  };

  const getStatusLabel = () => {
    if (mentorSessionState === "connecting") return "Connecting...";
    if (mentorSessionState === "mentor_speaking") return "Mentor is explaining...";
    if (mentorSessionState === "mentor_waiting_for_answer") return "Your turn - microphone is on";
    if (mentorSessionState === "user_question_mode") return "Listening to your question...";
    if (mentorSessionState === "user_speaking") return "Listening to your answer...";
    if (mentorSessionState === "muted_waiting") return "Mentor is paused";
    if (mentorSessionState === "error") return "Mentor session error";
    if (mentorSessionState === "disconnected") return "Mentor session ended";
    return "";
  };

  return (
    <div className="relative h-full min-h-[500px] overflow-hidden rounded-3xl bg-gradient-to-br from-[#F6F6F6] to-[#ECE9E6] lg:min-h-[600px]">
      <div className="absolute left-0 right-0 top-0 h-[66%] overflow-hidden lg:h-full">
        <img
          src={mentorPhotoSrc}
          alt="Mentor"
          className="h-full w-full object-cover object-top lg:object-contain lg:object-center"
          style={{
            filter: isSessionActive ? "brightness(0.72)" : "brightness(1)",
            transition: "filter 0.3s ease",
          }}
          onError={(event: React.SyntheticEvent<HTMLImageElement, Event>) => {
            debugMentorControls("mentor image failed to load", (event.target as HTMLImageElement).src);
          }}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

      {isSessionActive && (
        <div className="absolute right-4 top-4 z-20">
          <Button
            type="button"
            onClick={handleEndConversation}
            disabled={isActionBusy && mentorSessionState === "connecting"}
            aria-label="End mentor session"
            className="min-h-11 rounded-full bg-red-500 px-4 text-white shadow-2xl hover:bg-red-600 disabled:opacity-60"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <PhoneOff size={18} />
              End session
            </span>
          </Button>
        </div>
      )}

      {(isSessionActive || mentorSessionState === "disconnected" || mentorSessionState === "error") && (
        <div className="absolute left-4 right-4 top-4 z-10 pr-0 sm:pr-44">
          <Card className="border-0 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm" title={lastMentorMessage || undefined}>
            <div className="flex items-center gap-3">
              {mentorSessionState === "mentor_speaking" && <Volume2 className="text-[#00CE8D]" size={24} />}
              {(mentorSessionState === "mentor_waiting_for_answer" || mentorSessionState === "user_question_mode" || mentorSessionState === "user_speaking") &&
                (isMicMuted ? <MicOff className="text-[#FE9613]" size={24} /> : <Mic className="text-[#00CE8D]" size={24} />)}
              {mentorSessionState === "connecting" && <div className="h-4 w-4 rounded-full border-2 border-[#FE9613] animate-pulse" />}
              <div>
                <p className="font-medium text-[#333333]">{getStatusLabel()}</p>
                {speedPreference !== "normal" && isSessionActive && (
                  <p className="text-xs text-[#666666]">Speed preference: {speedPreference}</p>
                )}
                {mentorSessionState === "mentor_waiting_for_answer" && userManuallyMuted && (
                  <p className="text-xs text-[#666666]">You muted manually. The app will wait until the next mentor question.</p>
                )}
                {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
              </div>
            </div>
          </Card>
        </div>
      )}

      {mentorSessionState === "idle" && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button
            type="button"
            onClick={handleStartConversation}
            size="lg"
            className="rounded-full bg-[#00CE8D] text-white shadow-2xl hover:bg-[#00b87d] disabled:opacity-60"
          >
            <span className="flex items-center gap-3 px-4 py-2 font-medium">
              <MessageSquare size={20} />
              Start lesson
            </span>
          </Button>
        </div>
      )}

      {(mentorSessionState === "disconnected" || mentorSessionState === "error") && (
        <div className="absolute bottom-4 right-4 z-10">
          <Button
            type="button"
            onClick={handleStartConversation}
            size="lg"
            className="rounded-full bg-[#1376C8] text-white shadow-2xl hover:bg-[#0f5a99] disabled:opacity-60"
          >
            <span className="flex items-center gap-3 px-4 py-2 font-medium">
              <MessageSquare size={20} />
              Restart session
            </span>
          </Button>
        </div>
      )}

      <MentorControlBar
        state={mentorSessionState}
        isMicMuted={isMicMuted}
        speedPreference={speedPreference}
        isBusy={isActionBusy}
        onRepeat={handleRepeat}
        onSlower={handleSlower}
        onFaster={handleFaster}
        onAsk={handleAsk}
        onHint={handleHint}
        onSkip={handleSkip}
        onMuteToggle={handleMuteToggle}
        onDone={handleDone}
        onCancelAsk={handleCancelAsk}
        onEndSession={handleEndConversation}
      />
    </div>
  );
};

export default MentorPanel;
