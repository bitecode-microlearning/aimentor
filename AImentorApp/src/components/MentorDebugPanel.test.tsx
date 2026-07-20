import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatMentorDebugLog, MentorDebugPanel } from "./MentorDebugPanel";

const debugEvents = [{
  id: 1,
  timestamp: "12:34:56",
  category: "parameters",
  label: "dynamic variables prepared",
  data: { conversation_type: "COURSE_CALIBRATION", debug_mode: true },
}];

afterEach(cleanup);

describe("MentorDebugPanel", () => {
  it("renders structured session events", () => {
    render(<MentorDebugPanel events={debugEvents} />);

    const content = screen.getByRole("log").textContent || "";
    expect(content).toContain("dynamic variables prepared");
    expect(content).toContain("COURSE_CALIBRATION");
    expect(content).toContain('"debug_mode": true');
  });

  it("copies the complete formatted log", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<MentorDebugPanel events={debugEvents} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy full log" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copiedLog = writeText.mock.calls[0][0];
    expect(copiedLog).toContain("BiteCode AI Mentor debug log");
    expect(copiedLog).toContain("[12:34:56] [PARAMETERS] dynamic variables prepared");
    expect(copiedLog).toContain("COURSE_CALIBRATION");
    expect(formatMentorDebugLog(debugEvents)).toContain("Events: 1");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
