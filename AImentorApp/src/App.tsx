import * as React from "react";
import { useState, useEffect } from "react";

import { Header } from "./components/Header";
import  MentorPanel from "./components/MentorPanel";
import { LessonContent } from "./components/LessonContent"; // ✅ named import
import { Footer } from "./components/Footer";
import { parseLessonEvaluation, type LessonEvaluation } from "./domain/lessonUnderstanding";
import type { LessonPresentationSlide } from "./domain/lessonPresentation";

function formatConcepts(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((item) => `- ${String(item)}`).join("\n");
  } catch {
    // The database also contains ordinary prose and newline-separated concept lists.
  }
  return text;
}

function App() {
  // 🔹 State for lesson data
  const [lessonData, setLessonData] = useState<{
    courseName: string;
    lessonName: string;
    userfirstname?: string;
    knowledgelevel?: string;
    knowledgedomain?: string;
    userpreferences?: string;
    learningmemory?: string;
    knowledgestrengths?: string;
    knowledgegaps?: string;
    practicerecommendations?: string;
    userlearninggoal?: string;
    coursegoal?: string;
    courseprogress?: string;
    conversationtype?: string;
    relationshipperiodkey?: string;
    relationshippromptversion?: string;
    relationshipdefinition?: string;
    relationshipcontext?: string;
    mentorSessionId?: string;
    userId?: string;
    subscriptionId?: string;
    courseId?: string;
    lessonId?: string;
    content?: string;
    signedData?: string;
    signedSig?: string;
    sessionMode?: "demo" | "production";
    previousLessonEvaluation?: LessonEvaluation;
    sections: Array<{ title: string; content: string; type?: "text" | "code" | "tip" }>;
  }>({
    courseName: "Loading...",
    lessonName: "Loading...",
    sections: [
      {
        title: "Loading content...",
        content: "<p>Loading content, please wait...</p>",
        type: "text",
      },
    ],
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [demoConsentAccepted, setDemoConsentAccepted] = useState(false);
  const [demoConsentBusy, setDemoConsentBusy] = useState(false);
  const [demoConsentError, setDemoConsentError] = useState<string | null>(null);
  const [visibleLessonEvaluation, setVisibleLessonEvaluation] = useState<{
    evaluation: LessonEvaluation;
    context: "previous" | "current";
  } | null>(null);
  const [presentationSlide, setPresentationSlide] = useState<LessonPresentationSlide | null>(null);

  // 🔹 Load lesson data from Worker when app starts
  useEffect(() => {
    async function loadLesson() {
      try {
        const params = new URLSearchParams(window.location.search);
        const data = params.get("data");
        const sig = params.get("sig");

        if (!data || !sig) {
          console.warn("Missing parameters in URL.");
          setLoadError("Missing parameters in URL.");
          return;
        }

        // Load LESSON_AGENT_URL from config (required). If loading fails or value is empty,
        // treat that as a lesson load error per requirement (do not use defaults).
        let LESSON_AGENT_URL: string | undefined;
        try {
          const cfg = await import("./config/workerConfig");
          LESSON_AGENT_URL = cfg?.LESSON_AGENT_URL;
        } catch (cfgErr) {
          console.error("Failed to load worker config:", cfgErr);
          setLoadError("Lesson load error");
          return;
        }

        if (!LESSON_AGENT_URL) {
          console.error("Missing LESSON_AGENT_URL in src/config/workerConfig.ts");
          setLoadError("Lesson load error");
          return;
        }

        const res = await fetch(`${LESSON_AGENT_URL}?data=${encodeURIComponent(data)}&sig=${encodeURIComponent(sig)}`);

        const json = await res.json();
        if (!res.ok) {
          console.error("Lesson load error:", json);
          setLoadError("Lesson load error");
          return;
        }

        const mapped = {
          courseName: json.coursename || "Unknown Course",
          lessonName: json.lessonname || "Untitled Lesson",
          userfirstname: json.userfirstname || "Unknown User",
          knowledgelevel: json.knowledgelevel || "Beginner",
          knowledgedomain: json.knowledgedomain || "",
          userpreferences: json.userpreferences || "",
          learningmemory: json.learningmemory || "[]",
          knowledgestrengths: json.knowledgestrengths || "[]",
          knowledgegaps: json.knowledgegaps || "[]",
          practicerecommendations: json.practicerecommendations || "[]",
          userlearninggoal: json.userlearninggoal || "",
          coursegoal: json.coursegoal || "",
          courseprogress: json.courseprogress || "{}",
          conversationtype: json.conversationtype || "NORMAL_LESSON",
          relationshipperiodkey: json.relationshipperiodkey || "",
          relationshippromptversion: json.relationshippromptversion || "lesson-v1",
          relationshipdefinition: json.relationshipdefinition || "{}",
          relationshipcontext: json.relationshipcontext || "{}",
          mentorSessionId: json.mentor_session_id || json.mentorSessionId,
          userId: String(json.userid || json.user_id || json.userId || ""),
          subscriptionId: String(json.subscriptionid || json.subscription_id || json.subscriptionId || ""),
          courseId: String(json.courseid || json.course_id || json.courseId || ""),
          lessonId: String(json.lessonid || json.lesson_id || json.lessonId || ""),
          content: json.content || "<p>No content available.</p>",
          signedData: data,
          signedSig: sig,
          sessionMode: json.sessionmode === "demo" ? "demo" : "production",
          previousLessonEvaluation: parseLessonEvaluation(json.previouslessonevaluation) ?? undefined,

          sections: [
            json.lessongoal && { title: "Lesson goal", content: String(json.lessongoal), type: "tip" as const },
            json.contentdescription && { title: "Topic overview", content: String(json.contentdescription), type: "text" as const },
            json.concepts && { title: "Key concepts", content: formatConcepts(json.concepts), type: "text" as const },
            json.codedescription && { title: "Code focus", content: String(json.codedescription), type: "text" as const },
          ].filter(Boolean) as Array<{ title: string; content: string; type: "text" | "code" | "tip" }>,
        };

        if (!mapped.sections.length) {
          mapped.sections = [{
            title: "Lesson overview",
            content: String(json.content || "No lesson overview is available yet."),
            type: "text",
          }];
        }

        setLessonData(mapped);
      } catch (e) {
        console.error("Failed to fetch lesson:", e);
        setLoadError("Failed to fetch lesson");
      }
    }

    loadLesson();
  }, []);

  const acceptDemoConsent = async () => {
    if (!lessonData.signedData || !lessonData.signedSig) return;
    setDemoConsentBusy(true);
    setDemoConsentError(null);
    try {
      const cfg = await import("./config/workerConfig");
      const consentUrl = cfg.WORKER_AGENT_URL?.replace(/\/agent\/?$/, "/consent");
      if (!consentUrl) throw new Error("Demo consent service is unavailable.");
      const response = await fetch(consentUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: lessonData.signedData, sig: lessonData.signedSig }) });
      if (!response.ok) throw new Error("The demo session could not be activated.");
      setDemoConsentAccepted(true);
    } catch (error) {
      setDemoConsentError(error instanceof Error ? error.message : "The demo session could not be activated.");
    } finally {
      setDemoConsentBusy(false);
    }
  };

  return (
    // If there's a load error, show a minimal error message only
    loadError ? (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F6F6]">
        <div className="text-center p-6 bg-white rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-2">Lesson load error</h2>
          <p className="text-sm text-muted-foreground">{loadError}</p>
        </div>
      </div>
    ) : (
      <div className="mentor-app min-h-screen bg-[#F6F6F6] flex flex-col">
        {lessonData.sessionMode === "demo" && !demoConsentAccepted && (
          <div className="fixed inset-0 z-[100] bg-[#10251b]/80 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-3xl bg-white p-7 md:p-9 shadow-2xl">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#23845a] mb-3">BiteCode AI Mentor demo</div>
              <h2 className="text-3xl font-bold mb-4">You are opening AI Mentor in demo mode</h2>
              <div className="space-y-3 text-[#52615a] leading-relaxed">
                <p>This session uses a scenario prepared by the demo administrator.</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your conversation and answers may be processed to evaluate the test.</li>
                  <li>The configured administrator will receive the scenario parameters and session outcome.</li>
                  <li>Demo session data will not be saved to the BiteCode learner database.</li>
                  <li>This session is not connected to a BiteCode subscription and will not update learning progress or daily usage.</li>
                  <li>Do not share sensitive, private, or confidential information.</li>
                </ul>
              </div>
              {demoConsentError && <p className="mt-4 text-sm text-red-700">{demoConsentError}</p>}
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={acceptDemoConsent} disabled={demoConsentBusy} className="rounded-xl bg-[#176f4a] px-5 py-3 font-semibold text-white disabled:opacity-60">{demoConsentBusy ? "Activating…" : "I understand and consent"}</button>
                <button type="button" onClick={() => { window.location.href = "https://www.bitecode.co"; }} className="rounded-xl bg-[#e4f4e9] px-5 py-3 font-semibold text-[#17613f]">Leave demo</button>
              </div>
            </div>
          </div>
        )}
        {lessonData.sessionMode !== "demo" && <Header courseName={lessonData.courseName} />}

        {/* Main content */}
        <main className="mentor-app-main flex-1 w-full max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left side - Mentor Panel */}
            <div className="lg:col-span-2 order-1">
              <div className="lg:sticky lg:top-24">
                <MentorPanel 
                  userfirstname={lessonData.userfirstname}
                  coursename={lessonData.courseName}
                  lessonname={lessonData.lessonName}
                  content={lessonData.content}
                  knowledgelevel={lessonData.knowledgelevel}
                  knowledgedomain={lessonData.knowledgedomain}
                  userpreferences={lessonData.userpreferences}
                  learningmemory={lessonData.learningmemory}
                  knowledgestrengths={lessonData.knowledgestrengths}
                  knowledgegaps={lessonData.knowledgegaps}
                  practicerecommendations={lessonData.practicerecommendations}
                  userlearninggoal={lessonData.userlearninggoal}
                  coursegoal={lessonData.coursegoal}
                  courseprogress={lessonData.courseprogress}
                  conversationtype={lessonData.conversationtype}
                  relationshipperiodkey={lessonData.relationshipperiodkey}
                  relationshippromptversion={lessonData.relationshippromptversion}
                  relationshipdefinition={lessonData.relationshipdefinition}
                  relationshipcontext={lessonData.relationshipcontext}
                  mentorSessionId={lessonData.mentorSessionId}
                  userId={lessonData.userId}
                  subscriptionId={lessonData.subscriptionId}
                  courseId={lessonData.courseId}
                  lessonId={lessonData.lessonId}
                  signedData={lessonData.signedData}
                  signedSig={lessonData.signedSig}
                  previousLessonEvaluation={lessonData.previousLessonEvaluation}
                  onLessonEvaluationVisible={(evaluation, context) => {
                    setVisibleLessonEvaluation({ evaluation, context });
                  }}
                  onLessonPresentationChange={(slide) => {
                    setPresentationSlide(slide);
                    if (!slide) setVisibleLessonEvaluation(null);
                  }}
                />
              </div>
            </div>

            {/* Right side - Lesson Content */}
            <div className="lg:col-span-3 order-2">
              <div className="lesson-shell bg-white rounded-3xl shadow-lg border border-[#E0E0E0] p-0 md:p-8">
                <LessonContent
                  lessonName={lessonData.lessonName}
                  sections={lessonData.sections}
                  lessonEvaluation={visibleLessonEvaluation}
                  presentationSlide={presentationSlide}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    )
  );
}

export default App;
