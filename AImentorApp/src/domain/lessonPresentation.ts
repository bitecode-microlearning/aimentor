export type LessonPresentationSlide =
  | {
      type: "topic";
      title: string;
      points: string[];
    }
  | {
      type: "review";
      title: string;
      wentWell: string[];
      checkAgain: string[];
    }
  | {
      type: "question";
      questionKind: "true_false" | "explanation";
      question: string;
    }
  | {
      type: "answer_feedback";
      result: "correct" | "not_quite" | "wrong";
      message?: string;
    }
  | {
      type: "code";
      title: string;
      language: string;
      code: string;
      explanation?: string;
    }
  | {
      type: "donation";
    }
  | {
      type: "summary";
      title: string;
      coveredTopics: string[];
      takeaway?: string;
      encouragement?: string;
    };

export interface TopicSlideInput {
  title?: string;
  points?: unknown;
}

export interface ReviewSlideInput {
  title?: string;
  wentWell?: unknown;
  checkAgain?: unknown;
}

export interface QuestionSlideInput {
  question?: string;
}

export interface AnswerFeedbackSlideInput {
  result?: string;
  message?: string;
}

export interface CodeSlideInput {
  title?: string;
  language?: string;
  code?: string;
  explanation?: string;
}

export interface SummarySlideInput {
  title?: string;
  coveredTopics?: unknown;
  takeaway?: string;
  encouragement?: string;
}

export interface LessonPhaseInput {
  phase?: unknown;
}

export interface LessonPhase {
  id: LessonPhaseId;
  current: number;
  total: number;
  title: string;
}

export type LessonPhaseId =
  | "introduction"
  | "previous_lesson_review"
  | "calibration"
  | "main_lesson"
  | "knowledge_check"
  | "session_wrap_up";

export const LESSON_PHASES: ReadonlyArray<{ id: LessonPhaseId; title: string }> = [
  { id: "introduction", title: "Introduction" },
  { id: "previous_lesson_review", title: "Previous lesson review" },
  { id: "calibration", title: "Calibration questions" },
  { id: "main_lesson", title: "Main lesson" },
  { id: "knowledge_check", title: "Knowledge check" },
  { id: "session_wrap_up", title: "Session wrap-up" },
];

export function normalizePresentationText(value: unknown, fallback = "", maxLength = 1000): string {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).slice(0, maxLength);
}

export function normalizeTrueFalseQuestion(value: unknown): string {
  const question = normalizePresentationText(value, "", 600)
    .replace(/^\s*true\s*(?:or|\/)\s*false\s*[:?\-–—]*\s*/i, "")
    .replace(/\s*[,;:.\-–—]*\s*true\s*(?:or|\/)\s*false\s*\?*\s*$/i, "")
    .trim();

  return question;
}

export function normalizeLessonPhase(input: LessonPhaseInput): LessonPhase | null {
  const phaseId = normalizePresentationText(input?.phase, "", 60)
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as LessonPhaseId;
  const index = LESSON_PHASES.findIndex(({ id }) => id === phaseId);
  if (index < 0) return null;

  return {
    id: LESSON_PHASES[index].id,
    current: index + 1,
    total: LESSON_PHASES.length,
    title: LESSON_PHASES[index].title,
  };
}

export function normalizePresentationItems(value: unknown, maxItems = 6): string[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = candidate.split(/\r?\n|;/);
    }
  }

  if (!Array.isArray(candidate)) return [];
  return candidate
    .map((item) => normalizePresentationText(item, "", 240))
    .filter(Boolean)
    .slice(0, maxItems);
}
