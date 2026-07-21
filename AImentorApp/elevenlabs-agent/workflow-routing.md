# ElevenLabs workflow routing

Use one existing ElevenLabs agent and the existing post-call webhook.

At conversation start, route on the dynamic variable `conversation_type`:

| Condition | First workflow node | Following Say node | Shared destination |
| --- | --- | --- | --- |
| `NORMAL_LESSON` or missing/unknown | `Say: Greetings`, using `normal-lesson-opening-prompt.md` | None | `Explain the lesson`, using `normal-lesson-prompt.md` |
| `COURSE_CALIBRATION` | `Course Coach`, using `course-calibration-prompt.md` | `Say: move to the actual lesson` | `Explain the lesson`, using `normal-lesson-prompt.md` |
| `WEEKLY_CHECKPOINT` | `Weekly Coach`, using `weekly-checkpoint-prompt.md` | `Say: Thank you for the feedback` | `Explain the lesson`, using `normal-lesson-prompt.md` |

The missing/unknown fallback must remain the normal lesson branch for backwards compatibility.

After the third knowledge-check answer feedback, every `Explain the lesson` path must transition to `Close the lesson`, using `normal-lesson-closing-prompt.md`. Remove every direct route from `Explain the lesson` to `End`. Only `Close the lesson` may transition successfully to `End`, after donation, spoken farewell, summary, and evaluation have all completed.

```text
NORMAL_LESSON / relationship lesson continuation
  -> Explain the lesson
  -> Close the lesson
  -> End
```

Each relationship branch must complete its coaching phase, run its own completion Say node, and then join the shared `Explain the lesson` node. Only the direct normal route runs `Say: Greetings`. The shared lesson prompt must never generate another greeting or opening.

The ElevenLabs platform First Message is the only actual greeting in the session. Despite its dashboard label, `Say: Greetings` must be a no-greeting lesson transition: it mentions the course and lesson but must not say `Hi`, `Hello`, `Welcome`, or reintroduce Ana.

## Required conversation-flow settings

Configure these settings at agent level and ensure no workflow node overrides them with a shorter value:

- `Take turn after silence`: `15` seconds (`conversation_config.turn.turn_timeout = 15`). This must match BiteCode's initial learner-response watchdog; a shorter provider timeout can create an empty agent turn and repeat a pending question.
- `Turn eagerness`: `Patient`, because learners need time to formulate technical answers.
- Add the ElevenLabs `skip_turn` system tool. Prompts use it when a turn begins without learner text while a question is pending.
- Keep interruptions enabled for natural learner interjections.

Configure a post-call data-collection field named `relationship_output` for relationship conversations. Its JSON follows `../../docs/relationship-webhook-v2.example.json` with:

- `schemaVersion: "2.0"`;
- the routed `conversationType`;
- the external conversation ID;
- `promptVersion`;
- supported profile updates, summaries, memory, and feedback.

Normal lesson post-call processing remains unchanged. Do not create a second webhook.

## Required dynamic variables

Shared:

- `conversation_type`
- `debug_mode` (`true` enables the app's private live diagnostic panel; it must not affect branch routing or spoken output)
- `mentor_session_id`
- `userfirstname`
- `knowledgelevel`
- `knowledgedomain`
- `userpreferences`
- `speakingspeed`
- `userlearninggoal`
- `coursename`
- `lessonname`
- `coursegoal`
- `courseprogress`
- `content`
- `learningmemory`
- `knowledgestrengths`
- `knowledgegaps`
- `practicerecommendations`
- `previous_lesson_evaluation`
- `user_id`
- `subscription_id`
- `course_id`
- `lesson_id`

Relationship:

- `relationship_period_key`
- `relationship_prompt_version`
- `relationship_definition`
- `relationship_context`
- `active_workflow_instruction`

Lesson variables used by the current normal lesson workflow remain unchanged.
