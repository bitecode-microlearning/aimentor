import { describe, expect, it } from "vitest";
import { normalizeLessonPhase, normalizePresentationItems, normalizePresentationText, normalizeTrueFalseQuestion, shouldDeferCalibrationPhase } from "./lessonPresentation";

describe("lesson presentation input normalization", () => {
  it("normalizes JSON and newline-delimited item lists", () => {
    expect(normalizePresentationItems('["Inputs", "Outputs"]')).toEqual(["Inputs", "Outputs"]);
    expect(normalizePresentationItems("State changes\nBranch decisions")).toEqual(["State changes", "Branch decisions"]);
  });

  it("bounds text and removes empty list entries", () => {
    expect(normalizePresentationText("  Question?  ", "", 20)).toBe("Question?");
    expect(normalizePresentationItems(["One", " ", "Two"])).toEqual(["One", "Two"]);
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
