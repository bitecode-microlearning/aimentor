export type LessonPresentationSlide =
  | {
      type: "topic";
      title: string;
      points: string[];
    }
  | {
      type: "review";
      title: string;
      topics: string[];
    }
  | {
      type: "question";
      question: string;
      supportingText?: string;
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
  topics?: unknown;
}

export interface QuestionSlideInput {
  question?: string;
  supportingText?: string;
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

export function normalizePresentationText(value: unknown, fallback = "", maxLength = 1000): string {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).slice(0, maxLength);
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
