export type MentorControlState =
  | "idle"
  | "connecting"
  | "mentor_speaking"
  | "mentor_thinking"
  | "user_question_mode"
  | "mentor_waiting_for_answer"
  | "user_speaking"
  | "muted_waiting"
  | "disconnected"
  | "error";

const questionPhrases = [
  "can you",
  "what do you think",
  "your turn",
  "try to answer",
  "which one",
  "true or false",
  "does this make sense",
  "what is",
  "why do",
  "how would",
];

export function isMentorAskingQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();

  if (!normalized) return false;
  if (normalized.endsWith("?")) return true;

  return questionPhrases.some((phrase) => normalized.includes(phrase));
}

export function shouldAutoContinueMentorTurn(message: string, explicitAnswerExpected: boolean): boolean {
  return Boolean(message.trim()) && !explicitAnswerExpected && !isMentorAskingQuestion(message);
}

export function remainingMinimumDisplayMs(displayedAt: number | null, now: number, minimumMs: number): number {
  if (displayedAt === null || !Number.isFinite(displayedAt) || !Number.isFinite(now) || minimumMs <= 0) return 0;
  return Math.max(0, minimumMs - Math.max(0, now - displayedAt));
}

export function isCodeDependentKnowledgeCheck(question: string): boolean {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) return false;

  return /\b(?:this|the|displayed|shown|above|example)\s+(?:code|function|method|snippet|record|processor|example)\b/.test(normalized)
    || /\b(?:in|from|for)\s+(?:this|the|displayed|shown|above)\s+(?:code|function|method|snippet|record|processor|example)\b/.test(normalized)
    || /\b(?:in|from|based on)\s+(?:the\s+)?(?:[a-z0-9_-]+\s+){1,4}example\b/.test(normalized);
}

export function isMentorQuestionLeadIn(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[’]/g, "'");
  if (!normalized) return false;

  return /(?:here(?:'s| is) (?:a|the|your|next) (?:quick )?(?:question|check)(?: to think through)?|showing (?:a|the|your|next) (?:question|check)|next (?:question|check)|let's (?:try|do|take|use) (?:a|the) (?:quick )?(?:question|check)|let's test that idea|try this one|think this through)\.?\s*$/.test(normalized);
}

export function isDisplayedQuestionSpoken(message: string, displayedQuestion: string): boolean {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  const expected = normalize(displayedQuestion);
  const spoken = normalize(message);
  return Boolean(expected) && (spoken === expected || spoken.endsWith(` ${expected}`));
}

export function isClosingFarewellMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase().replace(/[’]/g, "'");
  if (!normalized || isMentorAskingQuestion(normalized)) return false;

  return /\b(?:goodbye|bye for now|see you|talk to you|until next time|take care|great work today|nice work today|thanks for learning|thank you for learning)\b/.test(normalized);
}

export function getHearingCheckRequest(): string {
  return "Sorry, I didn't answer. Could you check whether I can hear you?";
}

export function advanceVoiceActivitySamples(currentSamples: number, vadScore: number, threshold: number): number {
  if (!Number.isFinite(vadScore) || vadScore < threshold) return 0;
  return currentSamples + 1;
}

export function isCurrentSessionGeneration(callbackGeneration: number, activeGeneration: number): boolean {
  return callbackGeneration === activeGeneration;
}

export function isRecoverableClientToolError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /client tool execution failed/i.test(message);
}

export function debugMentorControls(message: string, data?: unknown) {
  if (!import.meta.env.DEV) return;
  console.debug(`[mentor-controls] ${message}`, data ?? "");
}

export function getReadableError(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone permission was denied. Please allow microphone access and restart the session.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong with the mentor session.";
}
