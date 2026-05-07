import React from "react";
import { Mic, MicOff, PhoneOff, X } from "lucide-react";
import { Button } from "./ui/button";
import type { MentorControlState } from "./mentorControls";

interface MentorControlBarProps {
  state: MentorControlState;
  isMicMuted: boolean;
  isBusy?: boolean;
  onMuteToggle: () => void;
  onDone: () => void;
  onCancelAsk: () => void;
  onEndSession: () => void;
}

function ControlButton({
  children,
  ariaLabel,
  variant = "primary",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  variant?: "primary" | "secondary" | "success" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) {
  const variants = {
    primary: "bg-[#FE9613] hover:bg-[#e88710] text-white",
    secondary: "bg-white hover:bg-[#F6F6F6] text-[#333333] border border-[#E0E0E0]",
    success: "bg-[#00CE8D] hover:bg-[#00b87d] text-white",
    danger: "bg-red-500 hover:bg-red-600 text-white",
  };

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`min-h-12 rounded-full px-4 shadow-lg disabled:opacity-60 ${variants[variant]}`}
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-sm font-medium">{children}</span>
    </Button>
  );
}

export function MentorControlBar({
  state,
  isMicMuted,
  isBusy = false,
  onMuteToggle,
  onDone,
  onCancelAsk,
  onEndSession,
}: MentorControlBarProps) {
  if (state === "idle" || state === "disconnected" || state === "error") {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-4 right-4 z-10">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-[#E0E0E0] bg-[#ECE9E6]/95 p-3 shadow-2xl backdrop-blur-sm">
        {state === "connecting" && (
          <div className="min-h-12 rounded-full bg-white px-4 py-3 text-sm font-medium text-[#666666] shadow-lg">
            Connecting...
          </div>
        )}

        {state === "mentor_speaking" && (
          <>
            <ControlButton ariaLabel={isMicMuted ? "Unmute microphone" : "Mute microphone"} variant={isMicMuted ? "success" : "primary"} disabled={isBusy} onClick={onMuteToggle}>
              {isMicMuted ? <Mic size={18} /> : <MicOff size={18} />}
              {isMicMuted ? "Unmute" : "Mute"}
            </ControlButton>
          </>
        )}

        {state === "mentor_waiting_for_answer" && (
          <>
            <ControlButton ariaLabel={isMicMuted ? "Unmute microphone" : "Mute microphone"} variant={isMicMuted ? "success" : "primary"} disabled={isBusy} onClick={onMuteToggle}>
              {isMicMuted ? <Mic size={18} /> : <MicOff size={18} />}
              {isMicMuted ? "Unmute" : "Mute"}
            </ControlButton>
          </>
        )}

        {state === "user_question_mode" && (
          <>
            <ControlButton ariaLabel="Done asking question" variant="success" disabled={isBusy} onClick={onDone}>
              <MicOff size={18} /> Done
            </ControlButton>
            <ControlButton ariaLabel="Cancel question" variant="secondary" disabled={isBusy} onClick={onCancelAsk}>
              <X size={18} /> Cancel
            </ControlButton>
          </>
        )}

        {state === "user_speaking" && (
          <>
            <ControlButton ariaLabel={isMicMuted ? "Unmute microphone" : "Mute microphone"} variant={isMicMuted ? "success" : "primary"} disabled={isBusy} onClick={onMuteToggle}>
              {isMicMuted ? <Mic size={18} /> : <MicOff size={18} />}
              {isMicMuted ? "Unmute" : "Mute"}
            </ControlButton>
            <ControlButton ariaLabel="Done answering" variant="success" disabled={isBusy} onClick={onDone}>
              Done
            </ControlButton>
          </>
        )}

        <ControlButton ariaLabel="End mentor session" variant="danger" disabled={isBusy && state === "connecting"} onClick={onEndSession}>
          <PhoneOff size={18} /> End session
        </ControlButton>
      </div>
    </div>
  );
}
