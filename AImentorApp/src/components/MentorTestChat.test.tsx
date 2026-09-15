import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MentorTestChat } from "./MentorTestChat";
afterEach(cleanup);
describe("mentor test chat", () => {
  it("sends a typed solution and exposes mentor replies to browser automation", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MentorTestChat connected messages={[{ role: "agent", text: "Explain your query.", timestamp: "now" }]} onSend={onSend} onEnd={() => {}} />);
    expect(screen.getByRole("log").textContent).toContain("Explain your query.");
    fireEvent.change(screen.getByLabelText("Message to mentor"), { target: { value: "SELECT name FROM users;" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("SELECT name FROM users;"));
    await waitFor(() => expect((screen.getByLabelText("Message to mentor") as HTMLTextAreaElement).value).toBe(""));
  });
  it("retains a failed message and prevents sending while disconnected", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("Connection lost"));
    const view = render(<MentorTestChat connected messages={[]} onSend={onSend} onEnd={() => {}} />);
    fireEvent.change(screen.getByLabelText("Message to mentor"), { target: { value: "My solution" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Connection lost"));
    expect((screen.getByLabelText("Message to mentor") as HTMLTextAreaElement).value).toBe("My solution");
    view.rerender(<MentorTestChat connected={false} messages={[]} onSend={onSend} onEnd={() => {}} />);
    expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
