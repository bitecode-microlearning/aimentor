# BiteCode ElevenLabs AI Mentor agent

This folder contains the complete version-controlled system prompt used by the BiteCode ElevenLabs AI Mentor agent.

- `system-prompt.md` is the complete prompt to paste into the ElevenLabs agent.
- Import-ready client tool definitions are stored in `../elevenlabs-tools/`.

When updating the dashboard configuration:

1. Import or update all client tools from `../elevenlabs-tools/`, including `showAnswerFeedback`.
2. Replace the agent system prompt with the complete contents of `system-prompt.md`.
3. Confirm that tool and parameter names retain their exact case.
4. Publish the agent and run a signed DEV mentor session.

The repository copy is the source of truth. Dashboard-only prompt changes should be copied back into this file.
