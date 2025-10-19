import { decode as base64Decode } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { gunzipSync } from "https://deno.land/x/compress@v0.4.5/gzip/mod.ts";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://aimentor.pages.dev",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 🔹 1. ElevenLabs endpoint megmarad
    if (pathname === "/agent") {
      const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`;
      const res = await fetch(apiUrl, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
      return new Response(await res.text(), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 🔹 2. Lesson endpoint - dekódolja és validálja a payloadot
    if (pathname === "/lesson") {
      const encoded = searchParams.get("data");
      const signature = searchParams.get("sig");

      if (!encoded || !signature) {
        return new Response(JSON.stringify({ error: "Missing data or signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Compute expected HMAC
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(env.HMAC_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
      );

      const expectedSigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
      const expectedSig = Array.from(new Uint8Array(expectedSigBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (expectedSig !== signature) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        // Decode Base64 → gunzip → JSON parse
        const compressed = base64Decode(encoded);
        const decompressed = gunzipSync(compressed);
        const jsonText = new TextDecoder().decode(decompressed);
        const lessonData = JSON.parse(jsonText);

        return new Response(JSON.stringify(lessonData), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Decompression error", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
