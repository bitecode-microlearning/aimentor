// Uses the official ESM build of the ElevenLabs SDK
import { Conversation } from "https://esm.sh/@elevenlabs/client@latest";

const chatLog = document.getElementById("chatLog");

// Helper to append messages to the chat log
function addMsg(sender, msg) {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Cloudflare Worker endpoint that returns a signed URL
const WORKER_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev";

async function startMentor() {
  addMsg("System", "Requesting signed session from Worker...");

  try {
    // Fetch the signed URL (string) from your Worker
    const res = await fetch(WORKER_URL);
    const data = await res.json();

    if (!data.signed_url) {
      addMsg("⚠️", "Worker did not return a signed_url.");
      console.error("Worker response:", data);
      return;
    }

    const signedUrl = data.signed_url;
    console.log("🔐 Signed URL received:", signedUrl);

    // Create the conversation directly from the signed URL
    const conversation = await Conversation.startSession({
      signedUrl, // ✅ pass the whole signed URL as per ElevenLabs spec
      connectionType: "websocket", // optional but explicit
      clientTools: {
        logMessage: async ({ message }) => addMsg("🤖", message),
        onUserMessage: async ({ message }) => addMsg("👤", message),
        onEnd: async () => addMsg("✅", "Conversation ended."),
      },
    });

    addMsg("System", "Connected to ElevenLabs successfully.");

    // Try to log the conversation_id if the SDK exposes it
    const convId =
      conversation?.conversationId ||
      conversation?.id ||
      conversation?.state?.conversationId;
    if (convId) console.log("🧠 Conversation ID:", convId);

    // Send an initial user message
    await conversation.sendUserMessage("Hi! Let's start the mentoring session.");
  } catch (err) {
    console.error("❌ Error starting conversation:", err);
    addMsg("❌", "Unexpected error occurred. See console for details.");
  }
}

startMentor();
