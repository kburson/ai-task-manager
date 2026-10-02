// @story #1859
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { uncheckedPreCloseCheckboxes } from '../../../../task-tracker/close-gate.mjs';
import { verbClose } from '../../../../task-tracker/verbs/close.mjs';

const ISSUE = 1669;
const HEAD = 'a'.repeat(40);
const REPO = 'example/project';

// @story #1859
for (const lane of ['delivered', 'local-trunk']) {
  test(`Close preserves unchecked reasons after ${lane} authority with old attachments removed`, async () => {
    const projectDir = mkdtempProjectIsolated('aitm-close-normalization-');
    const statePath = path.join(projectDir, 'state.json');
    writeFileSync(
      statePath,
      JSON.stringify({ active: '#1669', entryStartTs: new Date().toISOString(), lastWordMarker: 0 })
    );
    // No original checkout or attachment exists in this isolated fixture. Close
    // consumes accepted terminal authority, while completeness remains live.
    const original = `## Scope
- [ ] Step A
<!-- aitm-last-known-state state="review" ts="2026-10-01T00:00:00Z" -->`;
    const effects = [];
    const stderr = [];
    const previousExit = process.exit;
    const previousError = console.error;
    const previousExitCode = process.exitCode;
    process.exit = (code) => {
      const error = new Error(`exit:${code}`);
      error.code = code;
      throw error;
    };
    console.error = (...args) => stderr.push(args.join(' '));
    try {
      await assert.rejects(
        verbClose({
          cfg: { repo: REPO, lifecycleCheckboxesRequired: false },
          projectDir,
          statePath,
          rest: ['#1669'],
          SKIP_NETWORK: false,
          closeBody: original,
          pexec: async (bin, args, options) => {
            if (bin === 'git') {
              assert.equal(options.cwd, projectDir);
              return { stdout: HEAD };
            }
            if (args[0] !== 'issue' || args[1] !== 'view') {
              effects.push(args);
              throw new Error('unexpected remote effect');
            }
            return { stdout: JSON.stringify({ body: original }) };
          },
          drainQueueIfAny: async () => {},
          flushAndForgetQueueFor: async () => ({ delivered: 0, pending: 0 }),
          safePostTiming: async () => effects.push('timing'),
          nowIso: () => new Date().toISOString(),
          loadCurrentSession: () => null,
          loadRawProjectConfig: () => ({ preferences: { gateReviewToDone: true } }),
          getIssueBoardState: async () => 'review',
          getIssueClosedState: async () => false,
          fetchSubIssues: async () => [],
          fetchSubIssueBoardSnapshot: async () => ({ status: 'ok', children: [] }),
          readTerminalDisposition: async () => null,
          readCloseLabels: async () => [],
          checkDirtyWorkspace: async () => ({ dirty: false }),
          locateAuthoritySource: () => ({ kind: 'legacy-body/v1' }),
          loadCloseDeliveryBody: async () => original,
          loadCloseDeliveryGateInput: async () => ({
            issueNumber: ISSUE,
            repository: REPO,
            body: original,
            branch: 'feature/1669',
            acceptedSha: HEAD,
            localHeadSha: HEAD,
            lineage: { parentIssueNumber: null, deliveryTarget: 'trunk' },
            pullRequests: [],
            records: null,
          }),
          resolveReviewAuthorization: () => ({ mode: 'human', standing: true, source: 'test' }),
          requireDeliveryReceipt: () => ({ skipped: false, mode: lane, receipt: { result: lane } }),
          verifyCloseDeliveryReceipt: async ({ gateInput, acceptedReviewSha }) => {
            assert.equal(gateInput.acceptedSha, HEAD);
            assert.equal(acceptedReviewSha, HEAD);
            return { skipped: false, mode: lane, receipt: { result: lane } };
          },
          normalizationReadBack: async () => ({ body: original, head: HEAD }),
          normalizationMutateBody: async () => {
            effects.push('normalization');
            throw new Error('must not persist');
          },
          uncheckedPreCloseCheckboxes,
          resolveDocsOnlyLaneSkipProof: async () => false,
          runMoveState: async () => {
            effects.push('transition');
            throw new Error('must not transition');
          },
        }),
        (error) => error.code === 3
      );
      assert.match(stderr.join('\n'), /1 unchecked checkbox in issue body/);
      assert.match(stderr.join('\n'), /- \[ \] Step A/);
      assert.doesNotMatch(stderr.join('\n'), /normalization-authority-drift/);
      assert.deepEqual(effects, []);
    } finally {
      process.exit = previousExit;
      console.error = previousError;
      process.exitCode = previousExitCode;
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
}
