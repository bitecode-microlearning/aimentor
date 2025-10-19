export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Prefer an agent id from Cloudflare environment variables; fall back to query param
    const agentId = env.ELEVENLABS_AGENT_ID || url.searchParams.get("agent_id");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing agent_id. Set AGENT_ID in Cloudflare environment or provide ?agent_id= in the request." }), { status: 400 });
    }

    // API key must come from Cloudflare environment variable
    const apiKey = env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing ElevenLabs API key. Set ELEVENLABS_API_KEY in Cloudflare environment." }), { status: 500 });
    }

    const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;
    const res = await fetch(apiUrl, {
      headers: { "xi-api-key": apiKey },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "ElevenLabs API error" }), { status: res.status });
    }

    // Átadjuk a ElevenLabs JSON választ
    return new Response(await res.text(), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
