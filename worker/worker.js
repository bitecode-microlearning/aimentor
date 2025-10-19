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

    // --- 🔹 1. ElevenLabs agent endpoint ---
    if (pathname === "/agent") {
      const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID)}`;
      const res = await fetch(apiUrl, { headers: { "xi-api-key": env.ELEVENLABS_API_KEY } });
      return new Response(await res.text(), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // --- 🔹 2. Lesson endpoint with HMAC + 30-day expiry ---
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
        // Base64 decode → Gzip decompress → parse JSON
        const binaryString = atob(encoded);
        const byteArray = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
        const ds = new DecompressionStream("gzip");
        const decompressedStream = new Response(byteArray.stream().pipeThrough(ds));
        const decompressedText = await decompressedStream.text();
        const lessonData = JSON.parse(decompressedText);

        // --- ✅ 30-days expirty check ---
        const now = Date.now() / 1000; // seconds
        const maxAge = 60 * 60 * 24 * 30; // 30 days in seconds
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
