import * as React from "react";
import { useState, useEffect } from "react";

import { Header } from "./components/Header";
import  MentorPanel from "./components/MentorPanel";
import { LessonContent } from "./components/LessonContent"; // ✅ named import
import { Footer } from "./components/Footer";

function App() {
  // 🔹 State for lesson data
  const [lessonData, setLessonData] = useState<{
    courseName: string;
    lessonName: string;
    userfirstname?: string;
    knowledgelevel?: string;
    content?: string;
    signedData?: string;
    signedSig?: string;
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
          content: json.content || "<p>No content available.</p>",
          signedData: data,
          signedSig: sig,

          sections: [
            {
              title: "Lesson",
              content: String(json.content || "<p>No content available.</p>"),
              type: "text" as const,
            },
          ],
        };

        setLessonData(mapped);
      } catch (e) {
        console.error("Failed to fetch lesson:", e);
        setLoadError("Failed to fetch lesson");
      }
    }

    loadLesson();
  }, []);

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
      <div className="min-h-screen bg-[#F6F6F6] flex flex-col">
        {/* Header */}
        <Header courseName={lessonData.courseName} />

        {/* Main content */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
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
                  signedData={lessonData.signedData}
                  signedSig={lessonData.signedSig}
                />
              </div>
            </div>

            {/* Right side - Lesson Content */}
            <div className="lg:col-span-3 order-2">
              <div className="bg-white rounded-3xl shadow-lg border border-[#E0E0E0] p-0 md:p-8">
                <LessonContent
                  lessonName={lessonData.lessonName}
                  sections={lessonData.sections}
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
