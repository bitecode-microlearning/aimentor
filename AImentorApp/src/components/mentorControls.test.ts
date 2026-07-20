import { describe, expect, it } from "vitest";
import { advanceVoiceActivitySamples, getHearingCheckRequest, isClosingFarewellMessage, isCurrentSessionGeneration, isMentorQuestionLeadIn, isRecoverableClientToolError, shouldAutoContinueMentorTurn } from "./mentorControls";

describe("getHearingCheckRequest", () => {
  it("uses a learner-style hearing-check request without control instructions", () => {
    const message = getHearingCheckRequest();

    expect(message).toBe("Sorry, I didn't answer. Could you check whether I can hear you?");
    expect(message).not.toMatch(/[\[\]]|automatic|instruction|learner answer/i);
  });
});

describe("advanceVoiceActivitySamples", () => {
  it("requires consecutive scores above the configured threshold", () => {
    expect(advanceVoiceActivitySamples(0, 0.5, 0.35)).toBe(1);
    expect(advanceVoiceActivitySamples(1, 0.6, 0.35)).toBe(2);
    expect(advanceVoiceActivitySamples(1, 0.1, 0.35)).toBe(0);
    expect(advanceVoiceActivitySamples(1, Number.NaN, 0.35)).toBe(0);
  });
});

describe("isCurrentSessionGeneration", () => {
  it("rejects callbacks from a superseded ElevenLabs connection", () => {
    expect(isCurrentSessionGeneration(4, 5)).toBe(false);
    expect(isCurrentSessionGeneration(5, 5)).toBe(true);
  });
});

describe("isRecoverableClientToolError", () => {
  it("distinguishes tool validation failures from connection errors", () => {
    expect(isRecoverableClientToolError(new Error("Client tool execution failed with following error: invalid phase"))).toBe(true);
    expect(isRecoverableClientToolError(new Error("WebSocket disconnected"))).toBe(false);
  });
});

describe("shouldAutoContinueMentorTurn", () => {
  it("continues declarative transitions without waiting for an okay", () => {
    expect(shouldAutoContinueMentorTurn("Let's continue with the lesson.", false)).toBe(true);
    expect(shouldAutoContinueMentorTurn("Before we begin, here is a quick review.", false)).toBe(true);
  });

  it("waits for real or tool-declared learner questions", () => {
    expect(shouldAutoContinueMentorTurn("What would help you most?", false)).toBe(false);
    expect(shouldAutoContinueMentorTurn("Explain the result.", true)).toBe(false);
  });
});

describe("isMentorQuestionLeadIn", () => {
  it("recognizes a question cue before its client tool runs", () => {
    expect(isMentorQuestionLeadIn("Okay, here’s a question.")).toBe(true);
    expect(isMentorQuestionLeadIn("Correct. Here's the next check.")).toBe(true);
    expect(isMentorQuestionLeadIn("Showing the next check.")).toBe(true);
  });

  it("does not classify an ordinary transition as a question cue", () => {
    expect(isMentorQuestionLeadIn("Let's continue with the lesson.")).toBe(false);
  });
});

describe("isClosingFarewellMessage", () => {
  it("accepts a declarative goodbye", () => {
    expect(isClosingFarewellMessage("Great work today. See you soon!")).toBe(true);
    expect(isClosingFarewellMessage("Take care, and see you next time.")).toBe(true);
  });

  it("rejects questions and ordinary wrap-up content", () => {
    expect(isClosingFarewellMessage("Is there anything else I can help you with before we close?")).toBe(false);
    expect(isClosingFarewellMessage("The main takeaway is to group records once.")).toBe(false);
  });
});
