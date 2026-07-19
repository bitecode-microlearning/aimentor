export type LessonUnderstandingStatus = "mastered" | "understood" | "needs_review";

export interface LessonEvaluation {
  lessonId: string;
  lessonName: string;
  correctAnswers: number;
  totalQuestions: number;
  skippedAnswers?: number;
  uncertaintyDetected?: boolean;
  explicitConfusionDetected?: boolean;
  status: LessonUnderstandingStatus;
  evaluatedAt: string;
}

export type LessonEvaluationInput = Omit<LessonEvaluation, "status" | "evaluatedAt">;

export function calculateLessonUnderstandingStatus(
  evaluation: Pick<LessonEvaluationInput, "correctAnswers" | "totalQuestions" | "skippedAnswers" | "uncertaintyDetected" | "explicitConfusionDetected">
): LessonUnderstandingStatus {
  const totalQuestions = Math.max(0, Math.floor(evaluation.totalQuestions));
  const correctAnswers = Math.max(0, Math.min(totalQuestions, Math.floor(evaluation.correctAnswers)));
  const skippedAnswers = Math.max(0, Math.min(totalQuestions, Math.floor(evaluation.skippedAnswers ?? 0)));

  if (totalQuestions === 0 || skippedAnswers >= totalQuestions || evaluation.explicitConfusionDetected) {
    return "needs_review";
  }

  const correctPercentage = (correctAnswers / totalQuestions) * 100;
  if (correctPercentage >= 80 && !evaluation.uncertaintyDetected) return "mastered";
  if (correctPercentage >= 50) return "understood";
  return "needs_review";
}

export function createLessonEvaluation(input: LessonEvaluationInput): LessonEvaluation {
  return {
    ...input,
    status: calculateLessonUnderstandingStatus(input),
    evaluatedAt: new Date().toISOString(),
  };
}

export function parseLessonEvaluation(value: unknown): LessonEvaluation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const status = candidate.status;
  if (status !== "mastered" && status !== "understood" && status !== "needs_review") return null;
  if (typeof candidate.lessonId !== "string" || typeof candidate.lessonName !== "string") return null;
  if (!Number.isInteger(candidate.correctAnswers) || !Number.isInteger(candidate.totalQuestions)) return null;
  if (Number(candidate.totalQuestions) <= 0 || Number(candidate.correctAnswers) < 0) return null;
  if (typeof candidate.evaluatedAt !== "string" || !candidate.evaluatedAt) return null;
  return candidate as unknown as LessonEvaluation;
}
