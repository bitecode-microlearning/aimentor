type Section = { title: string; content: string; type: 'text' | 'tip' };

// Learner-facing copy is intentionally separate from the generation briefs.
const pathlibLessons: Record<string, { ideas: string; task: string }> = {
  '853': {
    ideas: 'Path objects let you join folder and file names without manually choosing path separators. Constructing a Path does not create a file; exists() only checks the filesystem. Validate caller-supplied path components before using them.',
    task: 'Build a path to exports/daily.txt from separate components. Create its parent folder and write a short UTF-8 report. Assert the expected path components and read the text back. Use a temporary working folder so the exercise can be repeated safely.',
  },
  '854': {
    ideas: 'Use an explicit UTF-8 encoding for text files. Exclusive creation with open("x") refuses an existing destination. An exists() check followed by a normal write has a race window. Compare bytes when exact preservation matters.',
    task: 'Create two different report files in a temporary folder using exclusive creation. Attempt to replace the first file, handle FileExistsError, and assert that both original byte sequences remain unchanged. Handle reading a missing file separately.',
  },
  '855': {
    ideas: 'glob("*.csv") searches direct children; rglob("*.csv") also searches nested folders. Filter with is_file() and sort results for predictable output. A helper should use its folder parameter rather than a variable local to another function.',
    task: 'Find CSV files inside a reports folder, then include files in nested folders. Exclude directories even when their names end in .csv, and assert sorted relative paths. Handle a missing input folder. Extend the same helper to find nested JSON files.',
  },
  '856': {
    ideas: 'name, stem and suffix describe path spelling. with_suffix() returns a new Path without renaming a file. stat() reads filesystem metadata and requires an existing target. For archive.tar.gz, the stem is archive.tar and the final suffix is .gz.',
    task: 'Inspect the supplied data.csv and compare stat().st_size with the length of read_bytes(). Derive data.json without changing the original file. For archive.tar.gz, assert the stem, suffixes and new archive.tar.zip spelling. Handle a missing metadata target.',
  },
  '857': {
    ideas: 'Define what happens when a move destination already exists. Checking exists() before moving is a simple single-process policy, not a concurrency guarantee. A cross-filesystem shutil.move may copy then delete, so do not assume every move is atomic.',
    task: 'In a temporary folder, implement a move that rejects an existing destination. Test success, destination conflict and missing source. On success, assert the source is gone and destination bytes match. On conflict, assert both files retain their distinct original bytes.',
  },
  '858': {
    ideas: 'Separate reusable discovery from the entrypoint that writes results. Importing a helper should not trigger a workflow. Return sorted relative file paths, distinguish empty input from missing input, and create the manifest exclusively.',
    task: 'Use main.py and pathlib_tools.py to inventory nested JSON files. Exclude a directory named fake.json, assert the sorted relative paths, and write one path per line to a UTF-8 manifest. Reject a second write and verify the original manifest bytes are unchanged. Test empty and missing input folders.',
  },
};

function conceptsText(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => `- ${String(item)}`).join('\n');
  const text = typeof value === 'string' ? value.trim() : '';
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return conceptsText(parsed);
  } catch { /* Ordinary prose is also supported. */ }
  return text;
}

export function learnerLessonSections(lesson: Record<string, unknown>): Section[] {
  const sections: Section[] = [];
  const goal = typeof lesson.lessongoal === 'string' ? lesson.lessongoal.trim() : '';
  if (goal) sections.push({ title: 'What you’ll learn', content: goal, type: 'tip' });
  const courseId = String(lesson.courseid ?? lesson.course_id ?? lesson.courseId ?? '');
  const lessonId = String(lesson.lessonid ?? lesson.lesson_id ?? lesson.lessonId ?? '');
  const reviewed = courseId === '10' && lesson.coursename === 'Mastering pathlib' ? pathlibLessons[lessonId] : undefined;
  const concepts = conceptsText(lesson.concepts);
  if (reviewed || concepts) sections.push({ title: 'Key ideas', content: reviewed?.ideas || concepts, type: 'text' });
  if (reviewed) sections.push({ title: 'Practice task', content: reviewed.task, type: 'text' });
  // Never fall back to content/contentdescription/codedescription: those fields
  // may contain authoring guidance rather than copy intended for the learner.
  if (!sections.length) sections.push({ title: 'Your lesson', content: 'Start the mentor session to explore this topic and work through a practice task.', type: 'text' });
  return sections;
}
