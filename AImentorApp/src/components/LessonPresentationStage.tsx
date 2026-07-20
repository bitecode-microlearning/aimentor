import React from "react";
import { BookOpen, CheckCircle2, CircleHelp, ClipboardCheck, Code2, ListChecks, RefreshCw, Sparkles, XCircle } from "lucide-react";
import type { LessonEvaluation } from "../domain/lessonUnderstanding";
import type { LessonPresentationSlide } from "../domain/lessonPresentation";
import { LessonUnderstandingStatusCard } from "./LessonUnderstandingStatusCard";
import coffeeCupBase from "../assets/mentor/coffee-cup-base.svg";
import coffeeCupBody from "../assets/mentor/coffee-cup-body.svg";
import coffeeCupHandle from "../assets/mentor/coffee-cup-handle.svg";
import coffeeCupSteam from "../assets/mentor/coffee-cup-steam.svg";
import coffeeSparkle from "../assets/mentor/coffee-sparkle.svg";

interface LessonPresentationStageProps {
  lessonName: string;
  slide?: LessonPresentationSlide | null;
  evaluation?: {
    evaluation: LessonEvaluation;
    context: "previous" | "current";
  } | null;
}

const DONATION_URL = "https://buymeacoffee.com/bitecode";

function SlideList({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="lesson-stage-list">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}><span aria-hidden="true"><ListChecks size={18} /></span><span>{item}</span></li>
      ))}
    </ul>
  );
}

function CodeWindow({ slide }: { slide: Extract<LessonPresentationSlide, { type: "code" }> }) {
  const lines = slide.code.replace(/\r\n/g, "\n").split("\n");
  return (
    <div className="lesson-stage-code-window">
      <div className="lesson-stage-code-toolbar">
        <span className="lesson-stage-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>{slide.title}</span>
        <span className="lesson-stage-language">{slide.language}</span>
      </div>
      <pre aria-label={`${slide.language} code example`}><code>
        {lines.map((line, index) => (
          <span className="lesson-stage-code-line" key={index}>
            <span className="lesson-stage-line-number" aria-hidden="true">{index + 1}</span>
            <span>{line || " "}</span>
          </span>
        ))}
      </code></pre>
    </div>
  );
}

export function LessonPresentationStage({ lessonName, slide, evaluation }: LessonPresentationStageProps) {
  const renderEvaluation = (context: "previous" | "current") => evaluation?.context === context && (
    <LessonUnderstandingStatusCard
      lessonName={evaluation.evaluation.lessonName}
      status={evaluation.evaluation.status}
      context={context}
      compact={context === "previous"}
    />
  );

  if (!slide) {
    if (evaluation?.context === "previous") {
      return <div className="lesson-stage lesson-stage-review" aria-live="polite">{renderEvaluation("previous")}</div>;
    }
    return (
      <section className="lesson-stage lesson-stage-intro" aria-labelledby="lesson-stage-intro-title">
        <div className="lesson-stage-heading"><BookOpen size={26} aria-hidden="true" /><p>Interactive lesson</p></div>
        <h3 id="lesson-stage-intro-title">Ready when you are</h3>
        <p>Start the AI mentor session. Key topics, questions, and examples will appear here as the conversation progresses.</p>
      </section>
    );
  }

  if (slide.type === "topic") {
    return (
      <section className="lesson-stage lesson-stage-topic" aria-live="polite">
        <div className="lesson-stage-heading"><BookOpen size={26} aria-hidden="true" /><p>Current topic</p></div>
        <h3>{slide.title}</h3>
        <SlideList items={slide.points} />
      </section>
    );
  }

  if (slide.type === "review") {
    return (
      <section className="lesson-stage lesson-stage-review" aria-live="polite">
        <div className="lesson-stage-heading"><ClipboardCheck size={26} aria-hidden="true" /><p>Last time</p></div>
        <h3>{slide.title}</h3>
        <div className="lesson-stage-recap-columns">
          <div className="lesson-stage-recap-group lesson-stage-recap-good">
            <h4><CheckCircle2 size={20} aria-hidden="true" /> What went well</h4>
            <SlideList items={slide.wentWell} />
          </div>
          <div className="lesson-stage-recap-group lesson-stage-recap-check">
            <h4><RefreshCw size={20} aria-hidden="true" /> Check again</h4>
            <SlideList items={slide.checkAgain} />
          </div>
        </div>
      </section>
    );
  }

  if (slide.type === "question") {
    return (
      <section className="lesson-stage lesson-stage-question" aria-live="polite" aria-label="Mentor question">
        <div className="lesson-stage-heading"><CircleHelp size={28} aria-hidden="true" /><p>{slide.questionKind === "true_false" ? "True or false?" : "Explain your thinking"}</p></div>
        <blockquote>{slide.question}</blockquote>
      </section>
    );
  }

  if (slide.type === "answer_feedback") {
    const feedback = {
      correct: {
        label: "Correct",
        description: "That answer captures the key idea. Nice work—let’s build on it.",
        icon: CheckCircle2,
      },
      not_quite: {
        label: "Almost there",
        description: "You’re close, but one detail needs adjusting.",
        icon: XCircle,
      },
      wrong: {
        label: "Not yet",
        description: "That doesn't match the concept yet. Review the concept and try again.",
        icon: XCircle,
      },
    }[slide.result];
    const FeedbackIcon = feedback.icon;
    const feedbackMessage = slide.message || (slide.result === "not_quite"
      ? "You're on the right track but missed a key detail. Review the concept and try again."
      : feedback.description);
    return (
      <section
        key={slide.result}
        className={`lesson-stage lesson-stage-feedback lesson-stage-feedback-${slide.result}`}
        aria-live="polite"
        role="status"
        aria-label={`Answer feedback: ${feedback.label}`}
      >
        <span className="lesson-stage-feedback-icon" aria-hidden="true">
          <FeedbackIcon size={34} strokeWidth={2.6} />
        </span>
        <p className="lesson-stage-kicker">Answer feedback</p>
        <h3>{feedback.label}</h3>
        <p>{feedbackMessage}</p>
      </section>
    );
  }

  if (slide.type === "code") {
    return (
      <section className="lesson-stage lesson-stage-code" aria-live="polite">
        <div className="lesson-stage-heading"><Code2 size={26} aria-hidden="true" /><p>Code and data example</p></div>
        <CodeWindow slide={slide} />
        {slide.explanation && <p className="lesson-stage-supporting">{slide.explanation}</p>}
      </section>
    );
  }

  if (slide.type === "donation") {
    return (
      <section className="lesson-stage lesson-stage-donation" aria-live="polite">
        <div className="lesson-stage-coffee-visual" aria-hidden="true">
          <span className="lesson-stage-coffee-cup">
            <img className="lesson-stage-coffee-base" src={coffeeCupBase} alt="" />
            <img className="lesson-stage-coffee-body" src={coffeeCupBody} alt="" />
            <img className="lesson-stage-coffee-handle" src={coffeeCupHandle} alt="" />
            <img className="lesson-stage-coffee-steam" src={coffeeCupSteam} alt="" />
          </span>
          <img className="lesson-stage-coffee-sparkle" src={coffeeSparkle} alt="" />
        </div>
        <p className="lesson-stage-kicker">Help BiteCode stay independent</p>
        <h3>Enjoying your AI Mentor session?</h3>
        <p>A small coffee helps keep BiteCode independent, ad-free, and available for more learners.</p>
        <a className="lesson-stage-coffee-button" href={DONATION_URL} target="_blank" rel="noreferrer">
          <span>Buy me a coffee</span>
          <span aria-hidden="true">→</span>
          <span className="lesson-stage-coffee-shine" aria-hidden="true" />
        </a>
      </section>
    );
  }

  return (
    <section className="lesson-stage lesson-stage-summary" aria-live="polite">
      <div className="lesson-stage-heading"><Sparkles size={28} aria-hidden="true" /><p>Session complete</p></div>
      <h3>{slide.title && slide.title !== lessonName ? slide.title : "Your lesson result"}</h3>
      {renderEvaluation("current")}
      <SlideList items={slide.coveredTopics} />
      {slide.takeaway && <p className="lesson-stage-takeaway"><strong>Key takeaway:</strong> {slide.takeaway}</p>}
      <p className="lesson-stage-thanks">{slide.encouragement || "Thanks for taking part in this AI mentor session."}</p>
    </section>
  );
}

export type { LessonPresentationStageProps };
