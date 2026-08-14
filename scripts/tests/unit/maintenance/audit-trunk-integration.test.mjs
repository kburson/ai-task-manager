// @story #564
// #564 — regression test: unvalidated SHAs from issue markers must not flow
// into a shell. `isAncestor` must reject any non-hex value (including shell
// metacharacters) before it reaches git, and classify it as `unknown-sha`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { isAncestor, extractShas } from '../../../maintenance/audit-trunk-integration.mjs';
import { projectScratchDir } from '../../../task-tracker/lib/scratch-dir.mjs';

test('extractShas pulls payloads verbatim, without validation', () => {
  // extractShas is intentionally permissive (it does not validate); the guard
  // lives in isAncestor. This documents that a malicious payload survives
  // extraction so the downstream guard is what protects us.
  const body = '<!-- aitm-commits shas="abc1234, evil; rm -rf ~" -->';
  assert.deepEqual(extractShas(body), ['abc1234', 'evil; rm -rf ~']);
});

test('isAncestor classifies a non-hex value as unknown-sha without executing it', () => {
  const sentinel = join(projectScratchDir('test'), `aitm-564-pwned-${process.pid}`);
  rmSync(sentinel, { force: true });

  // A classic command-injection payload. Under the old execSync
  // string-interpolation form this would spawn a shell and `touch` the
  // sentinel. With the argv-form
  // + hex guard it must be rejected before git is invoked.
  const payload = `abc; touch ${sentinel}`;
  const status = isAncestor(payload);

  assert.equal(status, 'unknown-sha', 'malicious payload must be classified unknown-sha');
  assert.equal(
    existsSync(sentinel),
    false,
    'no shell metacharacters may reach a command — sentinel must not exist'
  );
  rmSync(sentinel, { force: true });
});

test('isAncestor rejects shell metacharacters and other non-hex inputs', () => {
  for (const bad of [
    '$(touch x)',
    '`id`',
    'abc | ls',
    'abc && ls',
    'ABCDEF1', // uppercase hex is not a valid lowercase git object name
    'xyz1234', // non-hex letters
    'abc12', // too short (<7)
    '',
  ]) {
    assert.equal(isAncestor(bad), 'unknown-sha', `expected unknown-sha for ${JSON.stringify(bad)}`);
  }
});

test('isAncestor accepts a well-formed hex SHA and runs git against it', () => {
  // A syntactically valid but almost-certainly-absent object: passes the guard,
  // reaches git, and comes back unknown-sha (exit 128 → not exit 1).
  const status = isAncestor('0123456789abcdef0123456789abcdef01234567');
  assert.equal(status, 'unknown-sha');
});
