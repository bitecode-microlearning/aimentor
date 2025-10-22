// IMPORTANT: set LESSON_AGENT_URL to your Cloudflare Worker endpoint that serves lesson data.
// Example:
// export const LESSON_AGENT_URL = "https://my-worker.example.com/lesson";

// The app will fail to load lessons if this is empty or missing.
export const LESSON_AGENT_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/lesson";

// IMPORTANT: This file must export a valid WORKER_AGENT_URL string.
// Do NOT leave the value empty in production. The app will refuse to start a session
// if the value is missing or empty to avoid contacting an unintended default.
// Example:
// export const WORKER_AGENT_URL = "https://my-worker.example.com/agent";

export const WORKER_AGENT_URL = "https://bitecode-aimentor-worker.cserenyecztibor.workers.dev/agent"; 

