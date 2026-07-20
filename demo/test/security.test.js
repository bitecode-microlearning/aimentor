import test from "node:test";
import assert from "node:assert/strict";
import { canonicalPayload, constantTimeEqual, decodeBase64url, signClaims, verifyClaims } from "../src/security.js";

const claims = { version: "v1", sessionId: "5518b582-9ca0-4a86-ae22-09260bb1cb0d", expires: 2_000_000_000, nonce: "secure_nonce", action: "open-demo-session", route: "/session" };
const secret = "test-only-current-secret";

test("canonical payload binds every required claim", () => assert.equal(canonicalPayload(claims), "v1\n5518b582-9ca0-4a86-ae22-09260bb1cb0d\n2000000000\nsecure_nonce\nai-mentor-demo\nopen-demo-session\n/session"));
test("valid signature verifies", async () => assert.equal(await verifyClaims(claims, await signClaims(claims, secret), [secret]), true));
for (const field of ["sessionId", "expires", "nonce", "action", "route"]) test(`modified ${field} is rejected`, async () => { const signature = await signClaims(claims, secret); assert.equal(await verifyClaims({ ...claims, [field]: `${claims[field]}x` }, signature, [secret]), false); });
test("signature cannot be reused for another session", async () => assert.equal(await verifyClaims({ ...claims, sessionId: crypto.randomUUID() }, await signClaims(claims, secret), [secret]), false));
test("previous key is accepted during rotation", async () => assert.equal(await verifyClaims(claims, await signClaims(claims, "previous"), [secret, "previous"]), true));
test("invalid base64url and wrong length are rejected", async () => { assert.equal(decodeBase64url("***"), null); assert.equal(await verifyClaims(claims, "YWJj", [secret]), false); });
test("constant-time comparison handles equal, unequal, and wrong lengths", () => { assert.equal(constantTimeEqual(Uint8Array.of(1,2), Uint8Array.of(1,2)), true); assert.equal(constantTimeEqual(Uint8Array.of(1,2), Uint8Array.of(1,3)), false); assert.equal(constantTimeEqual(Uint8Array.of(1), Uint8Array.of(1,2)), false); });
