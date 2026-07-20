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
      type: "coaching_discussion";
      title: string;
      points: CoachingDiscussionPoint[];
    }
  | {
      type: "coaching_recap";
      title: string;
      points: string[];
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

export interface CoachingDiscussionPoint {
  topic: string;
  learnerInput?: string;
}

export interface CoachingDiscussionSlideInput {
  title?: string;
  points?: unknown;
}

export interface CoachingRecapSlideInput {
  title?: string;
  points?: unknown;
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
  | "course_calibration"
  | "weekly_checkpoint"
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

export type MentorConversationType = "NORMAL_LESSON" | "COURSE_CALIBRATION" | "WEEKLY_CHECKPOINT";

const RELATIONSHIP_PHASES: Readonly<Record<Exclude<MentorConversationType, "NORMAL_LESSON">, { id: LessonPhaseId; title: string }>> = {
  COURSE_CALIBRATION: { id: "course_calibration", title: "Course calibration" },
  WEEKLY_CHECKPOINT: { id: "weekly_checkpoint", title: "Weekly coaching" },
};

export function getLessonPhases(conversationType: string | null | undefined): ReadonlyArray<{ id: LessonPhaseId; title: string }> {
  const normalized = String(conversationType ?? "NORMAL_LESSON").trim().toUpperCase() as MentorConversationType;
  if (normalized === "COURSE_CALIBRATION" || normalized === "WEEKLY_CHECKPOINT") {
    return [RELATIONSHIP_PHASES[normalized], ...LESSON_PHASES];
  }
  return LESSON_PHASES;
}

export function initialLessonPhase(conversationType: string | null | undefined): LessonPhase {
  const phases = getLessonPhases(conversationType);
  return { ...phases[0], current: 1, total: phases.length };
}

export const PREVIOUS_REVIEW_QUESTION_COUNT = 2;

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

export function normalizeLessonPhase(input: LessonPhaseInput, conversationType: string | null | undefined = "NORMAL_LESSON"): LessonPhase | null {
  const phaseId = normalizePresentationText(input?.phase, "", 60)
    .toLowerCase()
    .replace(/[\s-]+/g, "_") as LessonPhaseId;
  const phases = getLessonPhases(conversationType);
  const index = phases.findIndex(({ id }) => id === phaseId);
  if (index < 0) return null;

  return {
    id: phases[index].id,
    current: index + 1,
    total: phases.length,
    title: phases[index].title,
  };
}

export function shouldDeferCalibrationPhase(
  phase: LessonPhase,
  previousReviewActive: boolean,
  previousReviewFeedbackCount: number,
): boolean {
  return phase.id === "calibration"
    && previousReviewActive
    && previousReviewFeedbackCount < PREVIOUS_REVIEW_QUESTION_COUNT;
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

export function normalizeCoachingDiscussionPoints(value: unknown, maxItems = 6): CoachingDiscussionPoint[] {
  let candidate = value;
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(candidate)) return [];
  return candidate
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const point = item as { topic?: unknown; learnerInput?: unknown; learner_input?: unknown };
      const topic = normalizePresentationText(point.topic, "", 120);
      const learnerInput = normalizePresentationText(point.learnerInput ?? point.learner_input, "", 360);
      return topic ? { topic, ...(learnerInput ? { learnerInput } : {}) } : null;
    })
    .filter((item): item is CoachingDiscussionPoint => item !== null)
    .slice(0, maxItems);
}

interface InitialCoachingDiscussionInput {
  conversationType?: string;
  courseGoal?: string;
  learnerGoal?: string;
  userPreferences?: string;
  knowledgeDomain?: string;
  relationshipContext?: string;
}

export function createInitialCoachingDiscussionSlide({
  conversationType,
  courseGoal,
  learnerGoal,
  userPreferences,
  knowledgeDomain,
  relationshipContext,
}: InitialCoachingDiscussionInput): Extract<LessonPresentationSlide, { type: "coaching_discussion" }> | null {
  const normalizedType = String(conversationType ?? "").trim().toUpperCase();
  if (normalizedType !== "COURSE_CALIBRATION" && normalizedType !== "WEEKLY_CHECKPOINT") return null;

  const points: CoachingDiscussionPoint[] = [];
  const addKnownPoint = (topic: string, value: unknown) => {
    const learnerInput = normalizePresentationText(value, "", 360);
    if (learnerInput) points.push({ topic, learnerInput });
  };

  if (normalizedType === "COURSE_CALIBRATION") {
    const goal = normalizePresentationText(learnerGoal, "", 360)
      || normalizePresentationText(courseGoal, "", 360);
    return {
      type: "coaching_discussion",
      title: "Your learning setup",
      points: [
        { topic: "Learning goal", ...(goal ? { learnerInput: goal } : {}) },
        { topic: "Learning preference", ...(normalizePresentationText(userPreferences, "", 360) ? { learnerInput: normalizePresentationText(userPreferences, "", 360) } : {}) },
        { topic: "General knowledge domain", ...(normalizePresentationText(knowledgeDomain, "", 360) ? { learnerInput: normalizePresentationText(knowledgeDomain, "", 360) } : {}) },
      ],
    };
  } else {
    addKnownPoint("Learner goal", learnerGoal);
    try {
      const context = JSON.parse(relationshipContext || "{}");
      const previous = context?.previousCheckpoint;
      addKnownPoint("Last checkpoint", previous?.checkpointSummary?.summary ?? previous?.summary);
      const adjustment = previous?.checkpointSummary?.agreedNextAdjustment
        ?? previous?.agreedAdjustments?.[0];
      addKnownPoint("Previous adjustment", typeof adjustment === "string" ? adjustment : adjustment?.summary);
    } catch {
      // Malformed optional context should fall back to a discussion agenda.
    }
  }

  const agenda = ["Changes since last time", "Progress and successes", "Current blockers", "Previous adjustment", "Next adjustment"];
  const displayPoints = points.length ? points.slice(0, 6) : agenda.map((topic) => ({ topic }));

  return {
    type: "coaching_discussion",
    title: normalizedType === "COURSE_CALIBRATION" ? "Your goals and learning preferences" : "This week's checkpoint",
    points: displayPoints,
  };
}

export function createMainLessonTopicSlide(
  lessonName: unknown,
  content: unknown,
): Extract<LessonPresentationSlide, { type: "topic" }> {
  const title = normalizePresentationText(lessonName, "Current lesson", 180);
  const lessonGoal = normalizePresentationText(String(content ?? "").split(/\r?\n/).find((line) => line.trim()), "", 240);
  return {
    type: "topic",
    title,
    points: lessonGoal ? [lessonGoal] : [],
  };
}
