import test from "node:test";
import assert from "node:assert/strict";
import { assembleRelationshipContext, isoWeekKey, relationshipConfig, resolveConversationType } from "./relationshipLayer.js";

const enabled = relationshipConfig({
  RELATIONSHIP_LAYER_ENABLED: "true",
  RELATIONSHIP_CALIBRATION_ENABLED: "true",
  RELATIONSHIP_WEEKLY_CHECKPOINT_ENABLED: "true",
  RELATIONSHIP_TIMEZONE: "Europe/Budapest",
});

test("disabled relationship layer preserves normal lesson routing", () => {
  assert.equal(resolveConversationType({}, relationshipConfig({})).type, "NORMAL_LESSON");
});

test("a valid user override forces any supported conversation type", () => {
  assert.deepEqual(
    resolveConversationType({ forceOverride: "WEEKLY_CHECKPOINT" }, enabled, new Date("2026-07-20T12:00:00Z")),
    { type: "WEEKLY_CHECKPOINT", periodKey: "2026-W30", reason: "user_force_override" },
  );
  assert.equal(resolveConversationType({ forceOverride: "NORMAL_LESSON" }, enabled).type, "NORMAL_LESSON");
  assert.equal(resolveConversationType({ forceOverride: "COURSE_CALIBRATION" }, enabled).type, "COURSE_CALIBRATION");
});

test("the global rollback flag takes precedence over a force override", () => {
  assert.equal(
    resolveConversationType({ forceOverride: "WEEKLY_CHECKPOINT" }, relationshipConfig({})).type,
    "NORMAL_LESSON",
  );
});

test("incomplete calibration has priority", () => {
  const result = resolveConversationType({ calibrationCompleted: false, calibrationAttempts: 0 }, enabled, new Date("2026-07-20T08:00:00Z"));
  assert.equal(result.type, "COURSE_CALIBRATION");
});

test("checkpoint occurs once per ISO week after calibration", () => {
  const due = resolveConversationType({ calibrationCompleted: true, checkpointAttempts: 0 }, enabled, new Date("2026-07-20T08:00:00Z"));
  assert.deepEqual({ type: due.type, periodKey: due.periodKey }, { type: "WEEKLY_CHECKPOINT", periodKey: "2026-W30" });
  const complete = resolveConversationType({ calibrationCompleted: true, completedCheckpointPeriod: "2026-W30" }, enabled, new Date("2026-07-20T08:00:00Z"));
  assert.equal(complete.type, "NORMAL_LESSON");
});

test("retry limit falls through instead of blocking lessons", () => {
  const result = resolveConversationType({ calibrationCompleted: false, calibrationAttempts: 3, checkpointAttempts: 3 }, enabled);
  assert.equal(result.type, "NORMAL_LESSON");
});

test("an active calibration retries instead of routing to a checkpoint", () => {
  const result = resolveConversationType({
    calibrationCompleted: false,
    calibrationAttempts: 1,
    activeCalibrationStartedAt: "2026-07-20T07:00:00.000Z",
    checkpointAttempts: 0,
  }, enabled, new Date("2026-07-20T08:00:00.000Z"));
  assert.equal(result.type, "COURSE_CALIBRATION");
});

test("timezone is explicit at an ISO week boundary", () => {
  assert.equal(isoWeekKey(new Date("2027-01-03T23:30:00Z"), "Europe/Budapest"), "2027-W01");
  assert.equal(isoWeekKey(new Date("2027-01-03T22:30:00Z"), "UTC"), "2026-W53");
});

test("profile timezone overrides the application fallback and invalid values are ignored", () => {
  assert.equal(relationshipConfig({ RELATIONSHIP_TIMEZONE: "Europe/Budapest" }, "America/Los_Angeles").timezone, "America/Los_Angeles");
  assert.equal(relationshipConfig({ RELATIONSHIP_TIMEZONE: "Europe/Budapest" }, "Not/A_Timezone").timezone, "Europe/Budapest");
});

test("context assembly passes the previous checkpoint and confirmed applied changes", async () => {
  const db = {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() { return { results: [] }; },
            async first() {
              if (!sql.includes("relationship_checkpoint_summaries")) return null;
              return {
                period_key: "2026-W29",
                summary: "Independent practice was the main blocker.",
                changes_since_previous_json: '["A guided example helped."]',
                successes_json: '["Finished one exercise."]',
                challenges_json: '["Starting alone remains difficult."]',
                agreed_adjustments_json: '["Keep one guided example."]',
                validation_topics_json: '["Check whether less prompting is needed."]',
                applied_updates_json: '[{"field":"currentConfidence","value":0.6}]',
                created_at: "2026-07-19T10:00:00Z",
              };
            },
          };
        },
      };
    },
  };
  const context = JSON.parse(await assembleRelationshipContext(db, 1, 2));
  assert.equal(context.previousCheckpoint.periodKey, "2026-W29");
  assert.deepEqual(context.previousCheckpoint.systemAppliedUpdates, [{ field: "currentConfidence", value: 0.6 }]);
  assert.deepEqual(context.previousCheckpoint.validateThisTime, ["Check whether less prompting is needed."]);
});
