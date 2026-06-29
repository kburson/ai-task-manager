// @story #659
// AC3 — `chore-mode on` records a durable audit marker (reason + timestamp),
// and the chore-mode source-edit bypass does not extend to installed
// guard/`node_modules` paths (the AC2 interlock runs first), so a guard-path
// write stays refused even while chore-mode is active.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { projectScratchDir } from '../../lib/scratch-dir.mjs';
import {
  writeChoreMode,
  readChoreMode,
  isChoreModeActive,
  appendChoreModeAudit,
  readChoreModeLog,
} from '../../lib/chore-mode.mjs';
import { isInstalledGuardPath } from '../../lib/installed-guard-path.mjs';

function withTempProject(fn) {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-chore-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('chore-mode activation records a durable audit marker', () => {
  withTempProject((dir) => {
    const ts = '2026-06-29T21:00:00.000Z';
    appendChoreModeAudit(dir, { reason: 'land guard fix', ts, previousIssue: '#659' });

    const log = readChoreModeLog(dir);
    assert.equal(log.length, 1);
    assert.equal(log[0].reason, 'land guard fix');
    assert.equal(log[0].ts, ts);
    assert.equal(log[0].previousIssue, '#659');
    assert.equal(log[0].event, 'on');
  });
});

test('audit log is append-only and survives chore-mode off', () => {
  withTempProject((dir) => {
    appendChoreModeAudit(dir, { reason: 'first', ts: '2026-06-29T21:00:00.000Z' });
    writeChoreMode(dir, { active: true, since: '2026-06-29T21:00:00.000Z', reason: 'first' });
    appendChoreModeAudit(dir, { reason: 'second', ts: '2026-06-29T22:00:00.000Z' });

    // `off` wipes the live record but must NOT touch the audit log.
    writeChoreMode(dir, { active: false, since: null, reason: null, previousIssue: '#659' });

    assert.equal(isChoreModeActive(dir), false);
    assert.equal(readChoreMode(dir).reason, null);

    const log = readChoreModeLog(dir);
    assert.equal(log.length, 2);
    assert.deepEqual(
      log.map((e) => e.reason),
      ['first', 'second']
    );
  });
});

test('chore-mode bypass does not cover installed guard paths', () => {
  withTempProject((dir) => {
    // Activate chore-mode (the blanket source-edit bypass).
    writeChoreMode(dir, { active: true, since: '2026-06-29T21:00:00.000Z', reason: 'x' });
    assert.equal(isChoreModeActive(dir), true);

    // While active, an installed-guard path is STILL classified as off-limits.
    // The AC2 interlock keys solely on the path and runs ahead of the
    // chore-mode bypass in activity-guard.mjs, so the active bypass cannot
    // re-open guard self-editing.
    assert.equal(
      isInstalledGuardPath('node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs'),
      true
    );
    // A non-guard source path is editable under chore-mode (the bypass's job).
    assert.equal(isInstalledGuardPath('scripts/task-tracker/bash-guard.mjs'), false);
    assert.equal(isInstalledGuardPath('src/foo.mjs'), false);
  });
});
