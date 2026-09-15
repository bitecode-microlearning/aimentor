import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHmac } from 'node:crypto';
import worker from './worker.js';

function request(path, changes = {}, validSignature = true) {
  const payload = { userid: 1, subscriptionid: 2, courseid: 3, lessonid: 4,
    timestamp: Math.floor(Date.now() / 1000), sessionmode: 'course_test', testrunid: 'test-1', ...changes };
  const data = gzipSync(JSON.stringify(payload)).toString('base64');
  const sig = validSignature ? createHmac('sha256', 'secret').update(data).digest('hex') : 'bad';
  return new Request(`https://mentor.test${path}`, { method: 'POST', headers: { Origin: 'https://aimentor-app.pages.dev', 'Content-Type': 'application/json' }, body: JSON.stringify({ data, sig }) });
}
function env(tester) {
  return { HMAC_SECRET: 'secret', DB: { prepare(sql) {
    assert.match(sql, /u\.is_test = 1/);
    return { bind() { return { first: async () => tester }; } };
  } } };
}
test('test evaluations, outcomes and usage cannot write learner state', async () => {
  for (const path of ['/usage', '/evaluation', '/coaching-outcome']) {
    const response = await worker.fetch(request(path), env({ id: 1 }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, courseTest: true, persisted: false });
  }
});
test('ordinary accounts cannot opt into course testing', async () => {
  assert.equal((await worker.fetch(request('/usage'), env(null))).status, 403);
});
test('a query marker cannot bypass signature verification', async () => {
  assert.equal((await worker.fetch(request('/usage', {}, false), env({ id: 1 }))).status, 403);
});
