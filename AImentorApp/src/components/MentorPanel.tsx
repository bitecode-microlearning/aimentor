import React, { useEffect, useRef, useState } from "react";
import { Conversation, type DisconnectionDetails } from "@elevenlabs/client";
import { Button } from "./ui/button";
import { MentorControlBar } from "./MentorControlBar";
import {
  advanceVoiceActivitySamples,
  debugMentorControls,
  getHearingCheckRequest,
  getReadableError,
  isClosingFarewellMessage,
  isCurrentSessionGeneration,
  isMentorQuestionLeadIn,
  isRecoverableClientToolError,
  shouldAutoContinueMentorTurn,
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
  createInitialCoachingDiscussionSlide,
  createMainLessonTopicSlide,
  normalizeCoachingDiscussionPoints,
  normalizePresentationItems,
  initialLessonPhase,
  normalizeLessonPhase,
  normalizePresentationText,
  normalizeTrueFalseQuestion,
  PREVIOUS_REVIEW_QUESTION_COUNT,
  shouldDeferCalibrationPhase,
  type AnswerFeedbackSlideInput,
  type CodeSlideInput,
  type CoachingDiscussionSlideInput,
  type CoachingRecapSlideInput,
  type LessonPresentationSlide,
  type LessonPhase,
  type LessonPhaseInput,
  type QuestionSlideInput,
  type ReviewSlideInput,
  type SummarySlideInput,
  type TopicSlideInput,
} from "../domain/lessonPresentation";
import { formatSessionTopicHeader } from "./sessionTopicHeader";
import { MentorDebugPanel, type MentorDebugEvent } from "./MentorDebugPanel";

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
  userlearninggoal?: string;
  coursegoal?: string;
  courseprogress?: string;
  conversationtype?: string;
  relationshipperiodkey?: string;
  relationshippromptversion?: string;
  relationshipdefinition?: string;
  relationshipcontext?: string;
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
const INITIAL_LEARNER_RESPONSE_WAIT_MS = 15_000;
const HEARING_CHECK_RESPONSE_WAIT_MS = 4000;
const LEARNER_VOICE_ACTIVITY_THRESHOLD = 0.35;
const LEARNER_VOICE_ACTIVITY_SAMPLES = 2;
const STARTUP_CONTINUATION_REQUEST = "Hello.";
const TURN_CONTINUATION_REQUEST = "Please continue.";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/bitecode";
const mentorVideos = Object.entries(
  import.meta.glob("./img/*.mp4", { eager: true, query: "?url", import: "default" })
)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  .map(([, videoUrl]) => videoUrl as string);

const pickRandomMentorVideo = () => mentorVideos[Math.floor(Math.random() * mentorVideos.length)];

const MAX_DEBUG_EVENTS = 250;

const redactDebugValue = (value: unknown): unknown => {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(redactDebugValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey.includes("signed_url") || normalizedKey === "signedurl" || normalizedKey === "sig" || normalizedKey === "signature") {
      return [key, "[redacted]"];
    }
    return [key, redactDebugValue(item)];
  }));
};

const instrumentClientTools = <T extends Record<string, (...args: any[]) => any>>(
  tools: T,
  log: (category: string, label: string, data?: unknown) => void,
): T => Object.fromEntries(Object.entries(tools).map(([name, handler]) => [
  name,
  async (...args: any[]) => {
    log("tool", `${name} called`, args[0]);
    try {
      const result = await handler(...args);
      log("tool", `${name} completed`, result);
      return result;
    } catch (error) {
      log("error", `${name} failed`, error);
      throw error;
    }
  },
])) as T;

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

type AnswerFeedbackResult = "correct" | "not_quite" | "wrong";

async function playAnswerFeedbackSound(result: AnswerFeedbackResult) {
  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) return;

  const audioContext = new AudioContextConstructor() as AudioContext;
  if (audioContext.state === "suspended") await audioContext.resume();
  const patterns = {
    correct: [{ frequency: 523, offset: 0 }, { frequency: 659, offset: 0.11 }, { frequency: 784, offset: 0.22 }],
    not_quite: [{ frequency: 392, offset: 0 }, { frequency: 294, offset: 0.18 }],
    wrong: [{ frequency: 392, offset: 0 }, { frequency: 294, offset: 0.18 }],
  } satisfies Record<AnswerFeedbackResult, Array<{ frequency: number; offset: number }>>;

  for (const tone of patterns[result]) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + tone.offset;
    const end = start + 0.18;
    oscillator.type = result === "correct" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(result === "correct" ? 0.09075 : 0.066, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(end);
  }

  window.setTimeout(() => void audioContext.close(), 700);
}

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
  userlearninggoal,
  coursegoal,
  courseprogress,
  conversationtype,
  relationshipperiodkey,
  relationshippromptversion,
  relationshipdefinition,
  relationshipcontext,
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
  const [lessonPhase, setLessonPhase] = useState<LessonPhase | null>(null);
  const [tokenSupportDebugMessage, setTokenSupportDebugMessage] = useState("");
  const [debugMode, setDebugMode] = useState(false);
  const [debugEvents, setDebugEvents] = useState<MentorDebugEvent[]>([]);
  const debugModeRef = useRef(false);
  const debugEventIdRef = useRef(0);
  const [mentorVideo] = useState(pickRandomMentorVideo);
  const conversationRef = useRef<ConversationInstance | null>(null);
  const pendingCurrentEvaluationRef = useRef<LessonEvaluation | null>(null);
  const pendingSummarySlideRef = useRef<Extract<LessonPresentationSlide, { type: "summary" }> | null>(null);
  const presentationFinalizedRef = useRef(false);
  const closingSummaryCompletedRef = useRef(false);
  const closingEvaluationCompletedRef = useRef(false);
  const closingFarewellDetectedRef = useRef(false);
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
  const previousReviewActiveRef = useRef(false);
  const relationshipPhaseAcknowledgedRef = useRef(false);
  const previousReviewFeedbackCountRef = useRef(0);
  const deferredLessonPhaseRef = useRef<LessonPhase | null>(null);
  const pendingKnowledgeCheckPhaseRef = useRef<LessonPhase | null>(null);
  const lastDisplayedTopicTitleRef = useRef("");
  const learnerAnswerExpectedRef = useRef(false);
  const questionToolPendingRef = useRef(false);
  const learnerResponseTimerRef = useRef<number | null>(null);
  const hearingCheckIssuedRef = useRef(false);
  const hearingCheckSpokenRef = useRef(false);
  const learnerVoiceActivitySamplesRef = useRef(0);
  const learnerVoiceDetectedRef = useRef(false);
  const initialGreetingReceivedRef = useRef(false);
  const startupContinuationSentRef = useRef(false);
  const startupContinuationPendingRef = useRef(false);
  const lastAutoContinuedMentorMessageRef = useRef("");
  const sessionGenerationRef = useRef(0);

  const mentorVideoSrc = ((mentorVideo as any)?.default as string) || (mentorVideo as string);
  const isSessionActive =
    mentorSessionState !== "idle" &&
    mentorSessionState !== "disconnected" &&
    mentorSessionState !== "error";
  const isLessonTimerActive = isSessionActive && hasElevenLabsSessionStarted;

  const appendDebugEvent = (category: string, label: string, data?: unknown) => {
    if (!debugModeRef.current) return;
    const nextEvent: MentorDebugEvent = {
      id: ++debugEventIdRef.current,
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      category,
      label,
      ...(data === undefined ? {} : { data: redactDebugValue(data) }),
    };
    setDebugEvents((current) => [...current.slice(-(MAX_DEBUG_EVENTS - 1)), nextEvent]);
  };

  const applyLessonPhase = (phase: LessonPhase | null) => {
    setLessonPhase(phase);
  };

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
    appendDebugEvent("state", "control state changed", { from: stateRef.current, to: nextState });
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

  const clearLearnerResponseTimer = () => {
    if (learnerResponseTimerRef.current !== null) {
      window.clearTimeout(learnerResponseTimerRef.current);
      learnerResponseTimerRef.current = null;
    }
  };

  const resetSilenceRecovery = () => {
    clearLearnerResponseTimer();
    hearingCheckIssuedRef.current = false;
    hearingCheckSpokenRef.current = false;
    learnerVoiceActivitySamplesRef.current = 0;
    learnerVoiceDetectedRef.current = false;
  };

  const setMicrophoneMuted = (muted: boolean) => {
    clearPendingUnmute();
    setIsMicMuted(muted);
    appendDebugEvent("audio", muted ? "microphone muted" : "microphone unmuted");

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
    applyLessonPhase(null);
    previousReviewActiveRef.current = false;
    previousReviewFeedbackCountRef.current = 0;
    deferredLessonPhaseRef.current = null;
    pendingKnowledgeCheckPhaseRef.current = null;
    lastDisplayedTopicTitleRef.current = "";
    learnerAnswerExpectedRef.current = false;
    questionToolPendingRef.current = false;
    initialGreetingReceivedRef.current = false;
    startupContinuationSentRef.current = false;
    startupContinuationPendingRef.current = false;
    lastAutoContinuedMentorMessageRef.current = "";
    resetSilenceRecovery();
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

  const abortUnresponsiveSession = () => {
    const conversation = conversationRef.current;
    resetSilenceRecovery();
    userRequestedEndRef.current = true;
    setMicrophoneMuted(true);

    Promise.resolve(conversation?.endSession?.()).catch((error) => {
      debugMentorControls("failed to end unresponsive session", error);
    }).finally(() => {
      resetSessionState("disconnected");
      setErrorMessage("The session ended because no learner response was detected.");
    });
  };

  const requestHearingCheck = () => {
    const conversation = conversationRef.current;
    if (!conversation) return;

    clearLearnerResponseTimer();
    hearingCheckIssuedRef.current = true;
    hearingCheckSpokenRef.current = false;
    setMicrophoneMuted(true);
    setControlState("mentor_speaking");
    const request = getHearingCheckRequest();
    debugMentorControls("requesting learner hearing check");

    try {
      if (conversation.sendUserMessage) {
        Promise.resolve(conversation.sendUserMessage(request)).catch((error) => {
          debugMentorControls("hearing check failed", error);
        });
      } else if (conversation.sendContextualUpdate) {
        Promise.resolve(conversation.sendContextualUpdate(request)).catch((error) => {
          debugMentorControls("hearing check failed", error);
        });
      } else {
        debugMentorControls("conversation cannot request an agent hearing check");
      }
    } catch (error) {
      debugMentorControls("hearing check failed", error);
    }

  };

  const handleVadScore = ({ vadScore }: { vadScore: number }) => {
    if (stateRef.current !== "mentor_waiting_for_answer" || hearingCheckIssuedRef.current) return;

    learnerVoiceActivitySamplesRef.current = advanceVoiceActivitySamples(
      learnerVoiceActivitySamplesRef.current,
      vadScore,
      LEARNER_VOICE_ACTIVITY_THRESHOLD,
    );
    if (learnerVoiceActivitySamplesRef.current < LEARNER_VOICE_ACTIVITY_SAMPLES || learnerVoiceDetectedRef.current) return;

    learnerVoiceDetectedRef.current = true;
    clearLearnerResponseTimer();
    appendDebugEvent("audio", "learner voice detected; silence watchdog cancelled", { vadScore });
    setControlState("user_speaking");
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

    appendDebugEvent("message", source || "unknown source", message);

    if (!text) return;

    if (source === "user") {
      if (text.trim() === STARTUP_CONTINUATION_REQUEST) return;
      if (text.trim() === TURN_CONTINUATION_REQUEST) return;
      if (text.trim() === getHearingCheckRequest()) return;
      resetSilenceRecovery();
      if (
        stateRef.current === "mentor_waiting_for_answer"
        || stateRef.current === "user_question_mode"
        || stateRef.current === "user_speaking"
      ) {
        setMicrophoneMuted(true);
        setControlState("mentor_thinking");
      }
      return;
    }

    if (source === "ai" || source === "agent" || source === "assistant") {
      if (!initialGreetingReceivedRef.current) {
        initialGreetingReceivedRef.current = true;
      }
      lastMentorMessageRef.current = text;
      setLastMentorMessage(text);
      questionToolPendingRef.current = isMentorQuestionLeadIn(text);
      debugMentorControls("mentor message", text);

      if (
        closingSummaryCompletedRef.current &&
        closingEvaluationCompletedRef.current &&
        isClosingFarewellMessage(text)
      ) {
        closingFarewellDetectedRef.current = true;
      }

      if (stateRef.current === "mentor_waiting_for_answer" || stateRef.current === "user_question_mode" || stateRef.current === "user_speaking") {
        switchToMentorSpeaking();
      }
    }
  };

  const continueAfterInitialGreeting = () => {
    if (startupContinuationSentRef.current) return;
    const conversation = conversationRef.current;
    if (!conversation?.sendUserMessage) {
      startupContinuationPendingRef.current = true;
      appendDebugEvent("startup", "workflow continuation queued until SDK is ready");
      return;
    }

    startupContinuationPendingRef.current = false;
    startupContinuationSentRef.current = true;
    appendDebugEvent("startup", "continuing workflow after initial greeting");
    try {
      const continuation = conversation.sendUserMessage(STARTUP_CONTINUATION_REQUEST);
      if (continuation && typeof (continuation as Promise<void>).catch === "function") {
        (continuation as Promise<void>).catch((error) => {
          appendDebugEvent("error", "startup continuation failed", error);
          setErrorMessage("The mentor could not continue after its greeting.");
          setControlState("error");
        });
      }
    } catch (error) {
      appendDebugEvent("error", "startup continuation failed", error);
      setErrorMessage("The mentor could not continue after its greeting.");
      setControlState("error");
    }
  };

  const handleModeChange = (modeEvent: any) => {
    const nextMode = String(modeEvent?.mode ?? modeEvent ?? "").toLowerCase();
    debugMentorControls("mode event", modeEvent);
    appendDebugEvent("sdk", "mode changed", modeEvent);

    if (nextMode === "speaking") {
      clearLearnerResponseTimer();
      if (hearingCheckIssuedRef.current) {
        hearingCheckSpokenRef.current = true;
      }
      switchToMentorSpeaking();
      return;
    }

    if (nextMode === "listening") {
      if (closingFarewellDetectedRef.current) {
        closingFarewellDetectedRef.current = false;
        userRequestedEndRef.current = true;
        setMicrophoneMuted(true);
        const ending = conversationRef.current?.endSession?.();
        if (ending && typeof (ending as Promise<void>).catch === "function") {
          (ending as Promise<void>).catch((error) => {
            userRequestedEndRef.current = false;
            debugMentorControls("automatic closing failed", error);
            setErrorMessage("The lesson finished, but the connection could not close automatically.");
            setControlState("error");
          });
        }
        return;
      }

      if (hearingCheckIssuedRef.current && !hearingCheckSpokenRef.current) {
        setMicrophoneMuted(true);
        setControlState("mentor_speaking");
        return;
      }

      if (initialGreetingReceivedRef.current && !startupContinuationSentRef.current) {
        setMicrophoneMuted(true);
        setControlState("mentor_speaking");
        continueAfterInitialGreeting();
        return;
      }

      if (stateRef.current === "mentor_thinking") {
        setMicrophoneMuted(true);
        return;
      }

      const lastMentorMessage = lastMentorMessageRef.current.trim();
      if (questionToolPendingRef.current) {
        setMicrophoneMuted(true);
        setControlState("mentor_speaking");
        appendDebugEvent("question", "waiting for question tool after mentor lead-in");
        return;
      }
      if (
        shouldAutoContinueMentorTurn(lastMentorMessage, learnerAnswerExpectedRef.current)
        && lastAutoContinuedMentorMessageRef.current !== lastMentorMessage
      ) {
        lastAutoContinuedMentorMessageRef.current = lastMentorMessage;
        learnerAnswerExpectedRef.current = false;
        setMicrophoneMuted(true);
        setControlState("mentor_speaking");
        appendDebugEvent("continuation", "declarative mentor turn continued without learner acknowledgment");
        try {
          const continuation = conversationRef.current?.sendUserMessage?.(TURN_CONTINUATION_REQUEST);
          if (continuation && typeof (continuation as Promise<void>).catch === "function") {
            (continuation as Promise<void>).catch((error) => {
              appendDebugEvent("error", "automatic turn continuation failed", error);
            });
          }
        } catch (error) {
          appendDebugEvent("error", "automatic turn continuation failed", error);
        }
        return;
      }

      learnerAnswerExpectedRef.current = false;
      learnerVoiceActivitySamplesRef.current = 0;
      learnerVoiceDetectedRef.current = false;
      userManuallyMutedRef.current = false;
      setUserManuallyMuted(false);
      setControlState("mentor_waiting_for_answer");

      clearLearnerResponseTimer();
      learnerResponseTimerRef.current = window.setTimeout(
        hearingCheckIssuedRef.current ? abortUnresponsiveSession : requestHearingCheck,
        hearingCheckIssuedRef.current ? HEARING_CHECK_RESPONSE_WAIT_MS : INITIAL_LEARNER_RESPONSE_WAIT_MS,
      );
      return;
    }

    debugMentorControls("unexpected mode event", modeEvent);
  };

  useEffect(() => {
    if (!conversationRef.current) return;

    clearPendingUnmute();

    if (mentorSessionState === "mentor_speaking" || mentorSessionState === "mentor_thinking" || mentorSessionState === "connecting" || mentorSessionState === "muted_waiting") {
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
      clearLearnerResponseTimer();
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
    setDebugEvents([]);
    debugEventIdRef.current = 0;
    if (mentorSessionState === "connecting" || isSessionActive) return;
    const sessionGeneration = ++sessionGenerationRef.current;

    pendingCurrentEvaluationRef.current = null;
    pendingSummarySlideRef.current = null;
    closingSummaryCompletedRef.current = false;
    closingEvaluationCompletedRef.current = false;
    closingFarewellDetectedRef.current = false;
    learnerAnswerExpectedRef.current = false;
    questionToolPendingRef.current = false;
    resetSilenceRecovery();
    presentationFinalizedRef.current = false;
    onLessonPresentationChange?.(createInitialCoachingDiscussionSlide({
      conversationType: conversationtype,
      courseGoal: coursegoal,
      learnerGoal: userlearninggoal,
      userPreferences: userpreferences,
      knowledgeDomain: knowledgedomain,
      relationshipContext: relationshipcontext,
    }));
    setErrorMessage(null);
    setIsTokenSupportScreenVisible(false);
    setTokenSupportDebugMessage("");
    initialGreetingReceivedRef.current = false;
    startupContinuationSentRef.current = false;
    startupContinuationPendingRef.current = false;
    lastAutoContinuedMentorMessageRef.current = "";
    applyLessonPhase(initialLessonPhase(conversationtype));
    relationshipPhaseAcknowledgedRef.current = conversationtype !== "COURSE_CALIBRATION"
      && conversationtype !== "WEEKLY_CHECKPOINT";
    previousReviewActiveRef.current = false;
    previousReviewFeedbackCountRef.current = 0;
    deferredLessonPhaseRef.current = null;
    pendingKnowledgeCheckPhaseRef.current = null;
    lastDisplayedTopicTitleRef.current = "";
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
      const responseDebugMode = data?.debug?.debugMode === true;
      debugModeRef.current = responseDebugMode;
      setDebugMode(responseDebugMode);
      if (responseDebugMode) {
        appendDebugEvent("bootstrap", "debug mode enabled", {
          httpStatus: res.status,
          mentorContextMode: data?.mentor_context_mode,
          mentorSessionId: data?.mentor_session_id || mentorSessionId || null,
          tokenAvailability: data?.debug?.tokenAvailability,
        });
      }
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
            speakingspeed: "normal",
            content: content || "",
            learningmemory: learningmemory || "[]",
            knowledgestrengths: knowledgestrengths || "[]",
            knowledgegaps: knowledgegaps || "[]",
            practicerecommendations: practicerecommendations || "[]",
            userlearninggoal: userlearninggoal || "",
            coursegoal: coursegoal || "",
            courseprogress: courseprogress || "{}",
            conversation_type: conversationtype || "NORMAL_LESSON",
            relationship_period_key: relationshipperiodkey || "",
            relationship_prompt_version: relationshippromptversion || "lesson-v1",
            relationship_definition: relationshipdefinition || "{}",
            relationship_context: relationshipcontext || "{}",
            active_workflow_instruction: conversationtype === "COURSE_CALIBRATION"
              ? "Mandatory: complete the course calibration coaching phase before starting introduction, review, calibration questions, or lesson teaching. Then continue into the normal lesson workflow in this same call."
              : conversationtype === "WEEKLY_CHECKPOINT"
                ? "Mandatory: complete the weekly coaching checkpoint before starting introduction, review, calibration questions, or lesson teaching. Then continue into the normal lesson workflow in this same call."
                : "Run the normal lesson workflow.",
            previous_lesson_evaluation: JSON.stringify(previousLessonEvaluation ?? null),
            debug_mode: responseDebugMode,
          }
        : {
            userfirstname: userfirstname || "User",
            coursename: coursename || "Unknown Course",
            lessonname: lessonname || "Untitled Lesson",
            knowledgelevel: knowledgelevel || "beginner",
            knowledgedomain: knowledgedomain || "",
            userpreferences: userpreferences || "",
            speakingspeed: "normal",
            content: content || "",
            learningmemory: learningmemory || "[]",
            knowledgestrengths: knowledgestrengths || "[]",
            knowledgegaps: knowledgegaps || "[]",
            practicerecommendations: practicerecommendations || "[]",
            userlearninggoal: userlearninggoal || "",
            coursegoal: coursegoal || "",
            courseprogress: courseprogress || "{}",
            conversation_type: conversationtype || "NORMAL_LESSON",
            relationship_period_key: relationshipperiodkey || "",
            relationship_prompt_version: relationshippromptversion || "lesson-v1",
            relationship_definition: relationshipdefinition || "{}",
            relationship_context: relationshipcontext || "{}",
            active_workflow_instruction: conversationtype === "COURSE_CALIBRATION"
              ? "Mandatory: complete the course calibration coaching phase before starting introduction, review, calibration questions, or lesson teaching. Then continue into the normal lesson workflow in this same call."
              : conversationtype === "WEEKLY_CHECKPOINT"
                ? "Mandatory: complete the weekly coaching checkpoint before starting introduction, review, calibration questions, or lesson teaching. Then continue into the normal lesson workflow in this same call."
                : "Run the normal lesson workflow.",
            previous_lesson_evaluation: JSON.stringify(previousLessonEvaluation ?? null),
            user_id: userId || "",
            subscription_id: subscriptionId || "",
            course_id: courseId || "",
            lesson_id: lessonId || "",
            mentor_session_id: activeMentorSessionId || "",
            debug_mode: responseDebugMode,
          };

      appendDebugEvent("parameters", "dynamic variables prepared", dynamicVariables);

      const convo = await Conversation.startSession({
        signedUrl: data.signed_url,
        connectionType: "websocket",
        dynamicVariables,
        onConnect: () => {
          if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) return;
          debugMentorControls("session connected");
          appendDebugEvent("sdk", "session connected");
          sessionStartedAtRef.current = Date.now();
          setSessionProgress(0);
          setSessionElapsedSeconds(0);
          setHasElevenLabsSessionStarted(true);
        },
        onDisconnect: (details: DisconnectionDetails) => {
          if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) {
            debugMentorControls("ignored stale session disconnect", details);
            return;
          }
          const disconnectMessage = userRequestedEndRef.current ? null : getDisconnectMessage(details);
          debugMentorControls("session disconnected", {
            reason: details.reason,
            closeCode: "closeCode" in details ? details.closeCode : undefined,
          });
          appendDebugEvent("sdk", "session disconnected", details);
          finalizeLessonPresentation();
          setErrorMessage(disconnectMessage);
          userRequestedEndRef.current = false;
          resetSessionState("disconnected");
        },
        onError: (error: unknown) => {
          if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) return;
          appendDebugEvent("error", "ElevenLabs session error", error);
          if (isRecoverableClientToolError(error)) {
            appendDebugEvent("sdk", "recoverable client tool error ignored; session remains active");
            return;
          }
          setErrorMessage(getReadableError(error));
          resetSessionState("error");
        },
        onStatusChange: (status: any) => {
          if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) return;
          debugMentorControls("status event", status);
          appendDebugEvent("sdk", "status changed", status);
        },
        onModeChange: (event: any) => {
          if (isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) handleModeChange(event);
        },
        onVadScore: (event: { vadScore: number }) => {
          if (isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) handleVadScore(event);
        },
        onMessage: (message: any) => {
          if (isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) handleMentorMessage(message);
        },
        clientTools: instrumentClientTools({
          logMessage: async (payload: any) => {
            handleMentorMessage({ source: "agent", message: payload?.message ?? payload });
          },
          onUserMessage: async (payload: any) => {
            handleMentorMessage({ source: "user", message: payload?.message ?? payload });
          },
          onEnd: async () => {
            if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) return;
            finalizeLessonPresentation();
            appendDebugEvent("sdk", "agent requested session end; waiting for transport disconnect");
          },
          showLessonPhase: async (payload: LessonPhaseInput) => {
            const phase = normalizeLessonPhase(payload, conversationtype);
            if (!phase) throw new Error("Unknown lesson phase. Use one of the fixed BiteCode phase identifiers.");

            const requiredRelationshipPhase = conversationtype === "COURSE_CALIBRATION"
              ? "course_calibration"
              : conversationtype === "WEEKLY_CHECKPOINT"
                ? "weekly_checkpoint"
                : null;
            if (requiredRelationshipPhase && !relationshipPhaseAcknowledgedRef.current) {
              if (phase.id !== requiredRelationshipPhase) {
                return `The ${requiredRelationshipPhase} phase has not been acknowledged yet. Continue the relationship conversation and call showCoachingRecap before entering the lesson workflow.`;
              }
              relationshipPhaseAcknowledgedRef.current = true;
            }

            if (requiredRelationshipPhase && phase.id !== requiredRelationshipPhase) {
              if (phase.id === "main_lesson") {
                onLessonPresentationChange?.(createMainLessonTopicSlide(lessonname, content));
              } else if (phase.id === "introduction" || phase.id === "previous_lesson_review" || phase.id === "calibration") {
                onLessonPresentationChange?.(null);
              }
            }

            if (phase.id === "previous_lesson_review") {
              previousReviewActiveRef.current = true;
              previousReviewFeedbackCountRef.current = 0;
              deferredLessonPhaseRef.current = null;
              applyLessonPhase(phase);
              return `Displayed session topic ${phase.current} of ${phase.total}: ${phase.title}.`;
            }

            if (shouldDeferCalibrationPhase(phase, previousReviewActiveRef.current, previousReviewFeedbackCountRef.current)) {
              deferredLessonPhaseRef.current = phase;
              return "Calibration phase received early and queued. Keep the previous lesson review active until both review answers have feedback.";
            }

            if (phase.id === "knowledge_check") {
              pendingKnowledgeCheckPhaseRef.current = phase;
              return "Knowledge check phase queued. The header will advance when its first question is displayed.";
            }

            applyLessonPhase(phase);
            return `Displayed session topic ${phase.current} of ${phase.total}: ${phase.title}.`;
          },
          showLessonTopic: async (payload: TopicSlideInput) => {
            const title = normalizePresentationText(payload?.title, lessonname || "Current topic", 180);
            const normalizedTitle = title.trim().toLocaleLowerCase();
            if (normalizedTitle === lastDisplayedTopicTitleRef.current) {
              return "This topic was already displayed. Kept the current code, question, or feedback slide visible.";
            }
            const points = normalizePresentationItems(payload?.points);
            lastDisplayedTopicTitleRef.current = normalizedTitle;
            onLessonPresentationChange?.({ type: "topic", title, points });
            return "Displayed the current topic in the lesson presentation area.";
          },
          showLessonReview: async (payload: ReviewSlideInput) => {
            if (conversationtype !== "NORMAL_LESSON" && !relationshipPhaseAcknowledgedRef.current) {
              throw new Error("Complete the mandatory relationship coaching phase before showing the previous lesson review.");
            }
            const title = normalizePresentationText(payload?.title, "Your previous lesson", 180);
            const wentWell = normalizePresentationItems(payload?.wentWell, 4);
            const checkAgain = normalizePresentationItems(payload?.checkAgain, 4);
            if (!wentWell.length && !checkAgain.length) throw new Error("Lesson recap requires at least one supported point.");
            const reviewPhase = normalizeLessonPhase({ phase: "previous_lesson_review" }, conversationtype);
            if (reviewPhase) applyLessonPhase(reviewPhase);
            previousReviewActiveRef.current = true;
            previousReviewFeedbackCountRef.current = 0;
            deferredLessonPhaseRef.current = null;
            onLessonPresentationChange?.({ type: "review", title, wentWell, checkAgain });
            return "Displayed the short previous-lesson recap. Continue the planned lesson without adding a review loop.";
          },
          showCoachingDiscussion: async (payload: CoachingDiscussionSlideInput) => {
            if (conversationtype !== "COURSE_CALIBRATION" && conversationtype !== "WEEKLY_CHECKPOINT") {
              throw new Error("Coaching discussion cards are available only during course calibration or weekly checkpoint sessions.");
            }
            const defaultTitle = conversationtype === "COURSE_CALIBRATION" ? "Your goals and learning preferences" : "This week's checkpoint";
            const title = normalizePresentationText(payload?.title, defaultTitle, 180);
            const points = normalizeCoachingDiscussionPoints(payload?.points, 6);
            if (!points.length) throw new Error("A coaching discussion card requires at least one discussion topic.");
            onLessonPresentationChange?.({ type: "coaching_discussion", title, points });
            return `Displayed ${points.length} discussed point${points.length === 1 ? "" : "s"}, including the learner's stated input.`;
          },
          showCoachingRecap: async (payload: CoachingRecapSlideInput) => {
            if (conversationtype !== "COURSE_CALIBRATION" && conversationtype !== "WEEKLY_CHECKPOINT") {
              throw new Error("Coaching recap cards are available only during course calibration or weekly checkpoint sessions.");
            }
            const title = normalizePresentationText(payload?.title, "What we discussed", 180);
            const points = normalizePresentationItems(payload?.points, 3);
            if (!points.length) throw new Error("A coaching recap card requires at least one supported takeaway.");
            relationshipPhaseAcknowledgedRef.current = true;
            onLessonPresentationChange?.({ type: "coaching_recap", title, points });
            return `Displayed the coaching recap with ${points.length} main point${points.length === 1 ? "" : "s"}.`;
          },
          showMentorQuestion: async (payload: QuestionSlideInput) => {
            const question = normalizePresentationText(payload?.question, "", 600);
            if (!question) throw new Error("Mentor question text is required.");
            if (pendingKnowledgeCheckPhaseRef.current) {
              applyLessonPhase(pendingKnowledgeCheckPhaseRef.current);
              pendingKnowledgeCheckPhaseRef.current = null;
            }
            learnerAnswerExpectedRef.current = true;
            questionToolPendingRef.current = false;
            onLessonPresentationChange?.({
              type: "question",
              questionKind: "explanation",
              question,
            });
            return "Displayed the explanation question. Speak the exact question now without any intervening words.";
          },
          showTrueFalseQuestion: async (payload: QuestionSlideInput) => {
            const question = normalizeTrueFalseQuestion(payload?.question);
            if (!question) throw new Error("True-or-false question text is required.");
            if (pendingKnowledgeCheckPhaseRef.current) {
              applyLessonPhase(pendingKnowledgeCheckPhaseRef.current);
              pendingKnowledgeCheckPhaseRef.current = null;
            }
            learnerAnswerExpectedRef.current = true;
            questionToolPendingRef.current = false;
            onLessonPresentationChange?.({ type: "question", questionKind: "true_false", question });
            return "Displayed the true-or-false question. Speak the exact question now without any intervening words.";
          },
          showExplanationQuestion: async (payload: QuestionSlideInput) => {
            const question = normalizePresentationText(payload?.question, "", 600);
            if (!question) throw new Error("Explanation question text is required.");
            if (pendingKnowledgeCheckPhaseRef.current) {
              applyLessonPhase(pendingKnowledgeCheckPhaseRef.current);
              pendingKnowledgeCheckPhaseRef.current = null;
            }
            learnerAnswerExpectedRef.current = true;
            questionToolPendingRef.current = false;
            onLessonPresentationChange?.({ type: "question", questionKind: "explanation", question });
            return "Displayed the explanation question. Speak the exact question now without any intervening words.";
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
            void playAnswerFeedbackSound(result).catch((error) => {
              debugMentorControls("answer feedback sound failed", error);
            });
            if (previousReviewActiveRef.current) {
              previousReviewFeedbackCountRef.current += 1;
              if (previousReviewFeedbackCountRef.current >= PREVIOUS_REVIEW_QUESTION_COUNT) {
                previousReviewActiveRef.current = false;
                const deferredPhase = deferredLessonPhaseRef.current;
                deferredLessonPhaseRef.current = null;
                if (deferredPhase) applyLessonPhase(deferredPhase);
              }
            }
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
            closingSummaryCompletedRef.current = true;
            return "Prepared the closing lesson summary. It will be displayed after the call ends.";
          },
          showPreviousLessonEvaluation: async () => {
            if (!previousLessonEvaluation) {
              debugMentorControls("previous lesson evaluation unavailable");
              return "No previous lesson evaluation is available. Continue without showing a result.";
            }
            return `Previous lesson status: ${previousLessonEvaluation.status}. Use it only as background for one concise showLessonReview recap; do not display a score card or add a reinforcement loop.`;
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
            closingEvaluationCompletedRef.current = true;
            return `Processed the lesson outcome: ${evaluation.status}. Do not add another teaching or reinforcement loop. Speak one short declarative farewell, without asking a question or offering more help, and then end the session. The result will appear after the call ends.`;
          },
        }, appendDebugEvent),
      });

      if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) {
        await Promise.resolve((convo as ConversationInstance).endSession?.());
        return;
      }

      conversationRef.current = convo as ConversationInstance;
      if (startupContinuationPendingRef.current) {
        continueAfterInitialGreeting();
      }
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
      if (!isCurrentSessionGeneration(sessionGeneration, sessionGenerationRef.current)) return;
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
    if (mentorSessionState === "mentor_thinking") return "Agent is thinking...";
    if (mentorSessionState === "mentor_waiting_for_answer") return "Your turn";
    if (mentorSessionState === "user_question_mode") return "Listening to your question...";
    if (mentorSessionState === "user_speaking") return "Listening to your answer...";
    if (mentorSessionState === "muted_waiting") return "Microphone muted";
    if (mentorSessionState === "error") return "Mentor session error";
    if (mentorSessionState === "disconnected") return "Mentor session ended";
    return "";
  };

  const statusLabel = getStatusLabel();
  const activeTopicHeader = lessonPhase && isSessionActive && mentorSessionState !== "connecting"
    ? formatSessionTopicHeader({
        current: lessonPhase.current,
        total: lessonPhase.total,
        title: lessonPhase.title,
        status: statusLabel,
      })
    : null;

  return (
    <div className="mentor-panel-stack">
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
          aria-label={activeTopicHeader?.accessibleLabel || undefined}
        >
          <div className="mentor-status-content">
            {mentorSessionState === "mentor_speaking" && <Volume2 className="mentor-status-icon mentor-status-icon-green" size={24} />}
            {(mentorSessionState === "connecting" || mentorSessionState === "mentor_thinking") && <div className="mentor-status-spinner" />}
            <div className="mentor-status-text">
              <p>{activeTopicHeader?.primary || statusLabel}</p>
              {activeTopicHeader?.secondary && <span className="mentor-status-secondary">{activeTopicHeader.secondary}</span>}
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
    {debugMode && <MentorDebugPanel events={debugEvents} />}
    </div>
  );
};

export default MentorPanel;
