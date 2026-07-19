import React from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle2, BookOpen, Code, Lightbulb } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { LessonUnderstandingStatusCard } from './LessonUnderstandingStatusCard';
import type { LessonEvaluation } from '../domain/lessonUnderstanding';

interface LessonSection {
  title: string;
  content: string;
  type?: 'text' | 'code' | 'tip';
}

interface LessonContentProps {
  lessonName: string;
  sections: LessonSection[];
  lessonEvaluation?: {
    evaluation: LessonEvaluation;
    context: 'previous' | 'current';
  } | null;
}

export function LessonContent({ lessonName, sections, lessonEvaluation }: LessonContentProps) {
  return (
    <div className="lesson-content-panel space-y-6">
      {/* Lesson Header */}
      <div className="border-b-4 border-[#1376C8] pb-4">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="text-[#1376C8]" size={32} />
          <h2 className="m-0">{lessonName}</h2>
        </div>
        <Badge className="bg-[#00CE8D] text-white hover:bg-[#00b87d]">
          Interactive Lesson
        </Badge>
      </div>

      {/* Lesson Introduction */}
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-transparent border-[#1376C8] border-l-4">
        <p className="m-0 text-[#666]">
          Welcome to this interactive lesson! Your AI mentor is ready to help you understand the concepts. 
          Click the chat button to start a conversation and ask questions at any time.
        </p>
      </Card>

      {lessonEvaluation && (
        <LessonUnderstandingStatusCard
          lessonName={lessonEvaluation.evaluation.lessonName}
          status={lessonEvaluation.evaluation.status}
          context={lessonEvaluation.context}
          compact={lessonEvaluation.context === 'previous'}
        />
      )}

      {/* Lesson Sections */}
      <div className="space-y-4">
        {sections.map((section, index) => (
          <Card key={index} className="p-6 hover:shadow-lg transition-shadow">
            <div className="flex items-start gap-3 mb-3">
              {section.type === 'code' && <Code className="text-[#1376C8] flex-shrink-0 mt-1" size={24} />}
              {section.type === 'tip' && <Lightbulb className="text-[#00CE8D] flex-shrink-0 mt-1" size={24} />}
              {!section.type && <CheckCircle2 className="text-[#1376C8] flex-shrink-0 mt-1" size={24} />}
              <div className="flex-1">
                <h3 className="mt-0 mb-3">{section.title}</h3>
                <div 
                  className={`${section.type === 'code' ? 'bg-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto' : ''}`}
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* FAQ Section */}
      <Card className="p-6">
        <h3 className="mt-0 mb-4">Frequently Asked Questions</h3>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="item-1">
            <AccordionTrigger>How do I interact with the AI mentor?</AccordionTrigger>
            <AccordionContent>
              Click the green chat button in the mentor panel to start a conversation. 
              You can ask questions about the lesson content, request clarifications, or get additional examples.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>Can I practice what I've learned?</AccordionTrigger>
            <AccordionContent>
              Yes! The AI mentor can provide practice exercises and guide you through solutions. 
              Just ask for practice problems related to the current lesson topic.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>What if I don't understand something?</AccordionTrigger>
            <AccordionContent>
              Don't worry! The AI mentor is here to help. Ask for a simpler explanation, 
              request real-world examples, or have the concept explained in a different way.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      {/* Next Steps */}
      <Card className="p-6 bg-gradient-to-br from-green-50 to-transparent border-[#00CE8D] border-l-4">
        <h3 className="mt-0 mb-3">Ready to Practice?</h3>
        <p className="mb-4">
          Now that you've completed this lesson, try these next steps:
        </p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="text-[#00CE8D] flex-shrink-0 mt-1" size={20} />
            <span>Review the key concepts with your AI mentor</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="text-[#00CE8D] flex-shrink-0 mt-1" size={20} />
            <span>Ask for practice exercises to test your understanding</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="text-[#00CE8D] flex-shrink-0 mt-1" size={20} />
            <span>Explore related topics and advanced concepts</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
