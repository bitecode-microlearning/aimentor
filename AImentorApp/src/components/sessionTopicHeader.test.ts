import { describe, expect, it } from "vitest";
import { formatSessionTopicHeader } from "./sessionTopicHeader";

describe("formatSessionTopicHeader", () => {
  it.each([
    [1, "First"], [2, "Second"], [3, "Third"], [4, "Fourth"], [5, "Fifth"],
    [6, "Sixth"], [7, "Seventh"], [8, "Eighth"], [9, "Ninth"], [10, "Tenth"],
  ])("formats topic %i with the ordinal %s", (current, ordinal) => {
    const result = formatSessionTopicHeader({ current, total: 10, title: "Testing", status: "Mentor is explaining…" });
    expect(result.secondary).toBe(`${ordinal} of 10 topics · Mentor is explaining…`);
  });

  it("uses a singular topic label", () => {
    expect(formatSessionTopicHeader({ current: 1, total: 1, title: "Wrap-up", status: "Mentor is summarizing…" }).secondary)
      .toBe("First of 1 topic · Mentor is summarizing…");
  });

  it("falls back to numeric wording above ten", () => {
    expect(formatSessionTopicHeader({ current: 11, total: 15, title: "Architecture", status: "Mentor is explaining…" }).secondary)
      .toBe("Topic 11 of 15 · Mentor is explaining…");
  });

  it("clamps invalid indexes and supplies a missing title", () => {
    const below = formatSessionTopicHeader({ current: 0, total: 6, status: "Waiting for your answer…" });
    const above = formatSessionTopicHeader({ current: 7, total: 6, title: "Closing", status: "Mentor is summarizing…" });
    expect(below.primary).toBe("Current topic");
    expect(below.secondary).toBe("First of 6 topics · Waiting for your answer…");
    expect(above.secondary).toBe("Sixth of 6 topics · Mentor is summarizing…");
  });

  it.each([undefined, null, 0, -1, 2.5, Number.NaN])("shows only status for invalid total %s", (total) => {
    expect(formatSessionTopicHeader({ current: 1, total, title: "Introduction", status: "Mentor is explaining…" }))
      .toEqual({ primary: "Mentor is explaining…", secondary: null, accessibleLabel: "Mentor is explaining." });
  });

  it("builds an explicit accessible topic label", () => {
    expect(formatSessionTopicHeader({ current: 1, total: 6, title: "Introduction", status: "Mentor is explaining…" }).accessibleLabel)
      .toBe("Topic 1 of 6: Introduction. Mentor is explaining.");
  });
});
