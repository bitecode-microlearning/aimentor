const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const AUDIENCE = "ai-mentor-demo";
export const PARTICIPANT_ACTION = "open-demo-session";
export const RESULT_ACTION = "view-demo-result";
export const PARTICIPANT_ROUTE = "/session";
export const RESULT_ROUTE = "/result";

export function canonicalPayload({ version = "v1", sessionId, expires, nonce, action, route }) {
  return [version, sessionId, String(expires), nonce, AUDIENCE, action, route].join("\n");
}

export function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function decodeBase64url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value || "")) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret, payload) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function signClaims(claims, secret) {
  return base64url(await hmac(secret, canonicalPayload(claims)));
}

export function constantTimeEqual(expected, provided) {
  if (!(expected instanceof Uint8Array) || !(provided instanceof Uint8Array)) return false;
  if (expected.length !== provided.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ provided[index];
  return difference === 0;
}

export async function verifyClaims(claims, providedSignature, secrets) {
  const provided = decodeBase64url(providedSignature);
  if (!provided || provided.length !== 32) return false;
  for (const secret of secrets.filter(Boolean)) {
    const expected = await hmac(secret, canonicalPayload(claims));
    if (constantTimeEqual(expected, provided)) return true;
  }
  return false;
}

export function randomToken(byteLength = 16) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export async function sha256(value) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export function parseCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function safeJson(value) {
  try { return JSON.parse(value); } catch { return null; }
}

export function utf8(value) { return decoder.decode(value); }
