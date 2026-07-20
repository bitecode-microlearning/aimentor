const argumentsList = process.argv.slice(2);
const readArgument = (name) => { const index = argumentsList.indexOf(name); return index >= 0 ? argumentsList[index + 1] : undefined; };
const baseUrl = (readArgument("--url") || process.env.DEMO_ADMIN_URL || "https://bitecode-ai-mentor-demo.cserenyecztibor.workers.dev").replace(/\/$/u, "");
const token = process.env.DEMO_ADMIN_CLI_TOKEN;
if (!token) { console.error("Set DEMO_ADMIN_CLI_TOKEN in this terminal before running the command."); process.exit(1); }
const response = await fetch(`${baseUrl}/internal/admin-links`, { method: "POST", headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }, body: "{}" });
const result = await response.json().catch(() => null);
if (!response.ok || !result?.adminUrl) { console.error(result?.error || `Admin-link request failed with HTTP ${response.status}.`); process.exit(1); }
console.log(result.adminUrl);
