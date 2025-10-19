// Make sure the ElevenLabs client script is loaded before this file
const chatLog = document.getElementById("chatLog");

const addMsg = (sender, msg) => {
  const div = document.createElement("div");
  div.innerHTML = `<b>${sender}:</b> ${msg}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const WORKER_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev";

(async () => {
  addMsg("System", "Requesting signed session from Worker...");

  try {
    const res = await fetch(WORKER_URL);
    const data = await res.json();

    if (!data.signed_url) {
      addMsg("⚠️", "Could not retrieve signed URL from Worker.");
      console.error("Worker response:", data);
      return;
    }

    const sigMatch = data.signed_url.match(/conversation_signature=([^&]+)/);
    const agentMatch = data.signed_url.match(/agent_id=([^&]+)/);
    if (!sigMatch || !agentMatch) {
      addMsg("⚠️", "Invalid signed URL format.");
      console.error("Signed URL:", data.signed_url);
      return;
    }

    const signature = sigMatch[1];
    const agentId = decodeURIComponent(agentMatch[1]);

    // Wait until the SDK is fully loaded
    while (!window.client && !window.ElevenLabs) {
      await new Promise(r => setTimeout(r, 100));
    }

    // Find the correct Conversation object
    const Conversation =
      (window.ElevenLabs?.client?.Conversation) ||
      (window.client?.Conversation) ||
      (window.ElevenLabs?.Conversation);

    if (!Conversation) {
      addMsg("⚠️", "ElevenLabs client not found.");
      console.error("Globals:", Object.keys(window));
      return;
    }

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
