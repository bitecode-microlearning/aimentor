import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

class MemoryKv { values = new Map(); async get(key) { return this.values.get(key) ?? null; } async put(key, value) { this.values.set(key, value); } }
class MemoryEmail { sent = []; async send(message) { this.sent.push(message); return { success: true }; } }
function environment() { return { DEMO_SESSIONS: new MemoryKv(), EMAIL: new MemoryEmail(), DEMO_URL_SIGNING_SECRET_CURRENT: "integration-test-secret", DEMO_ADMIN_CLI_TOKEN: "cli-token", DEMO_COMPLETION_TOKEN: "completion-token", DEMO_ADMIN_NOTIFICATION_EMAIL: "private-admin@bitecode.co", DEMO_EMAIL_FROM: "demo@bitecode.co", AI_MENTOR_APP_URL: "https://mentor.test", DEMO_SESSION_TTL_SECONDS: "7776000", DEMO_ADMIN_RESULT_URL_TTL_SECONDS: "86400" }; }

async function adminCookie(env) {
  const linkResponse = await worker.fetch(new Request("https://demo.test/internal/admin-links", { method: "POST", headers: { authorization: "Bearer cli-token", "content-type": "application/json" }, body: "{}" }), env);
  assert.equal(linkResponse.status, 200); const link = await linkResponse.json();
  const activation = await worker.fetch(new Request(link.adminUrl), env); assert.equal(activation.status, 303); assert.equal(activation.headers.get("location"), "/admin/setup");
  assert.match(activation.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/u); return activation.headers.get("set-cookie").split(";")[0];
}

async function createScenario(env) {
  const cookie = await adminCookie(env);
  const body = { testerName: "Ada", userfirstname: "Ada", knowledgelevel: "Intermediate", coursename: "JavaScript", lessonname: "Promises", lessongoal: "Understand async control flow", content: "Promises represent eventual values.", learningmemory: "[]", knowledgestrengths: "[]", knowledgegaps: "[]", practicerecommendations: "[]", scenarioNotes: "Hackathon path", adminConsent: true };
  const response = await worker.fetch(new Request("https://demo.test/api/scenarios", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) }), env);
  assert.equal(response.status, 201); return response.json();
}

function launchParts(testerUrl) { const url = new URL(testerUrl); return { data: url.searchParams.get("data"), sig: url.searchParams.get("sig") }; }

test("direct scenario administration is blocked", async () => {
  const env = environment(); assert.equal((await worker.fetch(new Request("https://demo.test/"), env)).status, 401);
  assert.equal((await worker.fetch(new Request("https://demo.test/internal/admin-links", { method: "POST", headers: { authorization: "Bearer wrong" } }), env)).status, 404);
});

test("single-use signed admin link establishes a secure clean browser session", async () => {
  const env = environment(), cookie = await adminCookie(env);
  const page = await worker.fetch(new Request("https://demo.test/admin/setup", { headers: { cookie } }), env);
  assert.equal(page.status, 200); const html = await page.text(); assert.match(html, /JavaScript Foundations/u); assert.doesNotMatch(html, /Administrator result email|Tester identifier or email|real AI Mentor/ui);
});

test("scenario produces a real AI Mentor URL with signed demo claims", async () => {
  const env = environment(), created = await createScenario(env); assert.equal(new URL(created.testerUrl).origin, "https://mentor.test");
  const parts = launchParts(created.testerUrl); const verification = await worker.fetch(new Request("https://demo.test/internal/verify-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parts) }), env);
  assert.equal(verification.status, 200); const result = await verification.json(); assert.equal(result.lessonData.sessionmode, "demo"); assert.match(result.lessonData.demosessionid, /^demo_/u); assert.equal(result.lessonData.lessonname, "Promises");
  const tampered = await worker.fetch(new Request("https://demo.test/internal/verify-launch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...parts, sig: `${parts.sig.slice(0, -1)}0` }) }), env); assert.equal(tampered.status, 401);
});

test("tester consent is recorded before activation", async () => {
  const env = environment(), created = await createScenario(env), parts = launchParts(created.testerUrl);
  const response = await worker.fetch(new Request("https://demo.test/api/tester-consent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parts) }), env); assert.equal(response.status, 200);
  const stored = JSON.parse(await env.DEMO_SESSIONS.get(`scenario:${created.id}`)); assert.equal(stored.status, "activated"); assert.ok(stored.testerConsentAcceptedAt);
});

test("post-call completion stores all allowed results and sends one admin email", async () => {
  const env = environment(), created = await createScenario(env), completion = { demoSessionId: created.id, providerConversationId: "conversation-1", providerStatus: "done", terminationReason: "user_ended", durationSeconds: 123, providerSummary: "Ada understood promises.", sentiment: { positive: 0.9 }, transcript: [{ role: "user", message: "I understand." }] };
  const request = () => new Request("https://demo.test/internal/completed", { method: "POST", headers: { authorization: "Bearer completion-token", "content-type": "application/json" }, body: JSON.stringify(completion) });
  assert.equal((await worker.fetch(request(), env)).status, 200); assert.equal(env.EMAIL.sent.length, 1); assert.equal(env.EMAIL.sent[0].to, "private-admin@bitecode.co");
  const duplicate = await worker.fetch(request(), env); assert.equal((await duplicate.json()).status, "duplicate"); assert.equal(env.EMAIL.sent.length, 1);
  const stored = JSON.parse(await env.DEMO_SESSIONS.get(`scenario:${created.id}`)); assert.equal(stored.status, "completed"); assert.equal(stored.result.providerSummary, "Ada understood promises."); assert.equal(stored.notification.status, "sent");
});
