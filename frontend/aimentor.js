import { Conversation } from "https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.6.1/dist/lib.umd.js";

const chatLog = document.getElementById("chatLog");
const addMsg = (sender, msg) => {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

// 🔹 Cloudflare Worker proxy endpoint
const WORKER_URL = "https://mentor-proxy.bitecode.workers.dev";
const AGENT_ID = "agent_XXXXXXXXXXXX";

(async () => {
  addMsg("System", "Requesting signed session...");

  // 🔹 Lekérjük a signed URL-t a Worker-től
  const res = await fetch(`${WORKER_URL}?agent_id=${AGENT_ID}`);
  const data = await res.json();
  if (!data.signed_url) {
    addMsg("⚠️", "Could not retrieve signed URL.");
    return;
  }

  const signature = data.signed_url.match(/conversation_signature=([^&]+)/)[1];

  // 🔹 ElevenLabs Conversation indítása
  const conversation = await Conversation.startSession({
    agentId: AGENT_ID,
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
