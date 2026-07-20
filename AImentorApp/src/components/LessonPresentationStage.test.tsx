import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LessonPresentationStage } from "./LessonPresentationStage";

afterEach(cleanup);

describe("LessonPresentationStage", () => {
  it("shows the exact mentor question", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "question", questionKind: "explanation", question: "What changes after this assignment?" }} />);
    expect(screen.getByText("What changes after this assignment?")).toBeTruthy();
    expect(screen.getByText("Explain your thinking")).toBeTruthy();
  });

  it("gives true-or-false questions their own heading", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "question", questionKind: "true_false", question: "A function can have side effects. True or false?" }} />);
    expect(screen.getByText("True or false?")).toBeTruthy();
  });

  it.each([
    ["correct", "Correct", "lesson-stage-feedback-correct"],
    ["not_quite", "Almost there", "lesson-stage-feedback-not_quite"],
    ["wrong", "Not yet", "lesson-stage-feedback-wrong"],
  ] as const)("renders %s answer feedback with its distinct card state", (result, label, className) => {
    const { container } = render(<LessonPresentationStage
      lessonName="State"
      slide={{ type: "answer_feedback", result, message: "Short feedback." }}
    />);
    expect(screen.getByRole("status", { name: `Answer feedback: ${label}` })).toBeTruthy();
    expect(screen.getByText(label)).toBeTruthy();
    expect(container.querySelector("section")?.classList.contains(className)).toBe(true);
  });

  it("formats code with a language label and line numbers", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "code", title: "Counter", language: "python", code: "count = 0\ncount += 1" }} />);
    expect(screen.getByText("python")).toBeTruthy();
    expect(screen.getByLabelText("python code example")).toBeTruthy();
    expect(screen.getByText("count += 1")).toBeTruthy();
  });

  it("shows a simple previous-lesson recap", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "review", title: "Reading production code", wentWell: ["Identified inputs"], checkAgain: ["Hidden side effects"] }} />);
    expect(screen.getByText("What went well")).toBeTruthy();
    expect(screen.getByText("Check again")).toBeTruthy();
    expect(screen.getByText("Identified inputs")).toBeTruthy();
    expect(screen.getByText("Hidden side effects")).toBeTruthy();
  });

  it("shows coaching topics with the learner's own inputs", () => {
    render(<LessonPresentationStage lessonName="State" slide={{
      type: "coaching_discussion",
      title: "Your goals and learning preferences",
      points: [{ topic: "Course goal", learnerInput: "I want to build reliable APIs." }],
    }} />);
    expect(screen.getByText("Goals and priorities")).toBeTruthy();
    expect(screen.getByText("Course goal")).toBeTruthy();
    expect(screen.getByText(/I want to build reliable APIs/)).toBeTruthy();
  });

  it("shows the three-point coaching recap", () => {
    render(<LessonPresentationStage lessonName="State" slide={{
      type: "coaching_recap",
      title: "What we discussed",
      points: ["Build confidence", "Use shorter examples", "Practise APIs"],
    }} />);
    expect(screen.getByText("What we discussed")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("uses the fixed BiteCode support URL", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "donation" }} />);
    expect(screen.getByRole("link", { name: /Buy me a coffee/ }).getAttribute("href")).toBe("https://buymeacoffee.com/bitecode");
  });

  it("combines the final summary with the lesson outcome", () => {
    render(<LessonPresentationStage
      lessonName="State"
      slide={{ type: "summary", title: "Session complete", coveredTopics: ["Tracing state"], takeaway: "Follow each mutation." }}
      evaluation={{
        context: "current",
        evaluation: {
          lessonId: "147",
          lessonName: "State",
          correctAnswers: 2,
          totalQuestions: 3,
          status: "understood",
          evaluatedAt: "2026-07-19T10:00:00.000Z",
        },
      }}
    />);
    expect(screen.getAllByText("Understood").length).toBeGreaterThan(0);
    expect(screen.getByText("Tracing state")).toBeTruthy();
    expect(screen.getByText(/Follow each mutation/)).toBeTruthy();
  });
});
