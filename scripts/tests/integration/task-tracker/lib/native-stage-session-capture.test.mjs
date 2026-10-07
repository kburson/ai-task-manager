// @story #1855
// Actual default filesystem/path source capture runs in an isolated native host.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createSandbox } from '../../../helpers/evidence-v2/sandbox.mjs';

test('native default session capture distinguishes absence, bytes and corruption without injected authority', () => {
  const s = createSandbox();
  try {
    const moduleUrl = new URL('../../../../task-tracker/lib/session-store.mjs', import.meta.url).href;
    const script = `
      import assert from 'node:assert/strict';
      import * as fs from 'node:fs';
      import path from 'node:path';
      const policy = await import(${JSON.stringify(moduleUrl)});
      const sid = 'capture-fixture', file = policy.sessionFilePath(sid);
      assert.ok(file.startsWith(process.env.AI_TASK_MANAGER_PROJECT_DIR + path.sep));
      const absent = policy.loadSession(sid);
      assert.deepEqual(policy.readSessionPolicySourceData(absent), { sessionId: sid, path: file, exists: false, bytes: null, error: null });
      assert.equal(policy.readSessionPolicySourceData({ ...absent }), null);
      const bytes = JSON.stringify({ gates: { pullRequestReview: false }, sessionId: 'old-value', custom: 'retained' });
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
      const current = policy.loadSession(sid), data = policy.readSessionPolicySourceData(current);
      assert.deepEqual(data, { sessionId: sid, path: file, exists: true, bytes, error: null });
      assert.ok(Object.isFrozen(data));
      assert.equal(current.sessionId, sid); assert.equal(current.custom, 'retained');
      assert.equal(current.gates.pullRequestReview, false);
      assert.deepEqual(policy.deriveRecordedSessionPolicy({ sessionId: sid, bytes }), current);
      assert.equal(policy.readSessionPolicySourceData(policy.loadSession(sid, { dir: path.dirname(file) })), null);
      assert.equal(policy.readSessionPolicySourceData(policy.loadSession(sid, { fs })), null);
      fs.writeFileSync(file, '{corrupt');
      const corrupt = policy.loadSession(sid), failed = policy.readSessionPolicySourceData(corrupt);
      assert.equal(corrupt.gates.pullRequestReview, null);
      assert.equal(failed.bytes, '{corrupt'); assert.equal(failed.exists, true);
      assert.equal(typeof failed.error.message, 'string'); assert.ok(Object.isFrozen(failed.error));
      assert.throws(() => policy.deriveRecordedSessionPolicy({ sessionId: sid, bytes: failed.bytes }), /recorded-session-policy/);
      assert.equal(policy.readSessionPolicySourceData(policy.loadSession('')), null);
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script],
      { cwd: s.context.sourceRoot, env: s.env, encoding: 'utf8' });
    assert.equal(output, '');
  } finally { s.dispose(); }
});
