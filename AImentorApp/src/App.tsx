import React, { useEffect, useState } from "react";
import MentorPanel from "./components/MentorPanel";

function App() {
  const [lessonData, setLessonData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLesson() {
      try {
        const params = new URLSearchParams(window.location.search);
        const data = params.get("data");
        const sig = params.get("sig");

        if (!data || !sig) {
          setError("Missing parameters in URL.");
          setLoading(false);
          return;
        }

        const res = await fetch(
          `https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/lesson?data=${encodeURIComponent(
            data
          )}&sig=${encodeURIComponent(sig)}`
        );

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to load lesson");
        }

        setLessonData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadLesson();
  }, []);

  if (loading) return <div className="loading">Loading lesson...</div>;
  if (error) return <div className="error">❌ {error}</div>;

  return (
    <div className="lesson-container">
      <h1>{lessonData.lessonname}</h1>
      <h3>{lessonData.coursename}</h3>
      <div
        className="lesson-content"
        dangerouslySetInnerHTML={{ __html: lessonData.content }}
      ></div>
      <MentorPanel userName={lessonData.userfirstname} />
    </div>
  );
}

export default App;
