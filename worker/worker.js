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
      const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(
        env.ELEVENLABS_AGENT_ID
      )}`;
      const res = await fetch(apiUrl, {
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      });

      const text = await res.text();
      return new Response(text, {
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
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
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
