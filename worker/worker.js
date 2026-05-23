const ALLOWED_ORIGINS = [
  "https://aimentor.pages.dev",
  "https://aimentor-app.pages.dev",
  "http://localhost:5173",
  "http://localhost:3000",
];

const AI_MENTOR_USAGE_LIMIT_MESSAGE =
  "You have already used your AI Mentor session today. Please come back tomorrow for your next session.";

const jsonResponse = (body, status, corsHeaders) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
});

const getRequestPayload = async (request, searchParams) => {
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
};

const createHmacKey = (secret) =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

const signEncodedPayload = async (encoded, secret) => {
  const key = await createHmacKey(secret);
  const expectedSigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encoded)
  );

  return Array.from(new Uint8Array(expectedSigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const verifySignature = async (encoded, signature, secret) => {
  const expectedSig = await signEncodedPayload(encoded, secret);
  return expectedSig === signature;
};

const decodeLessonPayload = async (encoded) => {
  const binaryString = atob(encoded);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const ds = new DecompressionStream("gzip");
  const gzipStream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  const decompressedText = await gzipStream.text();

  return JSON.parse(decompressedText);
};

const validateSignedLessonPayload = async (encoded, signature, env) => {
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
};

const getRetoolExpiresAt = (lessonData) => {
  if (lessonData.expiresat) return lessonData.expiresat;
  if (lessonData.expiresAt) return lessonData.expiresAt;

  const timestampMs = Number(lessonData.timestamp) * 1000;
  if (Number.isFinite(timestampMs)) {
    return new Date(timestampMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
};

const callAIMentorUsageWorkflow = async (action, lessonData, env) => {
  const subscriptionid = Number(lessonData.subscriptionid);

  if (!Number.isInteger(subscriptionid) || subscriptionid <= 0) {
    return {
      ok: false,
      status: 400,
      isLocalValidationError: true,
      body: { error: "Missing or invalid subscriptionid in lesson payload" },
    };
  }

  const res = await fetch(env.RETOOL_WORKFLOW_URL_AIMENTORHANDLER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Workflow-Api-Key": env.RETOOL_WORKFLOW_SECRET_AIMENTORHANDLER,
    },
    body: JSON.stringify({
      action,
      subscriptionid,
      expiresat: getRetoolExpiresAt(lessonData),
      nonce: lessonData.nonce || crypto.randomUUID(),
      testmode: lessonData.testmode || "false",
    }),
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
  };
};

const ensureEnv = (env, requiredEnv, corsHeaders) => {
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
};

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
      const envError = ensureEnv(
        env,
        [
          "ELEVENLABS_AGENT_ID",
          "ELEVENLABS_API_KEY",
          "HMAC_SECRET",
          "RETOOL_WORKFLOW_URL_AIMENTORHANDLER",
          "RETOOL_WORKFLOW_SECRET_AIMENTORHANDLER",
        ],
        corsHeaders
      );
      if (envError) return envError;

      try {
        const { encoded, signature } = await getRequestPayload(request, searchParams);
        const result = await validateSignedLessonPayload(encoded, signature, env);

        if (result.error) {
          return jsonResponse({ error: result.error }, result.status, corsHeaders);
        }

        const action = pathname === "/agent" ? "check_aimentor_usage" : "update_aimentor_usage";
        const usageResult = await callAIMentorUsageWorkflow(action, result.lessonData, env);

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

        const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
          env.ELEVENLABS_AGENT_ID
        )}`;
        const res = await fetch(apiUrl, {
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        });

        const text = await res.text();
        return new Response(text, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
