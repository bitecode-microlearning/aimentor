import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LessonPresentationStage } from "./LessonPresentationStage";

afterEach(cleanup);

describe("LessonPresentationStage", () => {
  it("shows the exact mentor question", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "question", question: "What changes after this assignment?" }} />);
    expect(screen.getByText("What changes after this assignment?")).toBeTruthy();
  });

  it("formats code with a language label and line numbers", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "code", title: "Counter", language: "python", code: "count = 0\ncount += 1" }} />);
    expect(screen.getByText("python")).toBeTruthy();
    expect(screen.getByLabelText("python code example")).toBeTruthy();
    expect(screen.getByText("count += 1")).toBeTruthy();
  });

  it("shows review topics as a readable list", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "review", title: "Topics to revisit", topics: ["Loop state", "Branch decisions"] }} />);
    expect(screen.getByText("Loop state")).toBeTruthy();
    expect(screen.getByText("Branch decisions")).toBeTruthy();
  });

  it("uses the fixed BiteCode support URL", () => {
    render(<LessonPresentationStage lessonName="State" slide={{ type: "donation" }} />);
    expect(screen.getByRole("link", { name: "Support BiteCode" }).getAttribute("href")).toBe("https://buymeacoffee.com/bitecode");
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
