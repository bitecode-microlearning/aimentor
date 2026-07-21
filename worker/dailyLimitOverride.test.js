import test from "node:test";
import assert from "node:assert/strict";
import { shouldBlockAiMentorDailyUsage } from "./worker.js";

const today = new Date("2026-07-22T12:00:00.000Z");

test("ordinary users remain limited after using AI Mentor today", () => {
  assert.equal(shouldBlockAiMentorDailyUsage({
    limitEnabled: true,
    dailyLimitOverride: 0,
    lastUsage: "2026-07-22",
    now: today,
  }), true);
});

test("the per-user override bypasses the AI Mentor daily limit", () => {
  assert.equal(shouldBlockAiMentorDailyUsage({
    limitEnabled: true,
    dailyLimitOverride: 1,
    lastUsage: "2026-07-22",
    now: today,
  }), false);
});

test("ordinary users can start on a later day", () => {
  assert.equal(shouldBlockAiMentorDailyUsage({
    limitEnabled: true,
    dailyLimitOverride: 0,
    lastUsage: "2026-07-21",
    now: today,
  }), false);
});
