import React from "react";
import { Award, Check, RefreshCw } from "lucide-react";
import type { LessonUnderstandingStatus } from "../domain/lessonUnderstanding";

interface LessonUnderstandingStatusCardProps {
  lessonName: string;
  status: LessonUnderstandingStatus;
  context: "previous" | "current";
  compact?: boolean;
  onContinue?: () => void;
  onReview?: () => void;
}

const statusOrder: LessonUnderstandingStatus[] = ["needs_review", "understood", "mastered"];
const statusDetails = {
  mastered: {
    label: "Mastered",
    description: "You showed a strong understanding of this topic.",
    previousDescription: "You showed a strong understanding of this topic in the previous session.",
    icon: Award,
  },
  understood: {
    label: "Understood",
    description: "You understood the key ideas of this lesson.",
    previousDescription: "You understood the key ideas of this topic in the previous session.",
    icon: Check,
  },
  needs_review: {
    label: "Needs Review",
    description: "A short review will help strengthen this topic.",
    previousDescription: "This topic was marked for additional practice after the previous session.",
    icon: RefreshCw,
  },
} as const;

export function LessonUnderstandingStatusCard({
  lessonName,
  status,
  context,
  compact = false,
  onContinue,
  onReview,
}: LessonUnderstandingStatusCardProps) {
  const details = statusDetails[status];
  const StatusIcon = details.icon;
  const isPrevious = context === "previous";
  const continueLabel = status === "mastered" ? "Continue to next lesson" : status === "needs_review" ? "Continue anyway" : "Continue";

  return (
    <section
      className={`lesson-understanding-card lesson-understanding-${status}${compact ? " is-compact" : ""}`}
      aria-labelledby={`lesson-understanding-${context}-title`}
      aria-describedby={`lesson-understanding-${context}-description`}
      data-status={status}
    >
      <div className="lesson-understanding-copy">
        <p className="lesson-understanding-eyebrow">{isPrevious ? "Previous lesson" : "Lesson outcome"}</p>
        <h2 id={`lesson-understanding-${context}-title`}>{lessonName}</h2>
        <div className="lesson-understanding-result" role="status" aria-live={isPrevious ? "off" : "polite"}>
          <span className="lesson-understanding-icon" aria-hidden="true"><StatusIcon size={compact ? 22 : 28} /></span>
          <div>
            <strong>{details.label}</strong>
            <p id={`lesson-understanding-${context}-description`}>
              {isPrevious ? details.previousDescription : details.description}
            </p>
          </div>
        </div>
      </div>

      <ol className="lesson-understanding-track" aria-label="Understanding progress scale">
        {statusOrder.map((step) => {
          const StepIcon = statusDetails[step].icon;
          return (
            <li key={step} className={step === status ? "is-active" : ""} aria-current={step === status ? "step" : undefined}>
              <span aria-hidden="true"><StepIcon size={16} /></span>
              <span>{statusDetails[step].label}</span>
            </li>
          );
        })}
      </ol>

      {!compact && (onContinue || onReview) && (
        <div className="lesson-understanding-actions">
          {status !== "mastered" && onReview && (
            <button type="button" className="lesson-understanding-primary" onClick={onReview}>Review key takeaway</button>
          )}
          {onContinue && (
            <button
              type="button"
              className={status === "mastered" || status === "understood" ? "lesson-understanding-primary" : "lesson-understanding-secondary"}
              onClick={onContinue}
            >
              {continueLabel}
            </button>
          )}
          {status === "mastered" && <p>This topic has been added to your strengths.</p>}
        </div>
      )}
    </section>
  );
}

export type { LessonUnderstandingStatusCardProps };
