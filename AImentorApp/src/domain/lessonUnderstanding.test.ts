import { describe, expect, it } from "vitest";
import { calculateLessonUnderstandingStatus, parseLessonEvaluation } from "./lessonUnderstanding";

describe("calculateLessonUnderstandingStatus", () => {
  it("maps confident scores of at least 80 percent to mastered", () => {
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 4, totalQuestions: 5 })).toBe("mastered");
  });

  it("maps partial understanding or uncertainty to understood", () => {
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 3, totalQuestions: 5 })).toBe("understood");
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 5, totalQuestions: 5, uncertaintyDetected: true })).toBe("understood");
  });

  it("maps low scores, confusion, and skipped validation to needs review", () => {
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 2, totalQuestions: 5 })).toBe("needs_review");
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 5, totalQuestions: 5, explicitConfusionDetected: true })).toBe("needs_review");
    expect(calculateLessonUnderstandingStatus({ correctAnswers: 0, totalQuestions: 2, skippedAnswers: 2 })).toBe("needs_review");
  });

  it("does not fabricate missing previous evaluation data", () => {
    expect(parseLessonEvaluation(null)).toBeNull();
    expect(parseLessonEvaluation({ lessonName: "Incomplete" })).toBeNull();
  });
});
