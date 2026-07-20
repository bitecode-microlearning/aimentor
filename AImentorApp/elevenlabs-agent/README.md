# BiteCode ElevenLabs agent prompts

This folder separates shared agent behavior from conversation-specific workflow behavior.

- `system-prompt.md`: generic identity, communication, privacy, safety, reliability, and recovery rules. It contains no lesson or relationship workflow.
- `normal-lesson-opening-prompt.md`: the no-greeting lesson transition used only by the direct normal route's `Say: Greetings` node.
- `normal-lesson-prompt.md`: the existing lesson sequence and lesson-specific behavior.
- `course-calibration-prompt.md`: first-course relationship calibration.
- `weekly-checkpoint-prompt.md`: weekly continuity and feedback checkpoint.
- `workflow-routing.md`: ElevenLabs branch conditions, dynamic variables, and post-call setup.

In ElevenLabs, use `system-prompt.md` as the agent-level system prompt. Route by `conversation_type` exactly as documented in `workflow-routing.md`. Only the direct normal route uses `normal-lesson-opening-prompt.md`; Course Coach and Weekly Coach begin their own workflows directly and use their completion Say nodes before merging into `Explain the lesson`.

Apply the required agent-level conversation-flow settings from `workflow-routing.md`, including the 15-second `Take turn after silence` value and the `skip_turn` system tool. Check every workflow node for a shorter turn-timeout override.

Keep the existing agent, tools, signed session flow, and post-call webhook. Relationship branches must not call lesson tools. Unknown or missing conversation types fall back to the normal lesson branch.

## Relationship presentation client tools

Configure these as client tools on the ElevenLabs agent. They render cards in the BiteCode app and do not speak or persist their payloads.

### `showCoachingDiscussion`

- `title`: string, optional
- `points`: array, required, one to six items
  - `topic`: string, required
  - `learnerInput`: string, required; a concise and faithful summary of the learner's own words

This displays the Target-icon goal/checkpoint card with the discussion topics and learner inputs.

### `showCoachingRecap`

- `title`: string, optional; default `What we discussed`
- `points`: array of strings, required; one to three supported takeaways

This displays the final three-point coaching recap. The app rejects both tools during a normal lesson and caps the recap at three items.

Before enabling production relationship flags:

1. Configure all three workflow branches.
2. Add the `relationship_output` post-call data-collection field using schema version `2.0`.
3. Test normal lesson fallback, course calibration, weekly checkpoint continuity, interrupted calls, and webhook retries.
4. Review relationship transcripts against `../../docs/human-ai-relationship-evaluation.md`.
