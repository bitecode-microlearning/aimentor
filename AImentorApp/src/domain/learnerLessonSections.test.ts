import { describe, expect, it } from 'vitest';
import { learnerLessonSections } from './learnerLessonSections';

const internal = {
  contentdescription: 'Explain glob to the learner. Include a CSV in reports/archive.',
  codedescription: 'Generate an offline-safe OneCompiler Python example. Required files: main.py. Reviewed example: pathlib-855-v1.',
  content: 'Internal fallback instructions must not be displayed either.',
};

describe('learner-facing lesson context', () => {
  it.each([853, 854, 855, 856, 857, 858])('provides reviewed learner copy for lesson %s without exposing briefs', lessonid => {
    const sections = learnerLessonSections({ ...internal, courseid: 10, coursename: 'Mastering pathlib', lessonid, lessongoal: 'Build reliable file workflows.' });
    expect(sections.map(s => s.title)).toEqual(['What you’ll learn', 'Key ideas', 'Practice task']);
    const copy = sections.map(s => s.content).join('\n');
    for (const brief of Object.values(internal)) expect(copy).not.toContain(brief);
    expect(copy).not.toMatch(/Reviewed example:|Required files:|Generate an offline-safe/);
    expect(sections[2].content.length).toBeGreaterThan(100);
  });

  it('keeps meaningful safety constraints in the discovery and move tasks', () => {
    const lesson = (lessonid: number) => learnerLessonSections({ courseid: 10, coursename: 'Mastering pathlib', lessonid });
    expect(lesson(855)[1].content).toContain('Exclude directories');
    expect(lesson(855)[1].content).toContain('sorted relative paths');
    expect(lesson(857)[0].content).toContain('not a concurrency guarantee');
    expect(lesson(857)[1].content).toContain('both files retain their distinct original bytes');
  });

  it('does not apply course-specific tasks to a different course', () => {
    const sections = learnerLessonSections({ ...internal, courseid: 11, coursename: 'Another course', lessonid: 855, lessongoal: 'Learn SQL joins.', concepts: '["INNER JOIN","LEFT JOIN"]' });
    expect(sections.map(s => s.content)).toEqual(['Learn SQL joins.', '- INNER JOIN\n- LEFT JOIN']);
  });

  it('never uses internal briefs as an empty-state fallback', () => {
    expect(learnerLessonSections(internal)).toEqual([{ title: 'Your lesson', content: 'Start the mentor session to explore this topic and work through a practice task.', type: 'text' }]);
  });
});
