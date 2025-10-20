import React from 'react';
import { Header } from './components/Header';
import { MentorPanel } from './components/MentorPanel';
import { LessonContent } from './components/LessonContent';
import { Footer } from './components/Footer';


const [lessonData, setLessonData] = React.useState<{ courseName: string; lessonName: string; sections: Array<{title:string; content:string; type?: 'text'|'code'|'tip'}> }>({
  courseName: "Learn Python Pandas",
  lessonName: "Cross tabulations",
  sections: [
    {
      title: "Overview",
      content: "<p>Loading content...</p>",
      type: "text",
    },
  ],
});

React.useEffect(() => {
  async function loadLesson() {
    try {
      const params = new URLSearchParams(window.location.search);
      const data = params.get("data");
      const sig = params.get("sig");
      if (!data || !sig) return;
      const res = await fetch(
        `https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/lesson?data=${encodeURIComponent(data)}&sig=${encodeURIComponent(sig)}`
      );
      const json = await res.json();
      if (!res.ok) {
        console.error("Lesson load error:", json);
        return;
      }
      const mapped = {
        courseName: json.coursename || json.courseName || "Course",
        lessonName: json.lessonname || json.lessonName || "Lesson",
        sections: [
          {
            title: "Lesson",
            content: String(json.content || ""),
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


export default function App() {
  return (
    <div className="flex flex-col min-h-screen bg-[#F6F6F6]">
      <Header courseName={lessonData.courseName} />
      
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Mentor Panel - 2 columns on large screens */}
          <div className="lg:col-span-2 order-1">
            <div className="lg:sticky lg:top-24">
              <MentorPanel mentorName="Anna" />
            </div>
          </div>
          
          {/* Lesson Content - 3 columns on large screens */}
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
      
      <Footer />
    </div>
  );
}
