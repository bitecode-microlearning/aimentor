// ESM import ensures the latest ElevenLabs SDK with correct conversation_signature support
import { Conversation } from "https://esm.sh/@elevenlabs/client@latest";

const chatLog = document.getElementById("chatLog");

// Helper to print messages to the chat log
function addMsg(sender, msg) {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Cloudflare Worker endpoint returning the signed URL
const WORKER_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev";

async function startMentor() {
  addMsg("System", "Requesting signed session from Worker...");

  try {
    const res = await fetch(WORKER_URL);
    const data = await res.json();

    if (!data.signed_url) {
      addMsg("⚠️", "Could not retrieve signed URL from Worker.");
      console.error("Worker response:", data);
      return;
    }

    // Parse agent_id and conversation_signature
    const sigMatch = data.signed_url.match(/conversation_signature=([^&]+)/);
    const agentMatch = data.signed_url.match(/agent_id=([^&]+)/);
    if (!sigMatch || !agentMatch) {
      addMsg("⚠️", "Invalid signed URL format.");
      console.error("Signed URL:", data.signed_url);
      return;
    }

    const signature = sigMatch[1];
    const agentId = decodeURIComponent(agentMatch[1]);

    // Create a new conversation session using ElevenLabs SDK
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
  } catch (err) {
    console.error("Error:", err);
    addMsg("❌", "Unexpected error occurred. See console for details.");
  }
}

startMentor();
