export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const agentId = url.searchParams.get("agent_id");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing agent_id" }), { status: 400 });
    }

    const apiUrl = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`;
    const res = await fetch(apiUrl, {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
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
