import { describe, expect, it } from "vitest";
import { createInitialCoachingDiscussionSlide, createMainLessonTopicSlide, initialLessonPhase, normalizeCoachingDiscussionPoints, normalizeLessonPhase, normalizePresentationItems, normalizePresentationText, normalizeTrueFalseQuestion, shouldDeferCalibrationPhase } from "./lessonPresentation";

describe("lesson presentation input normalization", () => {
  it("normalizes JSON and newline-delimited item lists", () => {
    expect(normalizePresentationItems('["Inputs", "Outputs"]')).toEqual(["Inputs", "Outputs"]);
    expect(normalizePresentationItems("State changes\nBranch decisions")).toEqual(["State changes", "Branch decisions"]);
  });

  it("bounds text and removes empty list entries", () => {
    expect(normalizePresentationText("  Question?  ", "", 20)).toBe("Question?");
    expect(normalizePresentationItems(["One", " ", "Two"])).toEqual(["One", "Two"]);
  });

  it("keeps topic-only coaching points and normalizes learner inputs", () => {
    expect(normalizeCoachingDiscussionPoints([
      { topic: "Goal", learnerInput: "Build backend services" },
      { topic: "Missing answer" },
      { topic: "Pace", learner_input: "Short focused lessons" },
    ])).toEqual([
      { topic: "Goal", learnerInput: "Build backend services" },
      { topic: "Missing answer" },
      { topic: "Pace", learnerInput: "Short focused lessons" },
    ]);
  });

  it("creates an opening coaching card from known learner context", () => {
    expect(createInitialCoachingDiscussionSlide({
      conversationType: "COURSE_CALIBRATION",
      learnerGoal: "Become a software architect",
      userPreferences: "Practical examples",
      knowledgeDomain: "Backend engineering",
    })).toMatchObject({
      type: "coaching_discussion",
      points: [
        { topic: "Learning goal", learnerInput: "Become a software architect" },
        { topic: "Learning preference", learnerInput: "Practical examples" },
        { topic: "General knowledge domain", learnerInput: "Backend engineering" },
      ],
    });
  });

  it("uses a topic-only agenda when no relationship input exists", () => {
    const slide = createInitialCoachingDiscussionSlide({ conversationType: "WEEKLY_CHECKPOINT" });
    expect(slide?.points).toHaveLength(5);
    expect(slide?.points.every((point) => !point.learnerInput)).toBe(true);
  });

  it("creates a main-lesson fallback card from the lesson goal", () => {
    expect(createMainLessonTopicSlide(
      "Grouping Records with Dictionaries",
      "Group records by key so downstream logic can work per account.\n\nInternal planning details.",
    )).toEqual({
      type: "topic",
      title: "Grouping Records with Dictionaries",
      points: ["Group records by key so downstream logic can work per account."],
    });
  });
});

describe("normalizeTrueFalseQuestion", () => {
  it("removes a duplicated true-or-false prefix", () => {
    expect(normalizeTrueFalseQuestion("True or false: a function can mutate an input."))
      .toBe("a function can mutate an input.");
  });

  it("removes a duplicated true-or-false suffix", () => {
    expect(normalizeTrueFalseQuestion("A function can mutate an input. True or false?"))
      .toBe("A function can mutate an input");
  });
});

describe("normalizeLessonPhase", () => {
  it("accepts a bounded lesson phase", () => {
    expect(normalizeLessonPhase({ phase: "calibration" }))
      .toEqual({ id: "calibration", current: 3, total: 6, title: "Calibration questions" });
  });

  it("rejects an unknown phase identifier", () => {
    expect(normalizeLessonPhase({ phase: "made_up_phase" })).toBeNull();
  });

  it("keeps six phases for a normal lesson", () => {
    expect(initialLessonPhase("NORMAL_LESSON"))
      .toEqual({ id: "introduction", current: 1, total: 6, title: "Introduction" });
  });

  it.each([
    ["COURSE_CALIBRATION", "course_calibration", "Course calibration"],
    ["WEEKLY_CHECKPOINT", "weekly_checkpoint", "Weekly coaching"],
  ])("prepends the relationship phase for %s", (conversationType, id, title) => {
    expect(initialLessonPhase(conversationType))
      .toEqual({ id, current: 1, total: 7, title });
    expect(normalizeLessonPhase({ phase: "introduction" }, conversationType))
      .toEqual({ id: "introduction", current: 2, total: 7, title: "Introduction" });
    expect(normalizeLessonPhase({ phase: id }, conversationType))
      .toEqual({ id, current: 1, total: 7, title });
  });
});

describe("shouldDeferCalibrationPhase", () => {
  const calibration = normalizeLessonPhase({ phase: "calibration" })!;

  it("defers calibration while the two-question previous review is incomplete", () => {
    expect(shouldDeferCalibrationPhase(calibration, true, 0)).toBe(true);
    expect(shouldDeferCalibrationPhase(calibration, true, 1)).toBe(true);
  });

  it("allows calibration after both review answers received feedback", () => {
    expect(shouldDeferCalibrationPhase(calibration, true, 2)).toBe(false);
    expect(shouldDeferCalibrationPhase(calibration, false, 0)).toBe(false);
  });
});
