# Human-AI Relationship Layer implementation plan

## Current architecture

The AI Mentor React application loads a signed lesson payload through `aimentor/worker/worker.js`. The Worker resolves trusted learner, subscription, course, lesson, recent learning-history, suggestion, and previous-evaluation context from the product D1 database. `/agent` creates a `mentor_sessions` correlation record, requests an ElevenLabs signed URL, and the React client starts the conversation with dynamic variables. The central system prompt and workflow prompt are versioned in `AImentorApp/elevenlabs-agent`.

ElevenLabs sends its existing signed post-call transcription webhook to `cloudflare-backend`. That service verifies the HMAC and provider allowlists, persists a replay-safe backend-ops receipt, resolves the opaque mentor-session correlation, stores a temporary bounded transcript and sanitized audit record, persists normalized learning history, and schedules analysis. Existing lesson completion must remain unchanged.

The product schema already has `users`, `profiles`, `subscriptions`, `mentor_sessions`, `learning_history`, and learning-analysis/suggestion projections. It has no durable calibration/checkpoint status, relationship profile values, relationship memory, structured feedback, or AI profile-update history. User timezone is stored in `profiles.timezone`; relationship routing validates and uses that IANA timezone. The private Worker setting `RELATIONSHIP_TIMEZONE` (default `Europe/Budapest`) remains the deterministic fallback when the profile is empty or invalid.

The additive subscription fields `lastfeedbacksession` and `lastfeedbackperiodkey` are maintained as a fast scheduling projection after a checkpoint is successfully completed. `mentor_sessions` remains the authoritative attempt and idempotency history; the subscription marker is never written when a call merely starts or fails.

## Proposed architecture

The Mentor Worker adds a centralized relationship conversation registry and resolver with three definitions: `COURSE_CALIBRATION`, `WEEKLY_CHECKPOINT`, and `NORMAL_LESSON`. The resolver runs before lesson startup. It chooses incomplete calibration first, then the current period's checkpoint, then the existing lesson. Eligibility is derived from persisted `mentor_sessions` state rather than `subscription.isNew`. Failed/abandoned attempts never permanently block lessons: only active attempts within a bounded retry window are resumed, and retry count is capped by configuration.

The context assembler selects compact profile values and unresolved/high-importance relationship memories, with subscription-scoped items ahead of user-scoped history. The prompt composer passes normalized JSON and a versioned conversation definition to the existing ElevenLabs agent. The central agent prompt contains the tactical-empathy behavior and mode-specific closing rules; route handlers do not contain learner-facing prompt prose.

For weekly checkpoints the assembler also selects the immediately previous checkpoint as a dedicated continuity anchor. It includes what the learner reported, agreed adjustments, what should be validated now, and only profile changes whose audit decision is `APPLIED`. This lets the mentor say “last time you said…” and check whether an adjustment helped without fabricating that the system applied or validated it.

The existing post-call webhook branches after authentication/correlation. `NORMAL_LESSON` keeps the current pipeline. Relationship conversations use a versioned structured output parsed from ElevenLabs data-collection results, validate all fields and enums, persist completion, feedback, memory, and profile-update decisions idempotently, and do not enqueue lesson analysis. Unknown fields are rejected into audit history rather than written to a profile.

## Database changes

Migration `0014_create_relationship_layer.sql` extends `mentor_sessions` with conversation type, weekly period, prompt/schema versions, attempt and failure metadata. It creates:

- `relationship_profile_values`: allowlisted user/subscription profile projections with source timestamps for stale-update protection.
- `relationship_profile_update_history`: applied, rejected, ignored, no-change, and review decisions.
- `relationship_memory`: compact scoped notes with importance and resolution state.
- `relationship_checkpoint_summaries`: one durable continuity snapshot per weekly checkpoint, linked to the previous checkpoint and its backend-confirmed applied profile changes.
- `user_feedback`: normalized operational feedback with a source-item dedupe key.

Indexes support resolver, context, admin follow-up, and deletion/anonymization queries. No destructive schema changes are made. Existing account deletion already changes user status before asynchronous cleanup; new data is keyed by `user_id` and documented for inclusion in the deletion job when that job is expanded.

## Idempotency, conflicts, and retry behavior

The webhook receipt remains the first replay boundary. Relationship persistence adds unique keys for provider conversation completion, profile field/source conversation, feedback source item, and memory source item. Updates below the configured confidence threshold are recorded but not applied. An event older than the stored field source timestamp cannot overwrite it. A no-change proposal is audited without a write. Because the current profile UI writes the canonical `profiles`/`subscriptions` tables and relationship values are a separate projection, delayed AI output cannot overwrite a newer user-authored canonical value.

Started calibration/checkpoint attempts are reusable for a configured number of hours. Once stale or failed they are superseded by a new attempt, up to the configured retry count. After the limit, routing falls through to the normal lesson, preventing permanent blockage. Only a completed calibration or completed `(subscription, period)` checkpoint suppresses future routing.

## Feature flags and rollout

Private Worker variables control: relationship layer, calibration, weekly checkpoint, profile updates, feedback persistence, confidence threshold, prompt version, timezone, retry count, resume window, and checkpoint duration. Defaults disable all routing changes. Rollout order is migration, backend webhook, ElevenLabs prompt/data-collection schema, Mentor Worker/app, then cohort enablement.

Rollback is configuration-first: disable `RELATIONSHIP_LAYER_ENABLED`. Existing records remain inert and normal lesson routing resumes. Code rollback is safe because schema changes are additive and the existing lesson webhook remains compatible.

## Test strategy

Pure resolver tests cover calibration, checkpoint, normal lesson, flags, retries, and timezone/ISO-week boundaries. Backend tests cover schema validation, allowlists, confidence and stale-update policy, feedback dedupe, and legacy webhook behavior. The React build/typecheck verifies dynamic-variable propagation. Manual transcript review uses `human-ai-relationship-evaluation.md`.

## Expected files

- `aimentor/worker/relationshipLayer.js`, `aimentor/worker/worker.js`
- `aimentor/AImentorApp/src/App.tsx`, `aimentor/AImentorApp/src/components/MentorPanel.tsx`
- `aimentor/AImentorApp/elevenlabs-agent/system-prompt.md`
- `cloudflare-backend/src/db/migrations/0014_create_relationship_layer.sql`
- `cloudflare-backend/src/domain/relationship/*`, repositories, webhook integration, and tests
- relationship evaluation, payload, deployment, and rollback documentation

## Risks and assumptions

- ElevenLabs must be configured to return `relationship_output` in post-call data collection; malformed or absent output completes the conversation with summary-only memory and never corrupts profiles.
- The checked product schema has no per-user timezone. The initial explicit application timezone is deterministic but not personalized.
- D1 does not provide a multi-database transaction. Product relationship writes use idempotent constraints and a single product-DB batch; the existing backend-ops receipt remains retryable.
- Automated tests can validate behavior and safety rules, not whether a learner subjectively feels understood. Manual review remains required before cohort rollout.
