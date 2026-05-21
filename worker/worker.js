const DEFAULT_MIN_AVAILABLE_TOKENS = 2000;
const TOKEN_UNAVAILABLE_ERROR =
  "Kifogytunk a tokenből, ezért ez a szolgáltatás most nem elérhető. Ha szeretnéd használni, és van rá kapacitásod, támogasd a rendszert a Buy Me a Coffee-n: https://buymeacoffee.com/bitecode. Ezzel segítesz, hogy a rendszer reklámmentes és ingyenes maradjon, és több elérhető tokenje legyen a közösségnek.";

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function getMinimumAvailableTokens(env) {
  const configuredLimit = Number(env.MIN_AVAILABLE_TOKENS ?? env.TOKEN_LIMIT);

  if (!Number.isFinite(configuredLimit) || configuredLimit < 0) {
    return DEFAULT_MIN_AVAILABLE_TOKENS;
  }

  return configuredLimit;
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

function getElevenLabsErrorMessage(data, status) {
  const detail = data?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (typeof detail?.message === "string") {
    return detail.message;
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join("; ");
  }

  if (typeof data?.error === "string") {
    return data.error;
  }

  return `ElevenLabs API returned HTTP ${status}`;
}

async function ensureEnoughAvailableTokens(env, corsHeaders) {
  const subscription = await getElevenLabsSubscription(env);
  const characterLimit = Number(subscription?.character_limit);
  const characterCount = Number(subscription?.character_count);
  const minimumAvailableTokens = getMinimumAvailableTokens(env);

  if (!Number.isFinite(characterLimit) || !Number.isFinite(characterCount)) {
    throw new Error("Subscription response is missing character_count or character_limit");
  }

  const availableTokens = characterLimit - characterCount;

  if (availableTokens < minimumAvailableTokens) {
    return jsonResponse(
      {
        error: TOKEN_UNAVAILABLE_ERROR,
        code: "TOKEN_LIMIT_EXCEEDED",
        availableTokens,
        minimumAvailableTokens,
      },
      503,
      corsHeaders
    );
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // --- ✅ Universal CORS headers ---
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // or replace "*" with your exact domains if needed
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // --- ✅ Handle preflight requests (OPTIONS) ---
    if (request.method === "OPTIONS") {
      return new Response("OK", { headers: corsHeaders });
    }

    // --- 🔹 Logging (helps debug CORS & origins)
    const allowedOrigins = [
      "https://aimentor.pages.dev",
      "https://aimentor-app.pages.dev",
      "http://localhost:5173",
    ];
    const origin = request.headers.get("Origin");
    const referer = request.headers.get("Referer");
    console.log("📥 Path:", pathname, "| Origin:", origin, "| Referer:", referer);

    if (!origin && !referer) {
      // közvetlen URL-megnyitás (címsorba beírva) → tiltjuk
      return new Response(
        JSON.stringify({ error: "Direct browser access not allowed" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (origin && !allowedOrigins.includes(origin)) {
      console.log("🚫 Forbidden origin:", origin);
      return new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requiredEnv = [
      "ELEVENLABS_AGENT_ID",
      "ELEVENLABS_API_KEY",
      "HMAC_SECRET",
    ];
    const missingEnv = requiredEnv.filter((key) => !env[key]);

    if (missingEnv.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Missing environment variables",
          missing: missingEnv,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // --- 🔹 1. ElevenLabs agent endpoint ---
    if (pathname === "/agent") {
      try {
        const tokenLimitResponse = await ensureEnoughAvailableTokens(env, corsHeaders);

        if (tokenLimitResponse) {
          return tokenLimitResponse;
        }
      } catch (err) {
        return jsonResponse(
          {
            error: `Nem sikerült ellenőrizni az elérhető token keretet: ${err.message}`,
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
      return new Response(text, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- 🔹 2. Lesson endpoint with HMAC + 30-day expiry ---
    if (pathname === "/lesson") {
      const encoded = searchParams.get("data");
      const signature = searchParams.get("sig");

      if (!encoded || !signature) {
        return new Response(
          JSON.stringify({ error: "Missing data or signature" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        // Compute expected HMAC
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(env.HMAC_SECRET),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign", "verify"]
        );
        const expectedSigBuffer = await crypto.subtle.sign(
          "HMAC",
          key,
          new TextEncoder().encode(encoded)
        );
        const expectedSig = Array.from(new Uint8Array(expectedSigBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        if (expectedSig !== signature) {
          const errormsg = "Invalid signature, cur.sig: "+signature+" expected: "+expectedSig;
          return new Response(JSON.stringify({ error: errormsg }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Encryption error",
            details: err.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      try {
        // Base64 decode → Uint8Array
        const binaryString = atob(encoded);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // ✅ Cloudflare-safe gzip decompress
        const ds = new DecompressionStream("gzip");
        const gzipStream = new Response(new Blob([bytes]).stream().pipeThrough(ds));
        const decompressedText = await gzipStream.text();

        const lessonData = JSON.parse(decompressedText);

        // --- ✅ 30 napos lejárati ellenőrzés ---
        const now = Date.now() / 1000;
        const maxAge = 60 * 60 * 24 * 30;
        const ts = lessonData.timestamp;

        if (!ts || now - ts > maxAge) {
          return new Response(JSON.stringify({ error: "Link expired" }), {
            status: 410,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(lessonData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "Decompression error",
            details: err.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // --- 🔹 Default not found handler
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
