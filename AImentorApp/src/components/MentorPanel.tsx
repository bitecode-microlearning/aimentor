import React, { useEffect, useRef, useState } from "react";
import { Conversation } from "@elevenlabs/client";
import { Button } from "./ui/button";
import { MentorControlBar } from "./MentorControlBar";
import {
  debugMentorControls,
  getReadableError,
  isMentorAskingQuestion,
  type MentorControlState,
} from "./mentorControls";
import { Coffee, MessageSquare, Volume2 } from "lucide-react";
import buyMeACoffeeCup from "./img/buymeacoffee-cup.gif";

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

type TokenAvailabilityDebug = {
  availableTokens?: number;
  characterCount?: number;
  characterLimit?: number;
  minimumAvailableTokens?: number;
  configuredMinimumAvailableTokens?: string | number | null;
};

const ESTIMATED_SESSION_SECONDS = 5 * 60;
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/bitecode";

const mentorVideos = Object.entries(
  import.meta.glob("./img/*.mp4", { eager: true, query: "?url", import: "default" })
)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  .map(([, videoUrl]) => videoUrl as string);

const pickRandomMentorVideo = () => mentorVideos[Math.floor(Math.random() * mentorVideos.length)];

const formatTokenCount = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "unknown";
  }

  return new Intl.NumberFormat("en-US").format(value);
};

const getTokenDebugMessage = (data: any) => {
  const tokenAvailability = data?.debug?.tokenAvailability as TokenAvailabilityDebug | undefined;

  if (!data?.debug?.debugMode || !tokenAvailability) {
    return "";
  }

  return [
    `Token availability checked: ${formatTokenCount(tokenAvailability.availableTokens)} available`,
    `minimum required ${formatTokenCount(tokenAvailability.minimumAvailableTokens)}`,
    `used ${formatTokenCount(tokenAvailability.characterCount)} of ${formatTokenCount(tokenAvailability.characterLimit)}`,
    `configured limit ${String(tokenAvailability.configuredMinimumAvailableTokens ?? "default")}`,
  ].join(", ");
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [isTokenSupportScreenVisible, setIsTokenSupportScreenVisible] = useState(false);
  const [connectionStatusMessage, setConnectionStatusMessage] = useState("");
  const [tokenSupportDebugMessage, setTokenSupportDebugMessage] = useState("");
  const [mentorVideo] = useState(pickRandomMentorVideo);

  const conversationRef = useRef<ConversationInstance | null>(null);
  const unmuteTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const stateRef = useRef<MentorControlState>("idle");
  const userManuallyMutedRef = useRef(false);
  const lastMentorMessageRef = useRef("");
  const previousSafeStateRef = useRef<MentorControlState>("muted_waiting");

  const mentorVideoSrc = ((mentorVideo as any)?.default as string) || (mentorVideo as string);
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

  const clearProgressTimer = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
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

  const switchToMentorSpeaking = () => {
    previousSafeStateRef.current = "mentor_speaking";
    setUserManuallyMuted(false);
    userManuallyMutedRef.current = false;
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
  };

  const resetSessionState = (nextState: MentorControlState = "disconnected") => {
    conversationRef.current = null;
    clearPendingUnmute();
    userManuallyMutedRef.current = false;
    setUserManuallyMuted(false);
    setIsMicMuted(true);
    setLastMentorMessage("");
    lastMentorMessageRef.current = "";
    setConnectionStatusMessage("");
    sessionStartedAtRef.current = null;
    clearProgressTimer();
    setSessionProgress(0);
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

      if (stateRef.current === "mentor_waiting_for_answer" || stateRef.current === "user_question_mode" || stateRef.current === "user_speaking") {
        switchToMentorSpeaking();
      }
    }
  };

  const handleModeChange = (modeEvent: any) => {
    const nextMode = String(modeEvent?.mode ?? modeEvent ?? "").toLowerCase();
    debugMentorControls("mode event", modeEvent);

    if (nextMode === "speaking") {
      switchToMentorSpeaking();
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
      clearProgressTimer();
      conversationRef.current?.endSession?.();
      conversationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSessionActive) {
      clearProgressTimer();
      return;
    }

    if (!sessionStartedAtRef.current) {
      sessionStartedAtRef.current = Date.now();
    }

    const updateProgress = () => {
      const startedAt = sessionStartedAtRef.current ?? Date.now();
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const nextProgress = Math.min(100, (elapsedSeconds / ESTIMATED_SESSION_SECONDS) * 100);
      setSessionProgress(nextProgress);
    };

    updateProgress();
    clearProgressTimer();
    progressTimerRef.current = window.setInterval(updateProgress, 1000);

    return clearProgressTimer;
  }, [isSessionActive]);

  const handleStartConversation = async () => {
    if (mentorSessionState === "connecting" || isSessionActive) return;

    setErrorMessage(null);
    setIsTokenSupportScreenVisible(false);
    setTokenSupportDebugMessage("");
    setControlState("connecting");
    setIsMicMuted(true);
    sessionStartedAtRef.current = Date.now();
    setSessionProgress(0);
    setConnectionStatusMessage("Loading mentor configuration...");

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

      setConnectionStatusMessage("Checking token availability and requesting a signed mentor session...");
      const res = await fetch(WORKER_AGENT_URL);
      const data = await res.json().catch(() => null);
      const tokenDebugMessage = getTokenDebugMessage(data);

      if (tokenDebugMessage) {
        setConnectionStatusMessage(`${tokenDebugMessage}. Starting ElevenLabs session...`);
      } else {
        setConnectionStatusMessage("Starting ElevenLabs session...");
      }

      if (!res.ok || !data?.signed_url) {
        if (data?.code === "TOKEN_LIMIT_EXCEEDED") {
          setErrorMessage(null);
          setTokenSupportDebugMessage(tokenDebugMessage);
          resetSessionState("error");
          setIsTokenSupportScreenVisible(true);
          return;
        }

        if (typeof data?.error === "string" && data.error.trim()) {
          throw new Error(data.error);
        }

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
      setConnectionStatusMessage("");
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

  const handleMuteToggle = () => {
    const nextMuted = !isMicMuted;

    if (mentorSessionState === "mentor_waiting_for_answer") {
      userManuallyMutedRef.current = nextMuted;
      setUserManuallyMuted(nextMuted);
    }

    setMicrophoneMuted(nextMuted);
  };

  const handleDone = () => {
    switchToMentorSpeaking();
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
    if (mentorSessionState === "mentor_waiting_for_answer") return "Your turn";
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
        <video
          key={mentorVideoSrc}
          src={mentorVideoSrc}
          aria-label="Mentor"
          autoPlay
          muted
          loop
          playsInline
          className="h-full w-full object-cover object-top lg:object-contain lg:object-center"
          style={{
            filter: isSessionActive ? "brightness(0.72)" : "brightness(1)",
            transition: "filter 0.3s ease",
          }}
          onError={(event: React.SyntheticEvent<HTMLVideoElement, Event>) => {
            debugMentorControls("mentor video failed to load", (event.target as HTMLVideoElement).currentSrc);
          }}
        />
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

      {isTokenSupportScreenVisible && (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-[#F6F6F6] px-7 py-8 sm:px-12">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center gap-7 text-[#202124]">
            <div className="flex justify-center">
              <img
                src={buyMeACoffeeCup}
                alt=""
                aria-hidden="true"
                className="block h-40 w-40 rounded-lg object-contain sm:h-48 sm:w-48"
              />
            </div>
            <div className="space-y-5 text-left">
              <h2 className="text-3xl font-semibold leading-tight">The mentor is taking a short break</h2>
              <p className="text-base leading-7 text-[#4A4F55]">
                The shared ElevenLabs token budget is currently too low to start a new AI mentor session. This limit
                protects the free community service from running past its available monthly quota.
              </p>
              <p className="text-base leading-7 text-[#4A4F55]">
                BiteCode stays free and ad-free thanks to community support. A small contribution helps add more
                available mentor tokens for everyone.
              </p>
              {tokenSupportDebugMessage && (
                <p className="rounded-md bg-white/70 px-3 py-2 text-xs leading-5 text-[#5F6368]">
                  {tokenSupportDebugMessage}
                </p>
              )}
            </div>
            <Button
              asChild
              size="lg"
              className="w-full rounded-full bg-[#00CE8D] text-white shadow-xl hover:bg-[#00b87d] sm:w-fit"
            >
              <a href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noreferrer">
                <Coffee size={18} />
                Support BiteCode
              </a>
            </Button>
          </div>
        </div>
      )}

      {!isTokenSupportScreenVisible && (isSessionActive || mentorSessionState === "disconnected" || mentorSessionState === "error") && (
        <div
          className="mentor-status-bar"
          title={lastMentorMessage || undefined}
        >
          <div className="mentor-status-content">
            {mentorSessionState === "mentor_speaking" && <Volume2 className="mentor-status-icon mentor-status-icon-green" size={24} />}
            {mentorSessionState === "connecting" && <div className="mentor-status-spinner" />}
            <div className="mentor-status-text">
              <p>{getStatusLabel()}</p>
              {mentorSessionState === "mentor_waiting_for_answer" && userManuallyMuted && (
                <span>You muted manually. The app will wait until the next mentor question.</span>
              )}
              {mentorSessionState === "connecting" && connectionStatusMessage && <span>{connectionStatusMessage}</span>}
              {errorMessage && <strong>{errorMessage}</strong>}
            </div>
          </div>
          <div
            className="mentor-status-progress mentor-status-progress-bottom"
            role="progressbar"
            aria-label="Estimated session progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(sessionProgress)}
          >
            <div
              className="mentor-status-progress-fill"
              style={{
                width: `${isSessionActive ? Math.max(sessionProgress, 8) : 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {!isTokenSupportScreenVisible && mentorSessionState === "idle" && (
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

      {!isTokenSupportScreenVisible && (mentorSessionState === "disconnected" || mentorSessionState === "error") && (
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

      {!isTokenSupportScreenVisible && (
        <MentorControlBar
          state={mentorSessionState}
          isMicMuted={isMicMuted}
          isBusy={isActionBusy}
          onMuteToggle={handleMuteToggle}
          onDone={handleDone}
          onCancelAsk={handleCancelAsk}
          onEndSession={handleEndConversation}
        />
      )}
    </div>
  );
};

export default MentorPanel;
