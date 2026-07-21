import test from "node:test";
import assert from "node:assert/strict";
import { mentorUsageDateKey, shouldBlockAiMentorDailyUsage } from "./worker.js";

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

test("the usage day follows the learner timezone at a UTC day boundary", () => {
  const boundary = new Date("2026-07-21T22:30:00.000Z");
  assert.equal(mentorUsageDateKey(boundary, "Europe/Budapest"), "2026-07-22");
  assert.equal(mentorUsageDateKey(boundary, "UTC"), "2026-07-21");
  assert.equal(shouldBlockAiMentorDailyUsage({
    limitEnabled: true,
    dailyLimitOverride: 0,
    lastUsage: "2026-07-22",
    now: boundary,
    timezone: "Europe/Budapest",
  }), true);
});
