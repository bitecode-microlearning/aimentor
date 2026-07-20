export const CONVERSATION_TYPES = Object.freeze({
  COURSE_CALIBRATION: "COURSE_CALIBRATION",
  WEEKLY_CHECKPOINT: "WEEKLY_CHECKPOINT",
  NORMAL_LESSON: "NORMAL_LESSON",
});

const DEFINITIONS = Object.freeze({
  COURSE_CALIBRATION: { priority: 100, duration: "5-8 minutes", requiredContext: ["profile", "goals", "preferences"], completionStrategy: "relationship-v2" },
  WEEKLY_CHECKPOINT: { priority: 80, duration: "2-5 minutes", requiredContext: ["recentMemory", "progress", "blockers"], completionStrategy: "relationship-v2" },
  NORMAL_LESSON: { priority: 0, duration: "lesson-defined", requiredContext: ["lesson", "learningHistory"], completionStrategy: "lesson-v1" },
});

export function relationshipConfig(env, userTimezone) {
  const enabled = flag(env.RELATIONSHIP_LAYER_ENABLED, false);
  return {
    enabled,
    calibrationEnabled: enabled && flag(env.RELATIONSHIP_CALIBRATION_ENABLED, false),
    checkpointEnabled: enabled && flag(env.RELATIONSHIP_WEEKLY_CHECKPOINT_ENABLED, false),
    promptVersion: bounded(env.RELATIONSHIP_PROMPT_VERSION || "relationship-v1", 64),
    timezone: validTimezone(userTimezone) || validTimezone(env.RELATIONSHIP_TIMEZONE) || "Europe/Budapest",
    maxAttempts: integer(env.RELATIONSHIP_MAX_ATTEMPTS, 3, 1, 10),
    resumeHours: integer(env.RELATIONSHIP_RESUME_HOURS, 24, 1, 168),
    checkpointDuration: bounded(env.RELATIONSHIP_CHECKPOINT_DURATION || "2-5 minutes", 40),
  };
}

export function conversationDefinition(type, config) {
  const definition = DEFINITIONS[type] || DEFINITIONS.NORMAL_LESSON;
  return {
    conversationType: type in DEFINITIONS ? type : CONVERSATION_TYPES.NORMAL_LESSON,
    ...definition,
    duration: type === CONVERSATION_TYPES.WEEKLY_CHECKPOINT ? config.checkpointDuration : definition.duration,
    promptVersion: type === CONVERSATION_TYPES.NORMAL_LESSON ? "lesson-v1" : config.promptVersion,
    sequence: "Acknowledge -> Explore -> Reflect or summarize -> Guide -> Reinforce progress",
  };
}

export function isoWeekKey(now, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const weekday = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((local - yearStart) / 86400000) + 1) / 7);
  return `${local.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function resolveConversationType(state, config, now = new Date()) {
  if (!config.enabled) return { type: CONVERSATION_TYPES.NORMAL_LESSON, periodKey: null, reason: "feature_disabled" };
  const periodKey = isoWeekKey(now, config.timezone);
  if (config.calibrationEnabled && !state.calibrationCompleted) {
    if (isResumable(state.activeCalibrationStartedAt, config, now)) {
      return { type: CONVERSATION_TYPES.COURSE_CALIBRATION, periodKey: null, reason: "calibration_retry" };
    }
    if (canAttempt(state.calibrationAttempts, state.activeCalibrationStartedAt, config, now)) {
      return { type: CONVERSATION_TYPES.COURSE_CALIBRATION, periodKey: null, reason: "calibration_incomplete" };
    }
  }
  if (config.checkpointEnabled && state.completedCheckpointPeriod !== periodKey) {
    if (isResumable(state.activeCheckpointStartedAt, config, now)) {
      return { type: CONVERSATION_TYPES.WEEKLY_CHECKPOINT, periodKey, reason: "checkpoint_retry" };
    }
    if (canAttempt(state.checkpointAttempts, state.activeCheckpointStartedAt, config, now)) {
      return { type: CONVERSATION_TYPES.WEEKLY_CHECKPOINT, periodKey, reason: "checkpoint_due" };
    }
  }
  return { type: CONVERSATION_TYPES.NORMAL_LESSON, periodKey: null, reason: "relationship_not_due" };
}

export async function loadRelationshipRoutingState(db, subscriptionId, periodKey) {
  const row = await db.prepare(
    `SELECT
       MAX(CASE WHEN conversation_type = 'COURSE_CALIBRATION' AND status = 'completed' THEN 1 ELSE 0 END) AS calibration_completed,
       SUM(CASE WHEN conversation_type = 'COURSE_CALIBRATION' THEN 1 ELSE 0 END) AS calibration_attempts,
       MAX(CASE WHEN conversation_type = 'COURSE_CALIBRATION' AND status IN ('created','active') THEN created_at END) AS active_calibration_started_at,
       COALESCE(
         (SELECT lastfeedbackperiodkey FROM subscriptions WHERE id = ?1),
         MAX(CASE WHEN conversation_type = 'WEEKLY_CHECKPOINT' AND status = 'completed' THEN period_key END)
       ) AS completed_checkpoint_period,
       (SELECT lastfeedbacksession FROM subscriptions WHERE id = ?1) AS last_feedback_session,
       SUM(CASE WHEN conversation_type = 'WEEKLY_CHECKPOINT' AND period_key = ?2 THEN 1 ELSE 0 END) AS checkpoint_attempts,
       MAX(CASE WHEN conversation_type = 'WEEKLY_CHECKPOINT' AND period_key = ?2 AND status IN ('created','active') THEN created_at END) AS active_checkpoint_started_at
     FROM mentor_sessions WHERE subscription_id = ?1`
  ).bind(subscriptionId, periodKey).first();
  return {
    calibrationCompleted: Number(row?.calibration_completed) === 1,
    calibrationAttempts: Number(row?.calibration_attempts) || 0,
    activeCalibrationStartedAt: row?.active_calibration_started_at || null,
    completedCheckpointPeriod: row?.completed_checkpoint_period || null,
    lastFeedbackSession: row?.last_feedback_session || null,
    checkpointAttempts: Number(row?.checkpoint_attempts) || 0,
    activeCheckpointStartedAt: row?.active_checkpoint_started_at || null,
  };
}

export async function assembleRelationshipContext(db, userId, subscriptionId) {
  const [profile, memory, previousCheckpoint] = await Promise.all([
    db.prepare(
      `SELECT target_type, field_name, value_json, confidence, updated_at
       FROM relationship_profile_values
       WHERE user_id = ?1 AND (target_type = 'USER' OR subscription_id = ?2)
       ORDER BY CASE target_type WHEN 'SUBSCRIPTION' THEN 0 ELSE 1 END, updated_at DESC LIMIT 20`
    ).bind(userId, subscriptionId).all(),
    db.prepare(
      `SELECT memory_type, scope, summary, importance, created_at
       FROM relationship_memory
       WHERE user_id = ?1 AND resolved_at IS NULL AND (scope = 'USER' OR subscription_id = ?2)
       ORDER BY CASE memory_type WHEN 'CURRENT_BLOCKER' THEN 0 WHEN 'ACTIVE_GOAL' THEN 1 WHEN 'MOTIVATION_SIGNAL' THEN 2 WHEN 'SUCCESS' THEN 3 ELSE 4 END,
                importance DESC, created_at DESC LIMIT 12`
    ).bind(userId, subscriptionId).all(),
    db.prepare(
      `SELECT rcs.period_key, rcs.summary, rcs.changes_since_previous_json, rcs.successes_json,
              rcs.challenges_json, rcs.agreed_adjustments_json, rcs.validation_topics_json, rcs.created_at,
              (SELECT json_group_array(json_object('field',h.field_name,'value',json(h.applied_value_json)))
                 FROM relationship_profile_update_history h
                WHERE h.conversation_id=rcs.conversation_id AND h.decision='APPLIED') AS applied_updates_json
       FROM relationship_checkpoint_summaries rcs
       WHERE rcs.user_id=?1 AND rcs.subscription_id=?2
       ORDER BY rcs.created_at DESC LIMIT 1`
    ).bind(userId, subscriptionId).first(),
  ]);
  return JSON.stringify({
    profile: profile.results.map((item) => ({ scope: item.target_type, field: item.field_name, value: safeJson(item.value_json), confidence: item.confidence })),
    memory: memory.results.map((item) => ({ type: item.memory_type, scope: item.scope, summary: bounded(item.summary, 500), importance: item.importance })),
    previousCheckpoint: previousCheckpoint ? {
      periodKey: previousCheckpoint.period_key,
      summary: bounded(previousCheckpoint.summary, 1200),
      learnerReportedChanges: safeJson(previousCheckpoint.changes_since_previous_json) || [],
      successes: safeJson(previousCheckpoint.successes_json) || [],
      challenges: safeJson(previousCheckpoint.challenges_json) || [],
      agreedAdjustments: safeJson(previousCheckpoint.agreed_adjustments_json) || [],
      validateThisTime: safeJson(previousCheckpoint.validation_topics_json) || [],
      systemAppliedUpdates: safeJson(previousCheckpoint.applied_updates_json) || [],
      completedAt: previousCheckpoint.created_at,
    } : null,
  }).slice(0, 12000);
}

function canAttempt(attempts, activeStartedAt, config, now) {
  if (attempts >= config.maxAttempts) return false;
  if (!activeStartedAt) return true;
  const age = now.getTime() - Date.parse(activeStartedAt);
  return !Number.isFinite(age) || age >= config.resumeHours * 3600000;
}

function isResumable(activeStartedAt, config, now) {
  if (!activeStartedAt) return false;
  const age = now.getTime() - Date.parse(activeStartedAt);
  return Number.isFinite(age) && age >= 0 && age < config.resumeHours * 3600000;
}

function flag(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim().toLowerCase() === "true";
}

function integer(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function bounded(value, max) { return String(value || "").trim().slice(0, max); }
function safeJson(value) { try { return JSON.parse(value); } catch { return null; } }
function validTimezone(value) {
  const candidate = bounded(value, 80);
  if (!candidate) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: candidate }).format(new Date(0));
    return candidate;
  } catch {
    return null;
  }
}
