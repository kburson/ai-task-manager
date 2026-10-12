// @story #1988 — native subprocess refusal, owner restoration and durable interruption.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshUnitDir } from './decomposition-authority-fixtures.mjs';
import {
  withIssueLock,
  currentIssueLockOwner,
  ISSUE_LOCK_HELD_ENV,
} from '../../../../task-tracker/issue-mutator-lock.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  initialProcessProviderState,
  processPublicationHarness,
} from '../../../fixtures/publication-subprocess.fixture.mjs';
const script = fileURLToPath(
  new URL('../../../fixtures/publication-subprocess.fixture.mjs', import.meta.url)
);
export function registerPublicationSubprocessCases() {
  for (const mode of ['inflation', 'event', 'migrate', 'bind', 'tether', 'compat', 'initial'])
    test(`real ${mode} subprocess inherited token has zero effects and returns to the original owner`, async () => {
      const dir = freshUnitDir('publication-process-'),
        file = path.join(dir, 'provider.json');
      writeFileSync(file, JSON.stringify(initialProcessProviderState(mode)));
      const h = processPublicationHarness({ file, dir, mode }),
        prior = process.env[ISSUE_LOCK_HELD_ENV];
      try {
        await withIssueLock({ issue: 1987, verb: 'subprocess-proof', projDir: dir }, async () => {
          const owner = currentIssueLockOwner(1987);
          const child = spawnSync(process.execPath, [script, file, dir, mode], {
            cwd: dir,
            env: { ...process.env },
            encoding: 'utf8',
            timeout: 5000,
          });
          assert.equal(child.status, 0, child.stderr ?? String(child.error));
          const result = JSON.parse(child.stdout);
          assert.equal(result.calls, 0);
          assert.match(result.result.reason ?? '', /lock-owner|in-process-owner|owner-context/);
          assert.equal(currentIssueLockOwner(1987), owner);
          assert.equal(process.env[ISSUE_LOCK_HELD_ENV], '1987');
          const resumed = await h.run();
          assert.ok(
            ['recorded', 'updated', 'appended', 'upserted', 'replaced'].includes(resumed.status) ||
              resumed.itemId,
            resumed.reason ?? JSON.stringify(resumed)
          );
          assert.equal(currentIssueLockOwner(1987), owner);
          assert.ok(h.load().calls.length > 0);
          assert.ok(h.load().calls.every((call) => call.owned));
        });
        assert.equal(process.env[ISSUE_LOCK_HELD_ENV], prior);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  test('real process interruption after durable intent leaves old fields fenced and exact original-writer retry recovers', async () => {
    const dir = freshUnitDir('publication-interruption-'),
      file = path.join(dir, 'provider.json');
    writeFileSync(file, JSON.stringify(initialProcessProviderState('inflation')));
    const h = processPublicationHarness({ file, dir, mode: 'inflation' });
    try {
      const child = spawnSync(process.execPath, [script, file, dir, 'kill-intent'], {
        cwd: dir,
        env: { ...process.env },
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.equal(child.status, 77, child.stderr);
      const before = h.load();
      assert.equal(before.board.estimate, 10);
      assert.equal(readDecompositionRecords(before.body).publication.status, 'pending');
      assert.equal(
        readDecompositionRecords(before.body).assessment.capabilities.includes(
          'scoped-implementation'
        ),
        false
      );
      assert.equal(before.calls.filter((c) => c.name !== 'projection').length, 0);
      const result = await h.run();
      assert.equal(result.status, 'recorded', result.reason);
      assert.equal(h.load().board.estimate, 25);
      assert.equal(readDecompositionRecords(h.load().body).publication.status, 'complete');
      assert.equal(h.load().comment.body.match(/Publication operation:/g).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
