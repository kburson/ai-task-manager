// @story #2006
import assert from 'node:assert/strict';
import test from 'node:test';
import { hookFixture } from './decomposition-hook.cases.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { readyEpic } from './decomposition-remote.cases.mjs';
import {
  activityVerdict,
  buildPayload,
  patchPayload,
  completeEpicSnapshot,
} from './decomposition-review-fixes.fixtures.mjs';
import { runHook } from '../../../../task-tracker/source-edit-gate.mjs';
import { publication } from '../../../unit/task-tracker/lib/decomposition-authority-fixtures.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';

export function registerReviewEffectCases() {
  // Removing fresh RUN_BUILD admission must make each restricted command fail.
  for (const authority of ['mandatory', 'pending', 'unavailable']) {
    for (const command of ['npm run build', 'tsc', 'cargo build', 'go build']) {
      test(
        'actual build hook fences ' + command + ' under ' + authority + ' authority',
        async () => {
          const f = await hookFixture(25);
          try {
            if (authority === 'pending') {
              const current = await f.runtime.collect(f.subject);
              f.authority.body = replaceDecompositionRecords(f.authority.body, {
                assessment: current.assessment,
                publication: publication(current.inputDigest, { subject: f.subject }),
              });
            }
            const verdict = activityVerdict(f, buildPayload(f, command), {
              unavailable: authority === 'unavailable',
            });
            assert.equal(verdict.decision, 'block', JSON.stringify(verdict));
            assert.equal(
              verdict.code,
              authority === 'pending'
                ? 'decomposition-assessment-pending'
                : authority === 'unavailable'
                  ? 'decomposition-authority-unavailable'
                  : 'decomposition-required'
            );
          } finally {
            f.native.close();
          }
        }
      );
    }
  }
  // Missing bounded preparation obstructs recovery; broad docs permission breaks controls.
  for (const target of [
    'docs/superpowers/plans/2026-10-12-107-recovery.md',
    'docs/superpowers/specs/2026-10-12-107-recovery.md',
  ]) {
    for (const tool of ['Edit', 'Write', 'apply_patch']) {
      test('actual hooks admit only bound preparation: ' + tool + ' ' + target, async () => {
        const f = await hookFixture(25);
        try {
          const payload =
            tool === 'apply_patch' ? patchPayload(f, [target]) : f.payload(target, tool);
          assert.equal((await runHook(payload, f.deps)).decision, 'allow');
          assert.equal(activityVerdict(f, payload).decision, 'allow');
          for (const invalid of [
            'docs/superpowers/plans/2026-10-12-108-recovery.md',
            'docs/result.md',
            'src/product.mjs',
          ]) {
            const control =
              tool === 'apply_patch' ? patchPayload(f, [invalid]) : f.payload(invalid, tool);
            assert.equal((await runHook(control, f.deps)).decision, 'block', invalid);
            assert.equal(activityVerdict(f, control).decision, 'block', invalid);
          }
          const mixed = patchPayload(f, [target, 'src/product.mjs']);
          assert.equal((await runHook(mixed, f.deps)).decision, 'block');
          assert.equal(activityVerdict(f, mixed).decision, 'block');
        } finally {
          f.native.close();
        }
      });
    }
  }
  test('actual preparation refuses a mismatched recorded branch binding', async () => {
    const f = await hookFixture(25);
    try {
      setActiveTask(
        f.native.sid,
        { ...f.native.active(), worktreeBranch: 'unowned-other-branch' },
        f.native.root
      );
      const payload = f.payload('docs/superpowers/plans/2026-10-12-107-recovery.md');
      assert.equal((await runHook(payload, f.deps)).decision, 'block');
      assert.equal(activityVerdict(f, payload).decision, 'block');
    } finally {
      f.native.close();
    }
  });
  // WRITE_CODE for all native edits wrongly rejects a completed epic's document deliverable.
  test('actual completed epic hooks admit its document deliverable but fence product implementation', async () => {
    const f = await readyEpic(true);
    try {
      await completeEpicSnapshot(f);
      const document = f.payload('docs/delivered-report.md');
      const source = f.payload('src/product.mjs');
      const deps = { ...f.deps, graphql: async () => f.response };
      delete deps.decomposition;
      var documentVerdict = await runHook(document, deps);
      assert.equal(documentVerdict.decision, 'allow', JSON.stringify(documentVerdict));
      assert.equal(activityVerdict(f, document, { snapshot: f.response }).decision, 'allow');
      assert.equal((await runHook(source, deps)).decision, 'block');
      assert.equal(activityVerdict(f, source, { snapshot: f.response }).decision, 'block');
    } finally {
      f.native.close();
    }
  });
  test('actual restricted build hook preserves separately classified read-only verification', async () => {
    const f = await hookFixture(25);
    try {
      assert.equal(
        activityVerdict(f, buildPayload(f, 'node --test scripts/tests/unit/example.test.mjs'))
          .decision,
        'allow'
      );
    } finally {
      f.native.close();
    }
  });
}
