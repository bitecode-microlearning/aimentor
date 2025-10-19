import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.6.1/dist/lib.umd.js";

const chatLog = document.getElementById("chatLog");
const addMsg = (sender, msg) => {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

// 🔹 Cloudflare Worker proxy endpoint (include protocol)
const WORKER_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev";

(async () => {
  addMsg("System", "Requesting signed session from worker...");

  // Call the Worker without sending any agent_id so it will use its environment variable.
  const res = await fetch(WORKER_URL);
  const data = await res.json();

  if (!data.signed_url) {
    addMsg("⚠️", "Could not retrieve signed URL from worker.");
    console.error("Worker response:", data);
    return;
  }

  // Extract the conversation signature from the signed URL
  const sigMatch = data.signed_url.match(/conversation_signature=([^&]+)/);
  if (!sigMatch) {
    addMsg("⚠️", "Signed URL did not contain a conversation signature.");
    console.error("Signed URL:", data.signed_url);
    return;
  }
  const signature = sigMatch[1];

  // Try to obtain agentId from the signed_url (if the worker forwarded it)
  let agentId = null;
  const agentMatch = data.signed_url.match(/agent_id=([^&]+)/);
  if (agentMatch) agentId = decodeURIComponent(agentMatch[1]);

  if (!agentId) {
    addMsg("⚠️", "Agent ID not available. The Worker should set AGENT_ID in its environment or include agent_id in the response.");
    console.error("No agent id found in signed_url.");
    return;
  }

  // 🔹 Start the ElevenLabs Conversation (client does not provide any API key)
  const conversation = await Conversation.startSession({
    agentId,
    conversationSignature: signature,
    clientTools: {
      logMessage: async ({ message }) => addMsg("🤖", message),
      onUserMessage: async ({ message }) => addMsg("👤", message),
      onEnd: async () => addMsg("✅", "Conversation ended."),
    },
  });

  addMsg("System", "Connected to ElevenLabs.");
  await conversation.sendUserMessage("Hi! Let's start the mentoring session.");
})();
