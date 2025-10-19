import React from 'react';
import { Header } from './components/Header';
import { MentorPanel } from './components/MentorPanel';
import { LessonContent } from './components/LessonContent';
import { Footer } from './components/Footer';

const lessonData = {
  courseName: "Learn Python Pandas",
  lessonName: "Cross tabulations",
  sections: [
    {
      title: "Cross tabulations",
      content: `
      1) What is Cross Tabulation (Crosstab)? 📊
      A cross tabulation is a contingency table that displays the relationship between two (or more) categorical variables. Values are organized into rows and columns, showing counts or percentages so you can quickly see how categories intersect and where patterns or differences appear.
      2) Why and When to Use It 🎯
      • Compare categories across groups (e.g., feature usage by user segment).
      • Reveal associations or independence between variables (e.g., device type vs. conversion).
      • Summarize distributions compactly for reporting and quick decision-making.
      • Power exploratory analysis before modeling, A/B testing summaries, and quality checks.

      3) Interpreting and Practical Tips 🔍
      • Prefer proportions (row% or column%) alongside counts; include marginal totals and a grand total ✅
      • Choose orientation wisely: row% answers “within this row, how do columns differ?”; column% answers the inverse.
      • Watch for sparse cells; combine levels or collect more data when counts are tiny ⚠️
      • For significance, use a chi-square test (or Fisher’s exact for small samples).
      • Handle missing/unknown consistently (explicit category vs. exclusion). Use heatmap-style highlighting to surface patterns fast ✨`,
      type: 'text' as const
    }
  ]
};

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
