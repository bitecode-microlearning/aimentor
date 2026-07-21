import {
  assembleRelationshipContext,
  conversationDefinition,
  isoWeekKey,
  loadRelationshipRoutingState,
  relationshipConfig,
  resolveConversationType,
} from "./relationshipLayer.js";

const DEFAULT_MIN_AVAILABLE_TOKENS = 2000;
const TOKEN_UNAVAILABLE_ERROR =
  "We have run out of available tokens, so this service is currently unavailable. If you would like to use it and have the capacity to help, please support the system on Buy Me a Coffee: https://buymeacoffee.com/bitecode. Your support helps keep the system ad-free and free to use, and gives the community more available tokens.";

const ALLOWED_ORIGINS = [
  "https://aimentor.pages.dev",
  "https://aimentor-app.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

const AI_MENTOR_USAGE_LIMIT_MESSAGE =
  "You have already used your AI Mentor session today. Please come back tomorrow for your next session.";

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function getMinimumAvailableTokens(env) {
  const configuredLimit = Number(env.MIN_AVAILABLE_TOKENS ?? env.TOKEN_LIMIT);

  if (!Number.isFinite(configuredLimit) || configuredLimit < 0) {
    return DEFAULT_MIN_AVAILABLE_TOKENS;
  }

  return configuredLimit;
}

function isDebugMode(value) {
  return value === true || value === 1 || String(value ?? "").trim() === "1";
}

async function fetchElevenLabsJson(apiUrl, env) {
  const res = await fetch(apiUrl, {
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
  });

  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    throw new Error(`Unable to parse subscription response: ${err.message}`);
  }

  if (!res.ok) {
    throw new Error(getElevenLabsErrorMessage(data, res.status));
  }

  return data;
}

async function getElevenLabsSubscription(env) {
  const subscription = await fetchElevenLabsJson("https://api.elevenlabs.io/v1/user/subscription", env);

  if (subscription?.character_limit !== undefined && subscription?.character_count !== undefined) {
    return subscription;
  }

  const user = await fetchElevenLabsJson("https://api.elevenlabs.io/v1/user", env);

  if (user?.subscription) {
    return user.subscription;
  }

  throw new Error("Subscription response is missing subscription details");
}

function getElevenLabsErrorMessage(data, status) {
  const detail = data?.detail;

  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof data?.error === "string") return data.error;

  return `ElevenLabs API returned HTTP ${status}`;
}

async function getTokenAvailability(env) {
  const subscription = await getElevenLabsSubscription(env);
  const characterLimit = Number(subscription?.character_limit);
  const characterCount = Number(subscription?.character_count);
  const minimumAvailableTokens = getMinimumAvailableTokens(env);

  if (!Number.isFinite(characterLimit) || !Number.isFinite(characterCount)) {
    throw new Error("Subscription response is missing character_count or character_limit");
  }

  return {
    availableTokens: characterLimit - characterCount,
    characterCount,
    characterLimit,
    minimumAvailableTokens,
    configuredMinimumAvailableTokens: env.MIN_AVAILABLE_TOKENS ?? env.TOKEN_LIMIT ?? null,
  };
}

function buildDebugPayload(debugMode, tokenAvailability) {
  if (!isDebugMode(debugMode)) return undefined;

  return {
    debugMode: true,
    tokenAvailability,
  };
}

function withDebugPayload(body, debugMode, tokenAvailability) {
  const debug = buildDebugPayload(debugMode, tokenAvailability);

  if (!debug) return body;

  return {
    ...body,
    debug,
  };
}

async function ensureEnoughAvailableTokens(env, corsHeaders, debugMode = false) {
  const tokenAvailability = await getTokenAvailability(env);

  if (tokenAvailability.availableTokens < tokenAvailability.minimumAvailableTokens) {
    return jsonResponse(
      withDebugPayload(
        {
          error: TOKEN_UNAVAILABLE_ERROR,
          code: "TOKEN_LIMIT_EXCEEDED",
          availableTokens: tokenAvailability.availableTokens,
          minimumAvailableTokens: tokenAvailability.minimumAvailableTokens,
        },
        debugMode,
        tokenAvailability
      ),
      503,
      corsHeaders
    );
  }

  return { tokenAvailability };
}

async function getRequestPayload(request, searchParams) {
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return {
      encoded: body.data,
      signature: body.sig,
      body,
    };
  }

  return {
    encoded: searchParams.get("data"),
    signature: searchParams.get("sig"),
  };
}

function createHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signEncodedPayload(encoded, secret) {
  const key = await createHmacKey(secret);
  const expectedSigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded)
  );

  return Array.from(new Uint8Array(expectedSigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifySignature(encoded, signature, secret) {
  const expectedSig = await signEncodedPayload(encoded, secret);
  return expectedSig === signature;
}

async function decodeLessonPayload(encoded) {
  const binaryString = atob(encoded);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ds = new DecompressionStream("gzip");
  const gzipStream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  const decompressedText = await gzipStream.text();

  return JSON.parse(decompressedText);
}

async function validateSignedLessonPayload(encoded, signature, env) {
  if (!encoded || !signature) {
    return { error: "Missing data or signature", status: 400 };
  }

  const isValidSignature = env.HMAC_SECRET
    ? await verifySignature(encoded, signature, env.HMAC_SECRET)
    : false;
  if (!isValidSignature && env.DEMO_ADMIN) {
    const demoResponse = await env.DEMO_ADMIN.fetch("https://demo-admin.internal/internal/verify-launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: encoded, sig: signature }),
    });
    if (demoResponse.ok) {
      const demoResult = await demoResponse.json();
      return { lessonData: demoResult.lessonData };
    }
  }
  if (!isValidSignature) return { error: "Invalid signature", status: 403 };

  const lessonData = await decodeLessonPayload(encoded);
  const now = Date.now() / 1000;
  const maxAge = 60 * 60 * 24 * 30;
  const ts = lessonData.timestamp;

  if (!ts || now - ts > maxAge) {
    return { error: "Link expired", status: 410 };
  }

  return { lessonData };
}

function getUsageExpiresAt(lessonData) {
  if (lessonData.expiresat) return lessonData.expiresat;
  if (lessonData.expiresAt) return lessonData.expiresAt;

  const timestampMs = Number(lessonData.timestamp) * 1000;
  if (Number.isFinite(timestampMs)) {
    return new Date(timestampMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

function isAiMentorDailyLimitEnabled(env) {
  return String(env.AI_MENTOR_DAILY_LIMIT_ENABLED ?? "true").trim().toLowerCase() !== "false";
}

function isDemoLessonPayload(value) {
  return value?.sessionmode === "demo" &&
    typeof value?.demosessionid === "string" &&
    value.demosessionid.startsWith("demo_") &&
    value?.action === "open-demo-mentor-session";
}

function isIdOnlyLessonPayload(value) {
  return ["userid", "subscriptionid", "courseid", "lessonid"].every((key) => {
    const id = Number(value?.[key]);
    return Number.isInteger(id) && id > 0;
  });
}

function bounded(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parseStringArray(value) {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item.trim()) : [];
  } catch {
    return [];
  }
}

function uniqueSignals(rows, field, limit = 5) {
  return [...new Set(rows.flatMap((row) => parseStringArray(row[field])).map((item) => bounded(item, 300)))].slice(0, limit);
}

async function resolveMentorContext(lessonData, env) {
  if (!isIdOnlyLessonPayload(lessonData)) return lessonData;
  const userid = Number(lessonData.userid);
  const subscriptionid = Number(lessonData.subscriptionid);
  const courseid = Number(lessonData.courseid);
  const lessonid = Number(lessonData.lessonid);
  const context = await env.DB.prepare(
    `SELECT u.firstname AS userfirstname, u.nextlessontypeforceoverride, u.debugmode,
            s.knowledgelevel, s.knowledgedomain, s.userpreferences,
            s.streakcount, s.unopenedcount, p.learning_goal AS userlearninggoal,
            p.timezone AS usertimezone,
            c.name AS coursename, c.learninggoal AS coursegoal,
            l.lessonname, l.goal, l.contentdescription, l.codedescription, l.concepts, l.avoid,
            (SELECT COUNT(*) FROM lessons course_lessons WHERE course_lessons.courseid = c.id) AS totallessons,
            (SELECT COUNT(*) FROM lessons positioned_lessons
              WHERE positioned_lessons.courseid = c.id AND positioned_lessons.id <= l.id) AS currentlesson,
            (SELECT COUNT(DISTINCT nh.lessonid) FROM notificationhistory nh
              WHERE nh.userid = u.id AND nh.courseid = c.id AND nh.lessonid IS NOT NULL AND nh.isopened = 1) AS openedlessons,
            (SELECT COUNT(DISTINCT nh.lessonid) FROM notificationhistory nh
              WHERE nh.userid = u.id AND nh.courseid = c.id AND nh.lessonid IS NOT NULL AND nh.isactioned = 1) AS completedlessons
       FROM users u
       INNER JOIN subscriptions s ON s.userid = u.id
       INNER JOIN courses c ON c.id = s.courseid
       INNER JOIN lessons l ON l.courseid = c.id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = ?1 AND s.id = ?2 AND c.id = ?3 AND l.id = ?4
        AND u.status = 'active'
      LIMIT 1`
  ).bind(userid, subscriptionid, courseid, lessonid).first();
  if (!context) throw new Error("AI Mentor lesson context was not found for the signed IDs.");

  const history = await env.DB.prepare(
    `SELECT lh.mentor_session_id, lh.provider_summary,
            COALESCE(lh.provider_sentiment_label, lh.derived_sentiment_label) AS sentiment_label,
            la.analysis_summary, la.strengths_json, la.needs_practice_json
       FROM learning_history lh
       LEFT JOIN learning_analysis la ON la.id = (
         SELECT la2.id FROM learning_analysis la2
          WHERE la2.learning_history_id = lh.id AND la2.status IN ('completed', 'low_quality')
          ORDER BY la2.analysis_version DESC LIMIT 1
       )
      WHERE lh.user_id = ?1 AND lh.course_id = ?2
      ORDER BY lh.created_at DESC LIMIT 3`
  ).bind(userid, courseid).all();
  const suggestions = await env.DB.prepare(
    `SELECT ls.title, ls.rationale, ls.suggested_action, ls.priority
       FROM learning_suggestion ls
       INNER JOIN learning_history lh ON lh.id = ls.learning_history_id
      WHERE lh.user_id = ?1 AND lh.course_id = ?2
        AND ls.target_channel = 'mentor' AND ls.status = 'active'
      ORDER BY ls.priority DESC, ls.created_at DESC LIMIT 3`
  ).bind(userid, courseid).all();
  const previousEvaluation = await env.DB.prepare(
    `SELECT ms.lesson_id, l.lessonname, ms.understanding_status,
            ms.validation_correct_answers, ms.validation_total_questions,
            ms.validation_skipped_answers, ms.uncertainty_detected,
            ms.explicit_confusion_detected, ms.evaluated_at
       FROM mentor_sessions ms
       INNER JOIN lessons l ON l.id = ms.lesson_id
      WHERE ms.user_id = ?1 AND ms.course_id = ?2
        AND ms.status = 'completed'
        AND ms.understanding_status IS NOT NULL
        AND ms.evaluated_at IS NOT NULL
      ORDER BY ms.evaluated_at DESC, ms.created_at DESC
      LIMIT 1`
  ).bind(userid, courseid).first();

  const relConfig = relationshipConfig(env, context.usertimezone);
  const currentPeriodKey = isoWeekKey(new Date(), relConfig.timezone);
  const routingState = relConfig.enabled
    ? await loadRelationshipRoutingState(env.DB, subscriptionid, currentPeriodKey)
    : {};
  const route = resolveConversationType({
    ...routingState,
    forceOverride: context.nextlessontypeforceoverride,
  }, relConfig);
  const definition = conversationDefinition(route.type, relConfig);
  const relationshipContext = route.type === "NORMAL_LESSON"
    ? "{}"
    : await assembleRelationshipContext(env.DB, userid, subscriptionid);

  const recentSessions = history.results.map((row) => ({
    summary: bounded(row.analysis_summary || row.provider_summary, 1200),
    sentiment: bounded(row.sentiment_label, 32) || null,
  }));
  const nextSteps = suggestions.results.map((row) => ({
    title: bounded(row.title, 180),
    rationale: bounded(row.rationale, 500),
    action: bounded(row.suggested_action, 500),
    priority: Math.max(0, Math.min(100, Number(row.priority) || 0)),
  }));
  const content = [context.goal, context.contentdescription, context.codedescription, context.concepts]
    .map((value) => bounded(value, 4000)).filter(Boolean).join("\n\n").slice(0, 8000);
  const totalLessons = Math.max(0, Number(context.totallessons) || 0);
  const completedLessons = Math.max(0, Number(context.completedlessons) || 0);
  const courseProgress = {
    currentLesson: Math.max(1, Number(context.currentlesson) || 1),
    totalLessons,
    openedLessons: Math.max(0, Number(context.openedlessons) || 0),
    completedLessons,
    unopenedLessons: Math.max(0, Number(context.unopenedcount) || 0),
    streakCount: Math.max(0, Number(context.streakcount) || 0),
    completionPercent: totalLessons ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0,
    currentTopic: bounded(context.lessonname, 200),
  };
  return {
    userid, subscriptionid, courseid, lessonid,
    userfirstname: bounded(context.userfirstname || "Learner", 100),
    coursename: bounded(context.coursename, 200),
    lessonname: bounded(context.lessonname, 200),
    knowledgelevel: bounded(context.knowledgelevel, 100),
    knowledgedomain: bounded(context.knowledgedomain, 500),
    userpreferences: bounded(context.userpreferences, 1000),
    userlearninggoal: bounded(context.userlearninggoal, 1000),
    usertimezone: relConfig.timezone,
    coursegoal: bounded(context.coursegoal, 2000),
    courseprogress: JSON.stringify(courseProgress),
    lessongoal: bounded(context.goal, 2000),
    contentdescription: bounded(context.contentdescription, 4000),
    codedescription: bounded(context.codedescription, 4000),
    concepts: bounded(context.concepts, 4000),
    content,
    learningmemory: JSON.stringify(recentSessions),
    knowledgestrengths: JSON.stringify(uniqueSignals(history.results, "strengths_json")),
    knowledgegaps: JSON.stringify(uniqueSignals(history.results, "needs_practice_json")),
    practicerecommendations: JSON.stringify(nextSteps),
    conversationtype: route.type,
    relationshipperiodkey: route.periodKey || "",
    relationshippromptversion: definition.promptVersion,
    relationshipdefinition: JSON.stringify(definition),
    relationshipcontext: relationshipContext,
    relationshiproutingreason: route.reason,
    nextlessontypeforceoverride: route.reason === "user_force_override"
      ? bounded(context.nextlessontypeforceoverride, 32).toUpperCase()
      : "",
    debugmode: isDebugMode(context.debugmode),
    ...(previousEvaluation ? {
      previouslessonevaluation: {
        lessonId: String(previousEvaluation.lesson_id),
        lessonName: bounded(previousEvaluation.lessonname, 200),
        status: previousEvaluation.understanding_status,
        correctAnswers: Number(previousEvaluation.validation_correct_answers),
        totalQuestions: Number(previousEvaluation.validation_total_questions),
        skippedAnswers: Number(previousEvaluation.validation_skipped_answers) || 0,
        uncertaintyDetected: Boolean(previousEvaluation.uncertainty_detected),
        explicitConfusionDetected: Boolean(previousEvaluation.explicit_confusion_detected),
        evaluatedAt: previousEvaluation.evaluated_at,
      },
    } : {}),
    timestamp: lessonData.timestamp,
  };
}

const UNDERSTANDING_STATUSES = new Set(["mastered", "understood", "needs_review"]);

function calculateUnderstandingStatus(value) {
  const correctPercentage = (value.correctAnswers / value.totalQuestions) * 100;
  if (value.skippedAnswers >= value.totalQuestions || value.explicitConfusionDetected) return "needs_review";
  if (correctPercentage >= 80 && !value.uncertaintyDetected) return "mastered";
  if (correctPercentage >= 50) return "understood";
  return "needs_review";
}

function normalizeLessonEvaluation(value, lessonData) {
  const correctAnswers = Number(value?.correctAnswers);
  const totalQuestions = Number(value?.totalQuestions);
  const skippedAnswers = Number(value?.skippedAnswers ?? 0);
  const requestedStatus = String(value?.status ?? "");
  if (!UNDERSTANDING_STATUSES.has(requestedStatus)) throw new Error("Invalid lesson understanding status.");
  if (!Number.isInteger(correctAnswers) || correctAnswers < 0) throw new Error("Invalid correct answer count.");
  if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) throw new Error("Invalid total question count.");
  if (correctAnswers > totalQuestions) throw new Error("Correct answers cannot exceed total questions.");
  if (!Number.isInteger(skippedAnswers) || skippedAnswers < 0 || skippedAnswers > totalQuestions) {
    throw new Error("Invalid skipped answer count.");
  }
  if (correctAnswers + skippedAnswers > totalQuestions) throw new Error("Answered and skipped counts exceed total questions.");

  const signals = {
    correctAnswers,
    totalQuestions,
    skippedAnswers,
    uncertaintyDetected: Boolean(value?.uncertaintyDetected),
    explicitConfusionDetected: Boolean(value?.explicitConfusionDetected),
  };
  const status = calculateUnderstandingStatus(signals);
  if (requestedStatus !== status) throw new Error("Lesson understanding status does not match the evaluation evidence.");

  return {
    lessonId: Number(lessonData.lessonid),
    lessonName: bounded(value?.lessonName, 200),
    status,
    correctAnswers,
    totalQuestions,
    skippedAnswers,
    uncertaintyDetected: signals.uncertaintyDetected,
    explicitConfusionDetected: signals.explicitConfusionDetected,
    evaluatedAt: new Date().toISOString(),
  };
}

async function saveLessonEvaluation(input, lessonData, env) {
  const mentorSessionId = bounded(input?.mentorSessionId, 100);
  if (!mentorSessionId) throw new Error("Missing mentor session ID.");
  const evaluation = normalizeLessonEvaluation(input?.evaluation, lessonData);
  const result = await env.DB.prepare(
    `UPDATE mentor_sessions
        SET understanding_status = ?2,
            validation_correct_answers = ?3,
            validation_total_questions = ?4,
            validation_skipped_answers = ?5,
            uncertainty_detected = ?6,
            explicit_confusion_detected = ?7,
            evaluated_at = ?8,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ?1
        AND user_id = ?9 AND subscription_id = ?10
        AND course_id = ?11 AND lesson_id = ?12
        AND status IN ('created', 'active', 'completed')`
  ).bind(
    mentorSessionId,
    evaluation.status,
    evaluation.correctAnswers,
    evaluation.totalQuestions,
    evaluation.skippedAnswers,
    evaluation.uncertaintyDetected ? 1 : 0,
    evaluation.explicitConfusionDetected ? 1 : 0,
    evaluation.evaluatedAt,
    Number(lessonData.userid),
    Number(lessonData.subscriptionid),
    Number(lessonData.courseid),
    Number(lessonData.lessonid)
  ).run();
  if (result.meta.changes !== 1) throw new Error("Mentor session was not available for evaluation.");
  return evaluation;
}

function normalizeCoachingOutcome(input, lessonData) {
  const mentorSessionId = bounded(input?.mentorSessionId, 100);
  if (!mentorSessionId) throw new Error("Missing mentor session ID.");
  const conversationType = bounded(input?.outcome?.conversationType, 32).toUpperCase();
  if (!['COURSE_CALIBRATION', 'WEEKLY_CHECKPOINT'].includes(conversationType)) {
    throw new Error("Invalid coaching conversation type.");
  }
  const discussionPoints = Array.isArray(input?.outcome?.discussionPoints)
    ? input.outcome.discussionPoints.slice(0, 6).map((point) => ({
        topic: bounded(point?.topic, 120),
        learnerInput: bounded(point?.learnerInput, 1200),
      })).filter((point) => point.topic && point.learnerInput)
    : [];
  const recapPoints = Array.isArray(input?.outcome?.recapPoints)
    ? input.outcome.recapPoints.slice(0, 6).map((point) => bounded(point, 600)).filter(Boolean)
    : [];
  if (!recapPoints.length) {
    throw new Error("Coaching outcome requires recap points.");
  }
  return {
    mentorSessionId,
    conversationType,
    discussionPoints,
    recapPoints,
    userId: Number(lessonData.userid),
    subscriptionId: Number(lessonData.subscriptionid),
    courseId: Number(lessonData.courseid),
    lessonId: Number(lessonData.lessonid),
  };
}

function coachingProfileField(topic) {
  const normalized = topic.toLowerCase();
  if (normalized.includes('goal') || normalized.includes('priority')) return ['SUBSCRIPTION', 'courseSpecificGoal'];
  if (normalized.includes('preference') || normalized.includes('learn best')) return ['USER', 'learningPreferences'];
  if (normalized.includes('knowledge') || normalized.includes('domain') || normalized.includes('experience')) return ['SUBSCRIPTION', 'generalKnowledgeDomain'];
  if (normalized.includes('block') || normalized.includes('challenge') || normalized.includes('difficult')) return ['SUBSCRIPTION', 'currentBlockers'];
  if (normalized.includes('confidence')) return ['SUBSCRIPTION', 'currentConfidence'];
  if (normalized.includes('interest')) return ['SUBSCRIPTION', 'currentInterests'];
  return [null, null];
}

async function saveCoachingOutcome(input, lessonData, env) {
  const outcome = normalizeCoachingOutcome(input, lessonData);
  const session = await env.DB.prepare(
    `SELECT id, conversation_type, period_key, prompt_version
       FROM mentor_sessions
      WHERE id = ?1 AND user_id = ?2 AND subscription_id = ?3
        AND course_id = ?4 AND lesson_id = ?5 AND status IN ('created','active','completed')`
  ).bind(outcome.mentorSessionId, outcome.userId, outcome.subscriptionId, outcome.courseId, outcome.lessonId).first();
  if (!session || session.conversation_type !== outcome.conversationType) {
    throw new Error("Mentor session was not available for this coaching outcome.");
  }

  const timestamp = Date.now();
  const statements = [];
  for (const [index, point] of outcome.discussionPoints.entries()) {
    const [targetType, fieldName] = coachingProfileField(point.topic);
    if (targetType && fieldName) {
      const subscriptionId = targetType === 'SUBSCRIPTION' ? outcome.subscriptionId : null;
      const scopeKey = targetType === 'SUBSCRIPTION' ? outcome.subscriptionId : 0;
      const valueJson = JSON.stringify(point.learnerInput);
      statements.push(env.DB.prepare(
        `INSERT INTO relationship_profile_values
           (id,user_id,subscription_id,scope_key,target_type,field_name,value_json,confidence,source_conversation_id,source_event_timestamp)
         VALUES (?1,?2,?3,?4,?5,?6,?7,0.9,?8,?9)
         ON CONFLICT(target_type,user_id,scope_key,field_name) DO UPDATE SET
           value_json=excluded.value_json, confidence=excluded.confidence,
           source_conversation_id=excluded.source_conversation_id,
           source_event_timestamp=excluded.source_event_timestamp, updated_at=CURRENT_TIMESTAMP`
      ).bind(crypto.randomUUID(), outcome.userId, subscriptionId, scopeKey, targetType, fieldName, valueJson, outcome.mentorSessionId, timestamp));
      statements.push(env.DB.prepare(
        `INSERT INTO relationship_profile_update_history
           (id,user_id,subscription_id,conversation_id,target_type,field_name,proposed_value_json,applied_value_json,confidence,reason,decision,prompt_version,schema_version)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?7,0.9,'Captured from live coaching card','APPLIED',?8,'2.0')
         ON CONFLICT(conversation_id,target_type,field_name) DO UPDATE SET
           proposed_value_json=excluded.proposed_value_json, applied_value_json=excluded.applied_value_json,
           decision='APPLIED', processed_at=CURRENT_TIMESTAMP`
      ).bind(crypto.randomUUID(), outcome.userId, subscriptionId, outcome.mentorSessionId, targetType, fieldName, valueJson, session.prompt_version || 'relationship-v1'));
    }
    statements.push(env.DB.prepare(
      `INSERT INTO relationship_memory
         (id,user_id,subscription_id,memory_type,scope,summary,importance,source_conversation_id,source_item_key,metadata_json)
       VALUES (?1,?2,?3,'FOLLOW_UP','SUBSCRIPTION',?4,70,?5,?6,?7)
       ON CONFLICT(source_conversation_id,source_item_key) DO UPDATE SET summary=excluded.summary, metadata_json=excluded.metadata_json`
    ).bind(crypto.randomUUID(), outcome.userId, outcome.subscriptionId, point.learnerInput, outcome.mentorSessionId, `discussion-${index + 1}`, JSON.stringify({ topic: point.topic })));
  }
  for (const [index, recapPoint] of outcome.recapPoints.entries()) {
    statements.push(env.DB.prepare(
      `INSERT INTO relationship_memory
         (id,user_id,subscription_id,memory_type,scope,summary,importance,source_conversation_id,source_item_key,metadata_json)
       VALUES (?1,?2,?3,'FOLLOW_UP','SUBSCRIPTION',?4,75,?5,?6,?7)
       ON CONFLICT(source_conversation_id,source_item_key) DO UPDATE SET summary=excluded.summary, metadata_json=excluded.metadata_json`
    ).bind(crypto.randomUUID(), outcome.userId, outcome.subscriptionId, recapPoint, outcome.mentorSessionId, `recap-${index + 1}`, JSON.stringify({ kind: 'coaching_recap' })));
  }

  if (outcome.conversationType === 'WEEKLY_CHECKPOINT') {
    const previous = await env.DB.prepare(
      `SELECT id FROM relationship_checkpoint_summaries WHERE subscription_id=?1 ORDER BY created_at DESC LIMIT 1`
    ).bind(outcome.subscriptionId).first();
    statements.push(env.DB.prepare(
      `INSERT INTO relationship_checkpoint_summaries
         (id,user_id,subscription_id,conversation_id,period_key,summary,changes_since_previous_json,validation_topics_json,previous_checkpoint_id)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
       ON CONFLICT(conversation_id) DO UPDATE SET summary=excluded.summary,
         changes_since_previous_json=excluded.changes_since_previous_json,
         validation_topics_json=excluded.validation_topics_json`
    ).bind(crypto.randomUUID(), outcome.userId, outcome.subscriptionId, outcome.mentorSessionId,
      session.period_key || new Date().toISOString().slice(0, 10), outcome.recapPoints.join(' '),
      JSON.stringify(outcome.recapPoints), JSON.stringify(outcome.discussionPoints.map((point) => point.topic)), previous?.id || null));
    statements.push(env.DB.prepare(
      `UPDATE subscriptions SET lastfeedbacksession=CURRENT_TIMESTAMP WHERE id=?1 AND userid=?2`
    ).bind(outcome.subscriptionId, outcome.userId));
  }
  statements.push(env.DB.prepare(
    `UPDATE mentor_sessions
        SET status='failed', failed_at=CURRENT_TIMESTAMP,
            failure_reason='superseded_by_completed_coaching', updated_at=CURRENT_TIMESTAMP
      WHERE subscription_id=?1 AND conversation_type=?2 AND id<>?3 AND status='completed'
        AND (?2='COURSE_CALIBRATION' OR period_key=?4)`
  ).bind(outcome.subscriptionId, outcome.conversationType, outcome.mentorSessionId, session.period_key || null));
  statements.push(env.DB.prepare(
    `UPDATE mentor_sessions SET status='completed', completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?1`
  ).bind(outcome.mentorSessionId));
  await env.DB.batch(statements);
  return { conversationType: outcome.conversationType, savedDiscussionPoints: outcome.discussionPoints.length, savedRecapPoints: outcome.recapPoints.length };
}

async function createMentorSession(context, env) {
  const mentorSessionId = crypto.randomUUID();
  const supersede = env.DB.prepare(
    `UPDATE mentor_sessions SET status='failed', failed_at=CURRENT_TIMESTAMP,
       failure_reason='superseded_by_retry', updated_at=CURRENT_TIMESTAMP
     WHERE subscription_id=?1 AND conversation_type=?2 AND status IN ('created','active')
       AND ((period_key IS NULL AND ?3 IS NULL) OR period_key=?3)`
  ).bind(context.subscriptionid, context.conversationtype || "NORMAL_LESSON", context.relationshipperiodkey || null);
  const insert = env.DB.prepare(
    `INSERT INTO mentor_sessions
       (id, user_id, subscription_id, course_id, lesson_id, provider, status,
        conversation_type, period_key, prompt_version, relationship_schema_version)
     VALUES (?1, ?2, ?3, ?4, ?5, 'elevenlabs', 'active', ?6, ?7, ?8, ?9)`
  ).bind(
    mentorSessionId, context.userid, context.subscriptionid, context.courseid, context.lessonid,
    context.conversationtype || "NORMAL_LESSON", context.relationshipperiodkey || null,
    context.relationshippromptversion || "lesson-v1",
    context.conversationtype === "NORMAL_LESSON" ? null : "2.0"
  );
  const forcedType = bounded(context.nextlessontypeforceoverride, 32).toUpperCase();
  const consumeOverride = forcedType
    ? env.DB.prepare(
      `UPDATE users SET nextlessontypeforceoverride = NULL
        WHERE id = ?1 AND UPPER(TRIM(nextlessontypeforceoverride)) = ?2`
    ).bind(context.userid, forcedType)
    : null;
  const statements = context.conversationtype === "NORMAL_LESSON" ? [insert] : [supersede, insert];
  if (consumeOverride) statements.push(consumeOverride);
  if (statements.length === 1) await insert.run();
  else await env.DB.batch(statements);
  return mentorSessionId;
}

function validateUsageRequest(action, lessonData) {
  const subscriptionid = Number(lessonData.subscriptionid);

  if (!Number.isInteger(subscriptionid) || subscriptionid <= 0) {
    return {
      ok: false,
      status: 400,
      isLocalValidationError: true,
      body: { error: "Missing or invalid subscriptionid in lesson payload" },
    };
  }

  if (!["check_aimentor_usage", "update_aimentor_usage"].includes(action)) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: "invalid input data" },
    };
  }

  const expiresAt = new Date(getUsageExpiresAt(lessonData));

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: "invalid input data" },
    };
  }

  return { ok: true, subscriptionid };
}

async function handleAIMentorUsage(action, lessonData, env) {
  const validation = validateUsageRequest(action, lessonData);

  if (!validation.ok) return validation;

  const subscription = await env.DB.prepare(
    `SELECT
       u.id AS userid,
       s.id AS subscriptionid,
       s.status AS subscriptionstatus,
       u.status AS userstatus,
       u.lastaimentorusage AS lastaimentorusage
     FROM subscriptions s
     INNER JOIN users u ON u.id = s.userid
     WHERE s.id = ?`
  ).bind(validation.subscriptionid).first();

  if (!subscription) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: "subscription cannot be found" },
    };
  }

  if (subscription.userstatus !== "active") {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: "Inactive subscription or user" },
    };
  }

  if (
    isAiMentorDailyLimitEnabled(env) &&
    subscription.lastaimentorusage &&
    String(subscription.lastaimentorusage).slice(0, 10) === new Date().toISOString().slice(0, 10)
  ) {
    return {
      ok: false,
      status: 400,
      body: { success: false, error: "AI mentor session is already used" },
    };
  }

  if (action === "update_aimentor_usage") {
    await env.DB.prepare(
      `UPDATE users
       SET lastaimentorusage = date('now')
       WHERE id = ?`
    ).bind(subscription.userid).run();
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      message: action === "update_aimentor_usage"
        ? "AI mentor session usage updated"
        : "AI mentor session is ready to use",
    },
  };
}

function ensureEnv(env, requiredEnv, corsHeaders) {
  const missingEnv = requiredEnv.filter((key) => !env[key]);

  if (missingEnv.length === 0) return null;

  return jsonResponse(
    {
      error: "Missing environment variables",
      missing: missingEnv,
    },
    500,
    corsHeaders
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const corsHeaders = getCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    console.log("Path:", pathname, "| Origin:", origin, "| Referer:", referer);

    if (!origin && !referer) {
      return jsonResponse({ error: "Direct browser access not allowed" }, 403, corsHeaders);
    }

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      console.log("Forbidden origin:", origin);
      return jsonResponse({ error: "Forbidden origin" }, 403, corsHeaders);
    }

    if (pathname === "/lesson") {
      const envError = ensureEnv(env, ["HMAC_SECRET"], corsHeaders);
      if (envError) return envError;

      try {
        const { encoded, signature, body } = await getRequestPayload(request, searchParams);
        const result = await validateSignedLessonPayload(encoded, signature, env);

        if (result.error) {
          return jsonResponse({ error: result.error }, result.status, corsHeaders);
        }

        const context = await resolveMentorContext(result.lessonData, env);
        return jsonResponse(context, 200, corsHeaders);
      } catch (err) {
        return jsonResponse(
          {
            error: "Lesson payload error",
            details: err.message,
          },
          500,
          corsHeaders
        );
      }
    }

    if (pathname === "/agent" || pathname === "/usage" || pathname === "/evaluation" || pathname === "/coaching-outcome" || pathname === "/consent") {
      const requiredEnv = [
        "HMAC_SECRET",
        "DB",
      ];

      if (pathname === "/agent") {
        requiredEnv.push("ELEVENLABS_AGENT_ID", "ELEVENLABS_API_KEY");
      }

      const envError = ensureEnv(env, requiredEnv, corsHeaders);
      if (envError) return envError;

      try {
        const { encoded, signature, body } = await getRequestPayload(request, searchParams);
        const result = await validateSignedLessonPayload(encoded, signature, env);

        if (result.error) {
          return jsonResponse({ error: result.error }, result.status, corsHeaders);
        }

        const demoMode = isDemoLessonPayload(result.lessonData);

        if (pathname === "/consent") {
          if (!demoMode || !env.DEMO_ADMIN) return jsonResponse({ error: "Demo consent is unavailable." }, 400, corsHeaders);
          const consentResponse = await env.DEMO_ADMIN.fetch("https://demo-admin.internal/api/tester-consent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: encoded, sig: signature }),
          });
          return jsonResponse(await consentResponse.json(), consentResponse.status, corsHeaders);
        }

        if (pathname === "/evaluation") {
          if (demoMode) return jsonResponse({ success: true, demo: true }, 200, corsHeaders);
          if (!isIdOnlyLessonPayload(result.lessonData)) {
            return jsonResponse({ error: "Lesson evaluation requires an ID-only mentor link." }, 400, corsHeaders);
          }
          const evaluation = await saveLessonEvaluation(body, result.lessonData, env);
          return jsonResponse({ success: true, evaluation }, 200, corsHeaders);
        }

        if (pathname === "/coaching-outcome") {
          if (demoMode) return jsonResponse({ success: true, demo: true }, 200, corsHeaders);
          if (!isIdOnlyLessonPayload(result.lessonData)) {
            return jsonResponse({ error: "Coaching outcome requires an ID-only mentor link." }, 400, corsHeaders);
          }
          try {
            const outcome = await saveCoachingOutcome(body, result.lessonData, env);
            return jsonResponse({ success: true, outcome }, 200, corsHeaders);
          } catch (error) {
            console.error("Coaching outcome persistence failed", error);
            return jsonResponse({ error: "Coaching outcome could not be saved.", details: error.message }, 500, corsHeaders);
          }
        }

        const action = pathname === "/agent" ? "check_aimentor_usage" : "update_aimentor_usage";
        const usageResult = demoMode
          ? { ok: true, status: 200, body: { success: true, demo: true } }
          : await handleAIMentorUsage(action, result.lessonData, env);

        if (!usageResult.ok) {
          if (usageResult.isLocalValidationError) {
            return jsonResponse(
              { error: "This lesson link is missing subscription data. Please open the latest AI Mentor lesson link from your course email." },
              400,
              corsHeaders
            );
          }

          if (usageResult.status === 400 && pathname === "/agent") {
            return jsonResponse(
              { error: AI_MENTOR_USAGE_LIMIT_MESSAGE },
              400,
              corsHeaders
            );
          }

          return jsonResponse(
            {
              error: "AI Mentor usage validation failed",
              details: usageResult.body,
            },
            usageResult.status || 500,
            corsHeaders
          );
        }

        if (pathname === "/usage") {
          return jsonResponse({ success: true }, 200, corsHeaders);
        }

        const resolvedContext = await resolveMentorContext(result.lessonData, env);
        const idOnlyBootstrap = isIdOnlyLessonPayload(result.lessonData);
        const userDebugMode = isDebugMode(resolvedContext?.debugmode);
        const mentorSessionId = demoMode
          ? result.lessonData.demosessionid
          : idOnlyBootstrap ? await createMentorSession(resolvedContext, env) : null;

        let tokenAvailability;

        try {
          const tokenLimitResult = await ensureEnoughAvailableTokens(env, corsHeaders, userDebugMode);

          if (tokenLimitResult instanceof Response) {
            return tokenLimitResult;
          }

          tokenAvailability = tokenLimitResult.tokenAvailability;
        } catch (err) {
          return jsonResponse(
            {
              error: `Unable to check token availability: ${err.message}`,
              details: err.message,
            },
            502,
            corsHeaders
          );
        }

        const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
          env.ELEVENLABS_AGENT_ID
        )}`;
        const res = await fetch(apiUrl, {
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        });

        const text = await res.text();
        let data = null;

        try {
          data = text ? JSON.parse(text) : null;
        } catch (err) {
          return jsonResponse(
            withDebugPayload(
              {
                error: `Unable to parse signed session response: ${err.message}`,
              },
                userDebugMode,
              tokenAvailability
            ),
            502,
            corsHeaders
          );
        }

        return jsonResponse(
          {
            ...withDebugPayload(data, userDebugMode, tokenAvailability),
            mentor_context_mode: demoMode ? "demo" : idOnlyBootstrap ? "app_resolved" : "legacy_content",
            ...(mentorSessionId ? { mentor_session_id: mentorSessionId } : {}),
          },
          res.status,
          corsHeaders
        );
      } catch (err) {
        return jsonResponse(
          {
            error: "AI Mentor session error",
            details: err.message,
          },
          500,
          corsHeaders
        );
      }
    }

    return jsonResponse({ error: "Not found" }, 404, corsHeaders);
  },
};
