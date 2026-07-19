import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LessonUnderstandingStatusCard } from "./LessonUnderstandingStatusCard";

afterEach(cleanup);

describe("LessonUnderstandingStatusCard", () => {
  it.each([
    ["mastered", "Mastered"],
    ["understood", "Understood"],
    ["needs_review", "Needs Review"],
  ] as const)("renders the %s state with text and an active scale step", (status, label) => {
    const { container } = render(<LessonUnderstandingStatusCard lessonName="Inputs and outputs" status={status} context="current" />);
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(label);
    expect(container.querySelector("section")?.getAttribute("data-status")).toBe(status);
    expect(screen.queryByText("Inputs and outputs")).toBeNull();
  });

  it("renders compact previous lesson context", () => {
    const { container } = render(<LessonUnderstandingStatusCard lessonName="Previous topic" status="understood" context="previous" compact />);
    expect(screen.getByText("Previous lesson")).toBeTruthy();
    expect(container.querySelector("section")?.classList.contains("is-compact")).toBe(true);
  });

  it("renders full current actions and supports keyboard activation", async () => {
    const onReview = vi.fn();
    const onContinue = vi.fn();
    const user = userEvent.setup();
    render(<LessonUnderstandingStatusCard lessonName="Current topic" status="needs_review" context="current" onReview={onReview} onContinue={onContinue} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review key takeaway" }));
    await user.keyboard("{Enter}");
    expect(onReview).toHaveBeenCalledOnce();
    await user.tab();
    await user.keyboard(" ");
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("includes reduced-motion and mobile responsive rules", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (max-width: 560px)");
    expect(styles).toContain("animation: none");
  });
});
