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

function isDebugMode(env) {
  return String(env.DEBUG_MODE ?? "") === "1";
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

function buildDebugPayload(env, tokenAvailability) {
  if (!isDebugMode(env)) return undefined;

  return {
    debugMode: true,
    tokenAvailability,
  };
}

function withDebugPayload(body, env, tokenAvailability) {
  const debug = buildDebugPayload(env, tokenAvailability);

  if (!debug) return body;

  return {
    ...body,
    debug,
  };
}

async function ensureEnoughAvailableTokens(env, corsHeaders) {
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
        env,
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

  const isValidSignature = await verifySignature(encoded, signature, env.HMAC_SECRET);
  if (!isValidSignature) {
    return { error: "Invalid signature", status: 403 };
  }

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

function withMentorBootstrapMode(body, env) {
  return {
    ...body,
    mentor_context_mode: String(env.MENTOR_ID_ONLY_BOOTSTRAP_ENABLED ?? "").toLowerCase() === "true"
      ? "id_only"
      : "legacy_content",
  };
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
        const { encoded, signature } = await getRequestPayload(request, searchParams);
        const result = await validateSignedLessonPayload(encoded, signature, env);

        if (result.error) {
          return jsonResponse({ error: result.error }, result.status, corsHeaders);
        }

        return jsonResponse(result.lessonData, 200, corsHeaders);
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

    if (pathname === "/agent" || pathname === "/usage") {
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
        const { encoded, signature } = await getRequestPayload(request, searchParams);
        const result = await validateSignedLessonPayload(encoded, signature, env);

        if (result.error) {
          return jsonResponse({ error: result.error }, result.status, corsHeaders);
        }

        const action = pathname === "/agent" ? "check_aimentor_usage" : "update_aimentor_usage";
        const usageResult = await handleAIMentorUsage(action, result.lessonData, env);

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

        let tokenAvailability;

        try {
          const tokenLimitResult = await ensureEnoughAvailableTokens(env, corsHeaders);

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
              env,
              tokenAvailability
            ),
            502,
            corsHeaders
          );
        }

        return jsonResponse(
          withMentorBootstrapMode(withDebugPayload(data, env, tokenAvailability), env),
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
