import * as React from "react";
import { useState, useEffect } from "react";

import Header from "./components/Header";
import LessonContent from "./components/LessonContent";
import MentorPanel from "./components/MentorPanel";
import Footer from "./components/Footer";

function App() {
  // 🔹 State for lesson data
  const [lessonData, setLessonData] = useState<{
    courseName: string;
    lessonName: string;
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

  // 🔹 Load lesson data from Worker when app starts
  useEffect(() => {
    async function loadLesson() {
      try {
        const params = new URLSearchParams(window.location.search);
        const data = params.get("data");
        const sig = params.get("sig");

        if (!data || !sig) {
          console.warn("Missing parameters in URL.");
          return;
        }

        const res = await fetch(
          `https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/lesson?data=${encodeURIComponent(
            data
          )}&sig=${encodeURIComponent(sig)}`
        );

        const json = await res.json();
        if (!res.ok) {
          console.error("Lesson load error:", json);
          return;
        }

        const mapped = {
          courseName: json.coursename || json.courseName || "Unknown Course",
          lessonName: json.lessonname || json.lessonName || "Untitled Lesson",
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
      }
    }

    loadLesson();
  }, []);

  return (
    <div className="min-h-screen bg-[#F6F6F6] flex flex-col">
      {/* Header */}
      <Header courseName={lessonData.courseName} />

      {/* Main content */}
      <main className="flex-1 container mx-auto px-4 md:px-8 py-10">
        <div className="grid lg:grid-cols-5 gap-8">
          {/* Left side - Mentor Panel */}
          <div className="lg:col-span-2 order-1">
            <div className="lg:sticky lg:top-24">
              <MentorPanel mentorName="Anna" />
            </div>
          </div>

          {/* Right side - Lesson Content */}
          <div className="lg:col-span-3 order-2">
            <div className="bg-white rounded-3xl shadow-lg border border-[#E0E0E0] p-6 md:p-8">
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
  );
}

export default App;
