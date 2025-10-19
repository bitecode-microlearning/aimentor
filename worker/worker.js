export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Set your allowed frontend domain here
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://aimentor.pages.dev", // your Cloudflare Pages domain
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight OPTIONS request for CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Get agent ID from environment
    const agentId = env.ELEVENLABS_AGENT_ID;
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing agent_id" }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    // Get API key from environment
    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing ElevenLabs API key." }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    try {
      // Request a signed URL from ElevenLabs
      const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
      const res = await fetch(apiUrl, {
        headers: { "xi-api-key": apiKey },
      });

      if (!res.ok) {
        const msg = await res.text();
        return new Response(
          JSON.stringify({ error: "ElevenLabs API error", details: msg }),
          {
            status: res.status,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Return ElevenLabs JSON with CORS headers
      return new Response(await res.text(), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }
  },
};
