import { describe, expect, it } from "vitest";
import { getHearingCheckRequest } from "./mentorControls";

describe("getHearingCheckRequest", () => {
  it("uses a learner-style hearing-check request without control instructions", () => {
    const message = getHearingCheckRequest();

    expect(message).toBe("Sorry, I didn't answer. Could you check whether I can hear you?");
    expect(message).not.toMatch(/[\[\]]|automatic|instruction|learner answer/i);
  });
});
