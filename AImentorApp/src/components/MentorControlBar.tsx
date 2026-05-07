import React from "react";
import { HelpCircle, Mic, MicOff, Rabbit, RotateCcw, SkipForward, Snail, X } from "lucide-react";
import { Button } from "./ui/button";
import type { MentorControlState, SpeakingSpeedPreference } from "./mentorControls";

interface MentorControlBarProps {
  state: MentorControlState;
  isMicMuted: boolean;
  speedPreference: SpeakingSpeedPreference;
  isBusy?: boolean;
  onRepeat: () => void;
  onSlower: () => void;
  onFaster: () => void;
  onAsk: () => void;
  onHint: () => void;
  onSkip: () => void;
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

function MicState({ isMicMuted }: { isMicMuted: boolean }) {
  return (
    <div
      className={`flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-medium shadow-lg ${
        isMicMuted ? "bg-white text-[#666666]" : "bg-[#00CE8D] text-white"
      }`}
      aria-live="polite"
    >
      {isMicMuted ? <MicOff size={18} /> : <Mic size={18} />}
      <span>{isMicMuted ? "Microphone muted" : "Microphone on"}</span>
    </div>
  );
}

export function MentorControlBar({
  state,
  isMicMuted,
  speedPreference,
  isBusy = false,
  onRepeat,
  onSlower,
  onFaster,
  onAsk,
  onHint,
  onSkip,
  onMuteToggle,
  onDone,
  onCancelAsk,
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
            <ControlButton ariaLabel="Repeat last explanation" variant="secondary" disabled={isBusy} onClick={onRepeat}>
              <RotateCcw size={18} /> Repeat
            </ControlButton>
            <ControlButton ariaLabel="Ask mentor to speak slower" variant={speedPreference === "slow" ? "primary" : "secondary"} disabled={isBusy} onClick={onSlower}>
              <Snail size={18} /> Slower
            </ControlButton>
            <ControlButton ariaLabel="Ask mentor to speak faster" variant={speedPreference === "fast" ? "primary" : "secondary"} disabled={isBusy} onClick={onFaster}>
              <Rabbit size={18} /> Faster
            </ControlButton>
            <ControlButton ariaLabel="Ask a question" variant="success" disabled={isBusy} onClick={onAsk}>
              <Mic size={18} /> Ask
            </ControlButton>
            <span className="basis-full text-center text-xs font-medium text-[#666666]">Speed: {speedPreference}</span>
          </>
        )}

        {state === "mentor_waiting_for_answer" && (
          <>
            <MicState isMicMuted={isMicMuted} />
            <ControlButton ariaLabel="Ask for a hint" variant="secondary" disabled={isBusy} onClick={onHint}>
              <HelpCircle size={18} /> Hint
            </ControlButton>
            <ControlButton ariaLabel="Skip current question" variant="secondary" disabled={isBusy} onClick={onSkip}>
              <SkipForward size={18} /> Skip
            </ControlButton>
            <ControlButton ariaLabel={isMicMuted ? "Unmute microphone" : "Mute microphone"} variant={isMicMuted ? "success" : "primary"} disabled={isBusy} onClick={onMuteToggle}>
              {isMicMuted ? <Mic size={18} /> : <MicOff size={18} />}
              {isMicMuted ? "Unmute" : "Mute"}
            </ControlButton>
          </>
        )}

        {state === "user_question_mode" && (
          <>
            <MicState isMicMuted={isMicMuted} />
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
            <MicState isMicMuted={isMicMuted} />
            <ControlButton ariaLabel={isMicMuted ? "Unmute microphone" : "Mute microphone"} variant={isMicMuted ? "success" : "primary"} disabled={isBusy} onClick={onMuteToggle}>
              {isMicMuted ? <Mic size={18} /> : <MicOff size={18} />}
              {isMicMuted ? "Unmute" : "Mute"}
            </ControlButton>
            <ControlButton ariaLabel="Done answering" variant="success" disabled={isBusy} onClick={onDone}>
              Done
            </ControlButton>
          </>
        )}

        {state === "muted_waiting" && (
          <>
            <MicState isMicMuted={isMicMuted} />
            <ControlButton ariaLabel="Ask a question" variant="success" disabled={isBusy} onClick={onAsk}>
              <Mic size={18} /> Ask
            </ControlButton>
          </>
        )}
      </div>
    </div>
  );
}
