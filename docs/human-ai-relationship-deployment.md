# Relationship Layer deployment and rollback

1. Apply product D1 migration `0014_create_relationship_layer.sql` in development.
2. Deploy `cloudflare-backend` with relationship profile and feedback flags still `false`.
3. Configure the existing ElevenLabs agent with the updated system prompt and a `relationship_output` post-call data-collection field containing JSON matching `relationship-webhook-v2.example.json`.
4. Deploy the AI Mentor Worker and Pages app with all relationship routing flags `false`.
5. Enable `RELATIONSHIP_LAYER_ENABLED` plus calibration for a development test subscription. Complete, interrupt, retry, and replay the webhook. Then enable checkpoint routing and test a timezone/week boundary.
6. Review transcripts with `human-ai-relationship-evaluation.md`. Enable feedback persistence, then profile updates, only after validation. Production cohort rollout follows the same order.

Required private configuration is documented in `worker/wrangler.toml` and `cloudflare-backend/wrangler.jsonc`. Secrets remain the existing ElevenLabs API/webhook secrets and must be set through Cloudflare, never committed.

Rollback: set `RELATIONSHIP_LAYER_ENABLED=false` on the AI Mentor Worker. Normal lessons resume immediately. If extraction persistence must also stop, set `RELATIONSHIP_PROFILE_UPDATES_ENABLED=false` and `RELATIONSHIP_FEEDBACK_ENABLED=false`. The additive tables and columns may remain; do not run a destructive down migration during incident rollback.

Account deletion/anonymization: the website deletion-request batch deletes rows in `relationship_profile_values`, `relationship_profile_update_history`, `relationship_memory`, `relationship_checkpoint_summaries`, and `user_feedback` by `user_id`. Relationship routing also becomes ineligible as soon as the user becomes non-active, matching the existing webhook guard.
