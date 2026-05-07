export type MentorControlState =
  | "idle"
  | "connecting"
  | "mentor_speaking"
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
