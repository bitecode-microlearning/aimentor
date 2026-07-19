import React, { useEffect, useRef, useState } from "react";
import { Conversation, type DisconnectionDetails } from "@elevenlabs/client";
import { Button } from "./ui/button";
import { MentorControlBar } from "./MentorControlBar";
import {
  debugMentorControls,
  getReadableError,
  isMentorAskingQuestion,
  type MentorControlState,
} from "./mentorControls";
import { Clock, Coffee, MessageSquare, Volume2 } from "lucide-react";
import buyMeACoffeeCup from "./img/buymeacoffee-cup.gif";
import {
  createLessonEvaluation,
  type LessonEvaluation,
  type LessonEvaluationInput,
} from "../domain/lessonUnderstanding";
import {
  normalizePresentationItems,
  normalizePresentationText,
  type AnswerFeedbackSlideInput,
  type CodeSlideInput,
  type LessonPresentationSlide,
  type QuestionSlideInput,
  type ReviewSlideInput,
  type SummarySlideInput,
  type TopicSlideInput,
} from "../domain/lessonPresentation";

interface MentorPanelProps {
  userfirstname?: string;
  coursename?: string;
  lessonname?: string;
  content?: string;
  knowledgelevel?: string;
  knowledgedomain?: string;
  userpreferences?: string;
  learningmemory?: string;
  knowledgestrengths?: string;
  knowledgegaps?: string;
  practicerecommendations?: string;
  mentorSessionId?: string;
  userId?: string;
  subscriptionId?: string;
  courseId?: string;
  lessonId?: string;
  signedData?: string;
  signedSig?: string;
  previousLessonEvaluation?: LessonEvaluation;
  onLessonEvaluationVisible?: (evaluation: LessonEvaluation, context: "previous" | "current") => void;
  onLessonPresentationChange?: (slide: LessonPresentationSlide | null) => void;
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

const ESTIMATED_SESSION_SECONDS = 480;
const USAGE_REGISTRATION_DELAY_MS = 60 * 1000;
const USAGE_REGISTRATION_RETRY_DELAYS_MS = [10 * 1000, 30 * 1000, 60 * 1000];
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

const formatElapsedTime = (elapsedSeconds: number) => {
  const safeElapsedSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const minutes = Math.floor(safeElapsedSeconds / 60);
  const seconds = safeElapsedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const getDisconnectMessage = (details: DisconnectionDetails): string | null => {
  if (details.reason === "user") return null;
  if (details.reason === "agent") {
    return details.closeReason?.trim()
      ? `The AI mentor ended the session: ${details.closeReason.trim()}`
      : "The AI mentor ended the session.";
  }

  const providerMessage = details.closeReason?.trim() || details.message?.trim();
  return providerMessage
    ? `The mentor connection ended unexpectedly: ${providerMessage}`
    : "The mentor connection ended unexpectedly. You can restart the session.";
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
  knowledgedomain,
  userpreferences,
  learningmemory,
  knowledgestrengths,
  knowledgegaps,
  practicerecommendations,
  mentorSessionId,
  userId,
  subscriptionId,
  courseId,
  lessonId,
  signedData,
  signedSig,
  previousLessonEvaluation,
  onLessonEvaluationVisible,
  onLessonPresentationChange,
}) => {
  const [mentorSessionState, setMentorSessionState] = useState<MentorControlState>("idle");
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [userManuallyMuted, setUserManuallyMuted] = useState(false);
  const [lastMentorMessage, setLastMentorMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [sessionProgress, setSessionProgress] = useState(0);
  const [sessionElapsedSeconds, setSessionElapsedSeconds] = useState(0);
  const [hasElevenLabsSessionStarted, setHasElevenLabsSessionStarted] = useState(false);
  const [isTokenSupportScreenVisible, setIsTokenSupportScreenVisible] = useState(false);
  const [connectionStatusMessage, setConnectionStatusMessage] = useState("");
  const [tokenSupportDebugMessage, setTokenSupportDebugMessage] = useState("");
  const [mentorVideo] = useState(pickRandomMentorVideo);
  const conversationRef = useRef<ConversationInstance | null>(null);
  const pendingCurrentEvaluationRef = useRef<LessonEvaluation | null>(null);
  const pendingSummarySlideRef = useRef<Extract<LessonPresentationSlide, { type: "summary" }> | null>(null);
  const presentationFinalizedRef = useRef(false);
  const unmuteTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const usageRegistrationTimerRef = useRef<number | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const usageRegistrationStartedRef = useRef(false);
  const stateRef = useRef<MentorControlState>("idle");
  const userManuallyMutedRef = useRef(false);
  const lastMentorMessageRef = useRef("");
  const previousSafeStateRef = useRef<MentorControlState>("muted_waiting");
  const userRequestedEndRef = useRef(false);
  const activeMentorSessionIdRef = useRef<string | null>(null);

  const mentorVideoSrc = ((mentorVideo as any)?.default as string) || (mentorVideo as string);
  const isSessionActive =
    mentorSessionState !== "idle" &&
    mentorSessionState !== "disconnected" &&
    mentorSessionState !== "error";
  const isLessonTimerActive = isSessionActive && hasElevenLabsSessionStarted;

  const finalizeLessonPresentation = () => {
    if (presentationFinalizedRef.current) return;
    presentationFinalizedRef.current = true;
    const completedEvaluation = pendingCurrentEvaluationRef.current;
    const completedSummary = pendingSummarySlideRef.current ?? (completedEvaluation ? {
      type: "summary" as const,
      title: lessonname || "Session complete",
      coveredTopics: [],
      encouragement: "Thanks for taking part in this AI mentor session.",
    } : null);
    pendingCurrentEvaluationRef.current = null;
    pendingSummarySlideRef.current = null;
    if (completedSummary) onLessonPresentationChange?.(completedSummary);
    if (completedEvaluation) onLessonEvaluationVisible?.(completedEvaluation, "current");
  };

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

  const clearUsageRegistrationTimer = () => {
    if (usageRegistrationTimerRef.current !== null) {
      window.clearTimeout(usageRegistrationTimerRef.current);
      usageRegistrationTimerRef.current = null;
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
    usageRegistrationStartedRef.current = false;
    clearProgressTimer();
    clearUsageRegistrationTimer();
    setSessionProgress(0);
    setSessionElapsedSeconds(0);
    setHasElevenLabsSessionStarted(false);
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
      clearUsageRegistrationTimer();
      conversationRef.current?.endSession?.();
      conversationRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isLessonTimerActive) {
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
      setSessionElapsedSeconds(Math.floor(elapsedSeconds));
    };

    updateProgress();
    clearProgressTimer();
    progressTimerRef.current = window.setInterval(updateProgress, 1000);

    return clearProgressTimer;
  }, [isLessonTimerActive]);

  const registerAIMentorUsage = async (usageUrl: string) => {
    if (!signedData || !signedSig) {
      debugMentorControls("usage registration skipped: missing signed lesson payload");
      return;
    }

    const requestBody = JSON.stringify({ data: signedData, sig: signedSig });
    const retryDelays = [0, ...USAGE_REGISTRATION_RETRY_DELAYS_MS];

    for (let attemptIndex = 0; attemptIndex < retryDelays.length; attemptIndex += 1) {
      if (retryDelays[attemptIndex] > 0) {
        await new Promise((resolve) => {
          usageRegistrationTimerRef.current = window.setTimeout(() => resolve(undefined), retryDelays[attemptIndex]);
        });
      }

      try {
        const res = await fetch(usageUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });

        if (res.ok) {
          debugMentorControls("usage registered");
          return;
        }

        debugMentorControls("usage registration failed", { status: res.status });
      } catch (error) {
        debugMentorControls("usage registration request failed", error);
      }
    }
  };

  const persistLessonEvaluation = async (evaluation: LessonEvaluation) => {
    if (!signedData || !signedSig || !activeMentorSessionIdRef.current) {
      throw new Error("The lesson evaluation could not be linked to this mentor session.");
    }
    const cfg = await import("../config/workerConfig");
    const evaluationUrl = cfg.WORKER_AGENT_URL?.replace(/\/agent\/?$/, "/evaluation");
    if (!evaluationUrl) throw new Error("The lesson evaluation service is unavailable.");
    const response = await fetch(evaluationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: signedData,
        sig: signedSig,
        mentorSessionId: activeMentorSessionIdRef.current,
        evaluation,
      }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(typeof result?.error === "string" ? result.error : "Lesson evaluation could not be saved.");
    }
    debugMentorControls("lesson evaluation saved", { status: evaluation.status });
  };

  const handleStartConversation = async () => {
    if (mentorSessionState === "connecting" || isSessionActive) return;

    pendingCurrentEvaluationRef.current = null;
    pendingSummarySlideRef.current = null;
    presentationFinalizedRef.current = false;
    onLessonPresentationChange?.(null);
    setErrorMessage(null);
    setIsTokenSupportScreenVisible(false);
    setTokenSupportDebugMessage("");
    setControlState("connecting");
    setIsMicMuted(true);
    sessionStartedAtRef.current = null;
    setSessionProgress(0);
    setSessionElapsedSeconds(0);
    setHasElevenLabsSessionStarted(false);
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

      if (!signedData || !signedSig) {
        throw new Error("Missing signed lesson data. Please reopen the lesson from your course email.");
      }

      setConnectionStatusMessage("Checking usage, token availability, and requesting a signed mentor session...");
      const res = await fetch(WORKER_AGENT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: signedData, sig: signedSig }),
      });
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

      const appResolvedBootstrap = data?.mentor_context_mode === "app_resolved";
      const activeMentorSessionId = data?.mentor_session_id || mentorSessionId;
      activeMentorSessionIdRef.current = activeMentorSessionId || null;
      if (appResolvedBootstrap && (!userId || !subscriptionId || !courseId || !lessonId || !activeMentorSessionId)) {
        throw new Error("This lesson link is missing AI Mentor context IDs. Please open the latest lesson link from your course email.");
      }

      const dynamicVariables = appResolvedBootstrap
        ? {
            user_id: userId!,
            subscription_id: subscriptionId!,
            course_id: courseId!,
            lesson_id: lessonId!,
            mentor_session_id: activeMentorSessionId,
            userfirstname: userfirstname || "User",
            coursename: coursename || "Unknown Course",
            lessonname: lessonname || "Untitled Lesson",
            knowledgelevel: knowledgelevel || "beginner",
            knowledgedomain: knowledgedomain || "",
            userpreferences: userpreferences || "",
            content: content || "",
            learningmemory: learningmemory || "[]",
            knowledgestrengths: knowledgestrengths || "[]",
            knowledgegaps: knowledgegaps || "[]",
            practicerecommendations: practicerecommendations || "[]",
            previous_lesson_evaluation: JSON.stringify(previousLessonEvaluation ?? null),
          }
        : {
            userfirstname: userfirstname || "User",
            coursename: coursename || "Unknown Course",
            lessonname: lessonname || "Untitled Lesson",
            knowledgelevel: knowledgelevel || "beginner",
            content: content || "",
            ...(mentorSessionId ? { mentor_session_id: mentorSessionId } : {}),
          };

      const convo = await Conversation.startSession({
        signedUrl: data.signed_url,
        connectionType: "websocket",
        dynamicVariables,
        onConnect: () => {
          debugMentorControls("session connected");
          sessionStartedAtRef.current = Date.now();
          setSessionProgress(0);
          setSessionElapsedSeconds(0);
          setHasElevenLabsSessionStarted(true);
        },
        onDisconnect: (details: DisconnectionDetails) => {
          const disconnectMessage = userRequestedEndRef.current ? null : getDisconnectMessage(details);
          debugMentorControls("session disconnected", {
            reason: details.reason,
            closeCode: "closeCode" in details ? details.closeCode : undefined,
          });
          finalizeLessonPresentation();
          setErrorMessage(disconnectMessage);
          userRequestedEndRef.current = false;
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
            finalizeLessonPresentation();
            resetSessionState("disconnected");
          },
          showLessonTopic: async (payload: TopicSlideInput) => {
            const title = normalizePresentationText(payload?.title, lessonname || "Current topic", 180);
            const points = normalizePresentationItems(payload?.points);
            onLessonPresentationChange?.({ type: "topic", title, points });
            return "Displayed the current topic in the lesson presentation area.";
          },
          showLessonReview: async (payload: ReviewSlideInput) => {
            const title = normalizePresentationText(payload?.title, "Topics to revisit", 180);
            const topics = normalizePresentationItems(payload?.topics);
            if (!topics.length) throw new Error("Lesson review requires at least one review topic.");
            if (previousLessonEvaluation) onLessonEvaluationVisible?.(previousLessonEvaluation, "previous");
            onLessonPresentationChange?.({ type: "review", title, topics });
            return "Displayed the lesson review topics. Continue the planned lesson without adding a reinforcement loop.";
          },
          showMentorQuestion: async (payload: QuestionSlideInput) => {
            const question = normalizePresentationText(payload?.question, "", 600);
            if (!question) throw new Error("Mentor question text is required.");
            const supportingText = normalizePresentationText(payload?.supportingText, "", 300);
            onLessonPresentationChange?.({
              type: "question",
              question,
              ...(supportingText ? { supportingText } : {}),
            });
            return "Displayed the exact question for the learner to read.";
          },
          showAnswerFeedback: async (payload: AnswerFeedbackSlideInput) => {
            const result = normalizePresentationText(payload?.result, "", 20).toLowerCase().replace(/[ -]+/g, "_");
            if (result !== "correct" && result !== "not_quite" && result !== "wrong") {
              throw new Error("Answer feedback result must be correct, not_quite, or wrong.");
            }
            const message = normalizePresentationText(payload?.message, "", 300);
            onLessonPresentationChange?.({
              type: "answer_feedback",
              result,
              ...(message ? { message } : {}),
            });
            return `Displayed ${result.replace("_", " ")} answer feedback. Continue the normal lesson flow without adding a retry loop solely because of this card.`;
          },
          showCodeExample: async (payload: CodeSlideInput) => {
            const code = normalizePresentationText(payload?.code, "", 6000);
            if (!code) throw new Error("Code or record content is required.");
            const title = normalizePresentationText(payload?.title, "Example", 180);
            const language = normalizePresentationText(payload?.language, "text", 40).toLowerCase();
            const explanation = normalizePresentationText(payload?.explanation, "", 500);
            onLessonPresentationChange?.({
              type: "code",
              title,
              language,
              code,
              ...(explanation ? { explanation } : {}),
            });
            return "Displayed the exact code or data example in the lesson presentation area.";
          },
          showDonationSlide: async () => {
            onLessonPresentationChange?.({ type: "donation" });
            return "Displayed the BiteCode ad-free support slide. Continue the conversation naturally.";
          },
          showSessionSummary: async (payload: SummarySlideInput) => {
            const coveredTopics = normalizePresentationItems(payload?.coveredTopics);
            const title = normalizePresentationText(payload?.title, lessonname || "Session complete", 180);
            const takeaway = normalizePresentationText(payload?.takeaway, "", 500);
            const encouragement = normalizePresentationText(payload?.encouragement, "Thanks for taking part in this AI mentor session.", 300);
            pendingSummarySlideRef.current = {
              type: "summary",
              title,
              coveredTopics,
              ...(takeaway ? { takeaway } : {}),
              encouragement,
            };
            return "Prepared the closing lesson summary. It will be displayed after the call ends.";
          },
          showPreviousLessonEvaluation: async () => {
            if (!previousLessonEvaluation) {
              debugMentorControls("previous lesson evaluation unavailable");
              return "No previous lesson evaluation is available. Continue without showing a result.";
            }
            onLessonEvaluationVisible?.(previousLessonEvaluation, "previous");
            return `The previous lesson result is available in the lesson content: ${previousLessonEvaluation.status}. Continue the normal lesson without adding a reinforcement loop.`;
          },
          reportLessonEvaluation: async (payload: LessonEvaluationInput) => {
            const totalQuestions = Number(payload?.totalQuestions);
            const correctAnswers = Number(payload?.correctAnswers);
            if (!Number.isInteger(totalQuestions) || totalQuestions <= 0 || !Number.isInteger(correctAnswers)) {
              throw new Error("Lesson evaluation requires valid correctAnswers and totalQuestions values.");
            }
            const evaluation = createLessonEvaluation({
              lessonId: String(lessonId || payload.lessonId || ""),
              lessonName: lessonname || payload.lessonName || "Current lesson",
              correctAnswers,
              totalQuestions,
              skippedAnswers: Number(payload.skippedAnswers ?? 0),
              uncertaintyDetected: Boolean(payload.uncertaintyDetected),
              explicitConfusionDetected: Boolean(payload.explicitConfusionDetected),
            });
            pendingCurrentEvaluationRef.current = evaluation;
            try {
              await persistLessonEvaluation(evaluation);
            } catch (error) {
              debugMentorControls("lesson evaluation persistence failed", getReadableError(error));
            }
            return `Processed the lesson outcome: ${evaluation.status}. Do not add another teaching or reinforcement loop. Finish the normal spoken wrap-up and end the session; the result will appear after the call ends.`;
          },
        },
      });

      conversationRef.current = convo as ConversationInstance;
      setMicrophoneMuted(true);
      if (!usageRegistrationStartedRef.current) {
        usageRegistrationStartedRef.current = true;
        const usageUrl = WORKER_AGENT_URL.replace(/\/agent\/?$/, "/usage");
        usageRegistrationTimerRef.current = window.setTimeout(() => {
          registerAIMentorUsage(usageUrl);
        }, USAGE_REGISTRATION_DELAY_MS);
      }
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
    userRequestedEndRef.current = true;
    setIsActionBusy(true);
    setMicrophoneMuted(true);

    try {
      if (conversation?.endSession) {
        await conversation.endSession();
      }
      resetSessionState("disconnected");
    } catch (error) {
      userRequestedEndRef.current = false;
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
    <div className="mentor-panel-shell relative h-full min-h-[500px] overflow-hidden rounded-3xl bg-gradient-to-br from-[#F6F6F6] to-[#ECE9E6] lg:min-h-[600px]">
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
        <div className="absolute inset-0 z-30 overflow-y-auto bg-[#F6F6F6] px-7 py-6 sm:px-12">
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center text-[#202124]">
            <div className="flex justify-center">
              <img
                src={buyMeACoffeeCup}
                alt=""
                aria-hidden="true"
                className="block rounded-lg"
                style={{ width: "120px", height: "120px", objectFit: "contain" }}
              />
            </div>
            <div className="text-left" style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "10px" }}>
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
              style={{ marginTop: "10px" }}
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
          {isLessonTimerActive && (
            <div className="mentor-session-timer" aria-label="Elapsed lesson time">
              <Clock size={15} aria-hidden="true" />
              <span>{formatElapsedTime(sessionElapsedSeconds)}</span>
            </div>
          )}
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
