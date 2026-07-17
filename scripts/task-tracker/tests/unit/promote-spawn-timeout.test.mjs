// @story #533
// #533 — the develop→test alias delegate must not inherit a 60s
// (`GH_API_TIMEOUT_MS * 4`) outer cap, which SIGTERMs the Test sandbox before
// `npm ci` + the Verification Commands can run. These are pure assertions
// against the timeout-selection surface — no process is spawned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnVerbTimeout, MOVE_STATE_DELEGATE_TIMEOUT_MS } from '../../verbs/promote.mjs';
// #858 — this used to carry a local `900_000` mirror of `SANDBOX_TIMEOUT_MS`
// because the real constant was private to `verbs/test.mjs`. It now lives in
// process-timeouts.mjs, so import it: a hand-copied cap goes stale the moment
// the real one moves, which is the drift that produced #858 in the first place.
import { GH_API_TIMEOUT_MS, SANDBOX_TIMEOUT_MS } from '../../lib/process-timeouts.mjs';

const OLD_CAP = GH_API_TIMEOUT_MS * 4; // 60s — the broken value.

test('AC1: test delegate gets no outer timeout (or >= SANDBOX_TIMEOUT_MS), never the GH-API cap', () => {
  const t = spawnVerbTimeout('test');
  // "no outer timeout" branch OR "sized for a full sandbox run" branch.
  assert.ok(
    t === undefined || (typeof t === 'number' && t >= SANDBOX_TIMEOUT_MS),
    `test delegate timeout must be undefined or >= ${SANDBOX_TIMEOUT_MS}, got ${t}`
  );
  // No longer reuses the single-API GH budget.
  assert.notEqual(t, OLD_CAP);
});

test('AC2: a sandbox run exceeding 60s is not SIGTERMd at the outer layer', () => {
  const t = spawnVerbTimeout('test');
  // Cap-removal proxy: either no cap, or a cap comfortably past 60s, so the
  // inner per-command SANDBOX_TIMEOUT_MS can let the run finish and post its
  // results comment.
  assert.ok(
    t === undefined || (typeof t === 'number' && t > 60_000),
    `60s sandbox must survive the outer layer, got timeout ${t}`
  );
});

test('AC3: the move-state delegate timeout is unchanged (GH_API_TIMEOUT_MS * 2)', () => {
  assert.equal(MOVE_STATE_DELEGATE_TIMEOUT_MS, GH_API_TIMEOUT_MS * 2);
});

test('quick delegates (close) keep the short budget', () => {
  assert.equal(spawnVerbTimeout('close'), GH_API_TIMEOUT_MS * 4);
});
