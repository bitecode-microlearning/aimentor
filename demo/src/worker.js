import { PARTICIPANT_ACTION, RESULT_ACTION, parseCookie, randomToken, safeJson, sha256, signClaims, verifyClaims } from "./security.js";
import { DEFAULT_SCENARIO } from "./defaultScenario.js";
import { errorPage, lockedPage, resultPage, setupPage } from "./ui.js";

const ADMIN_ACTION = "open-demo-admin";
const ADMIN_ROUTE = "/admin/setup";
const LAUNCH_ACTION = "open-demo-mentor-session";
const LAUNCH_ROUTE = "/mentor";
const SECURITY_HEADERS = { "Cache-Control": "no-store", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
const text = (body, status = 200, headers = {}) => new Response(body, { status, headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8", ...headers } });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { ...SECURITY_HEADERS, "Content-Type": "application/json", ...headers } });
const setting = (env, key, fallback) => { const value = Number(env[key]); return Number.isSafeInteger(value) && value > 0 ? value : fallback; };
const signingSecret = (env) => env.DEMO_URL_SIGNING_SECRET_CURRENT || env.DEMO_URL_SIGNING_SECRET;
const baseUrl = (request, env) => String(env.DEMO_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/u, "");
const sessionKey = (id) => `scenario:${id}`;
const browserKey = (hash) => `admin-browser:${hash}`;
const encoder = new TextEncoder();

function constantTimeTextEqual(left, right) {
  const a = encoder.encode(String(left || "")), b = encoder.encode(String(right || ""));
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function bounded(value, max) { return String(value ?? "").trim().slice(0, max); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function parseJsonText(value, fallback = []) { try { const parsed = JSON.parse(String(value || "")); return parsed; } catch { return fallback; } }
function validateScenario(value) {
  if (!value?.adminConsent) return { error: "Administrator consent is required." };
  const scenario = {
    userfirstname: bounded(value.userfirstname, 100), coursename: bounded(value.coursename, 200), lessonname: bounded(value.lessonname, 200),
    knowledgelevel: bounded(value.knowledgelevel, 80) || "Beginner", knowledgedomain: bounded(value.knowledgedomain, 1000), userpreferences: bounded(value.userpreferences, 1500),
    lessongoal: bounded(value.lessongoal, 2000), content: bounded(value.content, 12000), contentdescription: bounded(value.content, 4000),
    learningmemory: JSON.stringify(parseJsonText(value.learningmemory)), knowledgestrengths: JSON.stringify(parseJsonText(value.knowledgestrengths)),
    knowledgegaps: JSON.stringify(parseJsonText(value.knowledgegaps)), practicerecommendations: JSON.stringify(parseJsonText(value.practicerecommendations)),
    coursegoal: bounded(value.lessongoal, 2000), courseprogress: "{}"
  };
  const testerName = bounded(value.testerName, 100);
  if (!testerName || !scenario.userfirstname || !scenario.coursename || !scenario.lessonname || !scenario.lessongoal || !scenario.content) return { error: "Complete all required tester and learning-scenario fields." };
  return { scenario, testerName, scenarioNotes: bounded(value.scenarioNotes, 2000) };
}

async function putSession(env, session) {
  const ttl = Math.max(60, Math.ceil((Date.parse(session.expiresAt) - Date.now()) / 1000) + 86400);
  await env.DEMO_SESSIONS.put(sessionKey(session.id), JSON.stringify(session), { expirationTtl: ttl });
}
async function getSession(env, id) { return safeJson(await env.DEMO_SESSIONS.get(sessionKey(id))); }

async function makeSignedUrl(request, env, claims, ttl) {
  const expires = Math.floor(Date.now() / 1000) + ttl;
  const complete = { version: "v1", expires, ...claims };
  const signature = await signClaims(complete, signingSecret(env));
  const params = new URLSearchParams({ v: "v1", expires: String(expires), nonce: complete.nonce, action: complete.action, signature });
  return `${baseUrl(request, env)}${complete.route}/${complete.sessionId}?${params}`;
}

async function createAdminLink(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!env.DEMO_ADMIN_CLI_TOKEN || !constantTimeTextEqual(authorization, `Bearer ${env.DEMO_ADMIN_CLI_TOKEN}`)) return json({ error: "Not found" }, 404);
  const id = crypto.randomUUID(), nonce = randomToken(), ttl = Math.min(setting(env, "DEMO_ADMIN_URL_TTL_SECONDS", 900), 3600);
  await env.DEMO_SESSIONS.put(`admin-link:${id}`, JSON.stringify({ nonce, usedAt: null }), { expirationTtl: ttl + 60 });
  const adminUrl = await makeSignedUrl(request, env, { sessionId: id, nonce, action: ADMIN_ACTION, route: ADMIN_ROUTE }, ttl);
  return json({ adminUrl, expiresInSeconds: ttl });
}

async function validateUrl(request, env, expected) {
  const url = new URL(request.url), id = url.pathname.split("/").filter(Boolean).at(-1) || "";
  const version = url.searchParams.get("v"), expires = Number(url.searchParams.get("expires")), nonce = url.searchParams.get("nonce") || "", action = url.searchParams.get("action"), signature = url.searchParams.get("signature") || "";
  if (version !== "v1" || !Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) - 30 || action !== expected.action) return null;
  const claims = { version, sessionId: id, expires, nonce, action: expected.action, route: expected.route };
  return await verifyClaims(claims, signature, [signingSecret(env), env.DEMO_URL_SIGNING_SECRET_PREVIOUS]) ? { id, nonce, expires } : null;
}

async function activateAdmin(request, env) {
  const validation = await validateUrl(request, env, { action: ADMIN_ACTION, route: ADMIN_ROUTE });
  const record = validation && safeJson(await env.DEMO_SESSIONS.get(`admin-link:${validation.id}`));
  if (!validation || !record || record.nonce !== validation.nonce || record.usedAt) return text(errorPage("This administration link is invalid, expired, or already used."), 401);
  record.usedAt = new Date().toISOString(); await env.DEMO_SESSIONS.put(`admin-link:${validation.id}`, JSON.stringify(record), { expirationTtl: 3600 });
  const token = randomToken(32), hash = await sha256(token), ttl = 3600;
  await env.DEMO_SESSIONS.put(browserKey(hash), JSON.stringify({ authorized: true }), { expirationTtl: ttl });
  return new Response(null, { status: 303, headers: { ...SECURITY_HEADERS, Location: ADMIN_ROUTE, "Set-Cookie": `demo_admin=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${ttl}` } });
}

async function adminSession(request, env) {
  const token = parseCookie(request, "demo_admin");
  return token ? safeJson(await env.DEMO_SESSIONS.get(browserKey(await sha256(token)))) : null;
}

async function gzipBase64(value) {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary);
}
async function signEncoded(encoded, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(encoded)))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function createScenario(request, env) {
  const admin = await adminSession(request, env); if (!admin) return json({ error: "Administration session expired." }, 401);
  const validated = validateScenario(await request.json().catch(() => null)); if (validated.error) return json({ error: validated.error }, 400);
  const id = `demo_${crypto.randomUUID()}`, now = Date.now(), ttl = setting(env, "DEMO_SESSION_TTL_SECONDS", 7776000), expiresAt = new Date(now + ttl * 1000).toISOString();
  const launchNonce = randomToken(), resultNonce = randomToken();
  const session = { id, ...validated, launchNonce, resultNonce, status: "ready", createdAt: new Date(now).toISOString(), expiresAt, activatedAt: null, testerConsentAcceptedAt: null, completedAt: null, result: null, notification: null };
  await putSession(env, session);
  const launchPayload = { version: 1, sessionmode: "demo", demosessionid: id, scenarioversion: 1, nonce: launchNonce, audience: "bitecode-ai-mentor", action: LAUNCH_ACTION, timestamp: Math.floor(now / 1000), expiresAt, ...session.scenario };
  const encoded = await gzipBase64(launchPayload), signature = await signEncoded(encoded, signingSecret(env));
  const appUrl = String(env.AI_MENTOR_APP_URL || "https://aimentor-app.pages.dev").replace(/\/$/u, "");
  const testerUrl = `${appUrl}/?data=${encodeURIComponent(encoded)}&sig=${signature}`;
  const resultUrl = await makeSignedUrl(request, env, { sessionId: id, nonce: resultNonce, action: RESULT_ACTION, route: "/result" }, setting(env, "DEMO_ADMIN_RESULT_URL_TTL_SECONDS", 86400));
  return json({ id, testerUrl, resultUrl, expiresAt }, 201);
}

async function verifyLaunch(request, env) {
  const body = await request.json().catch(() => null), encoded = body?.data, signature = body?.sig;
  if (!encoded || !signature || !constantTimeTextEqual(await signEncoded(encoded, signingSecret(env)), signature)) return json({ error: "invalid_demo_launch" }, 401);
  let payload; try { const binary = atob(encoded), bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0)); payload = JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()); } catch { return json({ error: "invalid_demo_launch" }, 400); }
  const session = await getSession(env, payload.demosessionid);
  if (!session || session.status === "revoked" || Date.parse(session.expiresAt) <= Date.now() || session.launchNonce !== payload.nonce || payload.sessionmode !== "demo" || payload.action !== LAUNCH_ACTION) return json({ error: "demo_session_unavailable" }, 410);
  return json({ valid: true, lessonData: payload });
}

async function recordConsent(request, env) {
  const verified = await verifyLaunch(request, env); if (!verified.ok) return verified;
  const result = await verified.clone().json(), session = await getSession(env, result.lessonData.demosessionid);
  session.testerConsentAcceptedAt ||= new Date().toISOString(); session.activatedAt ||= session.testerConsentAcceptedAt; session.status = "activated"; await putSession(env, session);
  return json({ success: true });
}

async function completeDemo(request, env) {
  if (!env.DEMO_COMPLETION_TOKEN || !constantTimeTextEqual(request.headers.get("Authorization"), `Bearer ${env.DEMO_COMPLETION_TOKEN}`)) return json({ error: "Not found" }, 404);
  const body = await request.json().catch(() => null), id = bounded(body?.demoSessionId, 80), session = await getSession(env, id);
  if (!session) return json({ error: "Not found" }, 404);
  const conversationId = bounded(body?.providerConversationId, 200); if (session.result?.providerConversationId === conversationId) return json({ status: "duplicate" });
  session.result = { providerConversationId: conversationId, providerStatus: bounded(body?.providerStatus, 100), terminationReason: bounded(body?.terminationReason, 200), durationSeconds: Number(body?.durationSeconds) || null, providerSummary: bounded(body?.providerSummary, 10000), sentiment: body?.sentiment ?? null, transcript: Array.isArray(body?.transcript) ? body.transcript.slice(0, 500) : [], receivedAt: new Date().toISOString() };
  session.status = "completed"; session.completedAt = new Date().toISOString();
  try {
    if (env.EMAIL && env.DEMO_ADMIN_NOTIFICATION_EMAIL) { const summary = JSON.stringify({ testerName: session.testerName, scenario: session.scenario, scenarioNotes: session.scenarioNotes, result: session.result }, null, 2); await env.EMAIL.send({ to: env.DEMO_ADMIN_NOTIFICATION_EMAIL, from: { email: env.DEMO_EMAIL_FROM || "bitecode@bitecode.co", name: "BiteCode AI Mentor" }, subject: `AI Mentor demo completed: ${session.scenario.lessonname} — ${session.testerName}`, text: summary, html: `<h2>AI Mentor demo completed</h2><p><strong>Tester:</strong> ${escapeHtml(session.testerName)}</p><p><strong>Lesson:</strong> ${escapeHtml(session.scenario.lessonname)}</p><pre>${escapeHtml(summary)}</pre>` }); session.notification = { status: "sent", sentAt: new Date().toISOString() }; }
    else session.notification = { status: "pending_configuration" };
  } catch { session.notification = { status: "failed", failedAt: new Date().toISOString() }; }
  await putSession(env, session); return json({ status: "accepted" });
}

async function viewResult(request, env) {
  const validation = await validateUrl(request, env, { action: RESULT_ACTION, route: "/result" }); const session = validation && await getSession(env, validation.id);
  if (!validation || !session || session.resultNonce !== validation.nonce) return text(errorPage("This result link is invalid or expired."), 401);
  return text(resultPage(session));
}

export default { async fetch(request, env) {
  const url = new URL(request.url), path = url.pathname;
  if (request.method === "POST" && path === "/internal/admin-links") return createAdminLink(request, env);
  if (request.method === "POST" && path === "/internal/verify-launch") return verifyLaunch(request, env);
  if (request.method === "POST" && path === "/internal/completed") return completeDemo(request, env);
  if (request.method === "POST" && path === "/api/tester-consent") return recordConsent(request, env);
  if (request.method === "POST" && path === "/api/scenarios") return createScenario(request, env);
  if (request.method === "GET" && path === "/") return text(lockedPage(), 401);
  if (request.method === "GET" && path.startsWith(`${ADMIN_ROUTE}/`)) return activateAdmin(request, env);
  if (request.method === "GET" && path === ADMIN_ROUTE) { const admin = await adminSession(request, env); return admin ? text(setupPage(DEFAULT_SCENARIO)) : text(lockedPage(), 401); }
  if (request.method === "GET" && path.startsWith("/result/") && url.search) return viewResult(request, env);
  return json({ error: "Not found" }, 404);
} };
