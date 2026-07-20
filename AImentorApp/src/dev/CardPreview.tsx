import React, { useState } from "react";
import { RotateCcw } from "lucide-react";
import { LessonPresentationStage } from "../components/LessonPresentationStage";
import type { LessonPresentationSlide } from "../domain/lessonPresentation";

type PreviewState = "correct" | "not_quite" | "wrong" | "donation";

const previewSlides: Record<PreviewState, LessonPresentationSlide> = {
  correct: {
    type: "answer_feedback",
    result: "correct",
    message: "That answer captures the key idea. Nice work—let's build on it.",
  },
  not_quite: {
    type: "answer_feedback",
    result: "not_quite",
    message: "You're on the right track but missed a key detail. Review the concept and try again.",
  },
  wrong: {
    type: "answer_feedback",
    result: "wrong",
    message: "That doesn't match the concept yet. Review the concept and try again.",
  },
  donation: { type: "donation" },
};

const previewLabels: Record<PreviewState, string> = {
  correct: "Correct",
  not_quite: "Almost there",
  wrong: "Not yet",
  donation: "Buy Me a Coffee",
};

export function CardPreview() {
  const [previewState, setPreviewState] = useState<PreviewState>("correct");
  const [animationRun, setAnimationRun] = useState(0);

  const showState = (nextState: PreviewState) => {
    setPreviewState(nextState);
    setAnimationRun((run) => run + 1);
  };

  return (
    <main style={{ minHeight: "100vh", padding: "32px 20px", background: "#f3f7fa", color: "#0f172a" }}>
      <div style={{ width: "min(100%, 900px)", margin: "0 auto" }}>
        <p style={{ margin: "0 0 8px", color: "#1376c8", fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase" }}>
          Development preview — no signed URL required
        </p>
        <h1 style={{ margin: "0 0 10px", fontSize: "clamp(28px, 5vw, 44px)", lineHeight: 1.1 }}>
          AI Mentor card preview
        </h1>
        <p style={{ margin: "0 0 24px", color: "#52615a", lineHeight: 1.6 }}>
          Switch states or replay the current state to restart its entrance and micro-interactions.
        </p>

        <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
          {(Object.keys(previewSlides) as PreviewState[]).map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => showState(state)}
              aria-pressed={previewState === state}
              style={{
                minHeight: 42,
                padding: "0 16px",
                cursor: "pointer",
                border: previewState === state ? "1px solid #1376c8" : "1px solid #cfd8e3",
                borderRadius: 10,
                color: previewState === state ? "#fff" : "#263442",
                background: previewState === state ? "#1376c8" : "#fff",
                font: "inherit",
                fontWeight: 750,
              }}
            >
              {previewLabels[state]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAnimationRun((run) => run + 1)}
            style={{ minHeight: 42, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", cursor: "pointer", border: "1px solid #cfd8e3", borderRadius: 10, color: "#263442", background: "#fff", font: "inherit", fontWeight: 750 }}
          >
            <RotateCcw size={17} aria-hidden="true" /> Replay animation
          </button>
        </div>

        <div key={`${previewState}-${animationRun}`} style={{ padding: "clamp(16px, 4vw, 32px)", background: "#fff", border: "1px solid #e0e6ec", borderRadius: 28, boxShadow: "0 18px 48px rgba(20, 32, 49, .1)" }}>
          <LessonPresentationStage
            lessonName="AI Mentor visual preview"
            slide={previewSlides[previewState]}
          />
        </div>
      </div>
    </main>
  );
}
