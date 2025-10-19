// Make sure the ElevenLabs client script is loaded in your HTML before this file:
// <script src="https://cdn.jsdelivr.net/npm/@elevenlabs/client@0.6.1/dist/lib.umd.js"></script>
// <script src="./aimentor.js"></script>

const chatLog = document.getElementById("chatLog");

// Utility function to append messages to the chat window
const addMsg = (sender, msg) => {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

// Cloudflare Worker endpoint (must include protocol)
const WORKER_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev";

(async () => {
  addMsg("System", "Requesting signed session from Worker...");

  try {
    // Request the signed URL from the Cloudflare Worker
    const res = await fetch(WORKER_URL);
    const data = await res.json();

    if (!data.signed_url) {
      addMsg("⚠️", "Could not retrieve signed URL from Worker.");
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

    // Extract the agent ID from the signed URL
    let agentId = null;
    const agentMatch = data.signed_url.match(/agent_id=([^&]+)/);
    if (agentMatch) agentId = decodeURIComponent(agentMatch[1]);

    if (!agentId) {
      addMsg("⚠️", "Agent ID not found in signed URL.");
      console.error("No agent id found in signed_url.");
      return;
    }

    // Verify that the ElevenLabs client was loaded successfully
    const globalClient = window.client || window.ElevenLabs || {};
    const { Conversation } = globalClient;
    if (!Conversation) {
      addMsg("⚠️", "ElevenLabs client not found. Did you include the script tag?");
      console.error("Global ElevenLabs object:", globalClient);
      return;
    }

    // Start the ElevenLabs Conversation (no API key needed on frontend)
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
})();
