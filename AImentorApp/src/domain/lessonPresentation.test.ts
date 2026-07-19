import { describe, expect, it } from "vitest";
import { normalizePresentationItems, normalizePresentationText } from "./lessonPresentation";

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
