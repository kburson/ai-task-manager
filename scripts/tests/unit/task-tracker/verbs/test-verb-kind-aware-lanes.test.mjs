// @story #1158
//
// The Test verb ran `npm run test:unit|test:integration|test:slow` on every
// issue regardless of kind, so a `docs-only` issue whose diff touches nothing
// but Markdown still had to green the entire repo suite. The DoD layer (#865)
// and the Review NAT gate (#940) already relax for a proven-docs-only diff; the
// Test-execution layer did not. These tests pin the fix AND the default-deny
// line that keeps it from becoming a bypass.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runVerbTest } from '../../../../task-tracker/verbs/test.mjs';
import {
  createVerificationReceipt,
  parseVerificationReceipt,
} from '../../../../task-tracker/lib/verification-receipt.mjs';

const SHA = 'a'.repeat(40);
const INSTANT = '2026-08-07T12:00:00.000Z';
const cfg = { repo: 'o/r' };
const DOC_PATHS = ['docs/guides/workflow.md', 'README.md'];
const CODE_PATHS = ['scripts/task-tracker/verbs/test.mjs'];

function fingerprint(identity) {
  return {
    commitSha: SHA,
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      lockfileHash: `sha256:${'a'.repeat(64)}`,
      configHashes: { 'package.json': `sha256:${'b'.repeat(64)}` },
      sandbox: { kind: 'worktree', identity, clean: true },
    },
  };
}

function developReceipt() {
  return createVerificationReceipt({
    issueNumber: 1158,
    stage: 'develop-final',
    fingerprint: fingerprint('/outer'),
    commands: [
      { classification: 'lint-full', command: 'npm', args: ['run', 'lint'], exitCode: 0 },
      {
        classification: 'format-full',
        command: 'npm',
        args: ['run', 'format:check'],
        exitCode: 0,
      },
    ].map((c) => ({ ...c, durationMs: 10 })),
    now: () => INSTANT,
  });
}

function issueBody({ kind = 'code', extraVcs = [] } = {}) {
  return [
    '<!-- aitm-last-known-state: develop -->',
    '## Verification Commands',
    '',
    '- [ ] `npm run lint`',
    '- [ ] `npm run format:check`',
    ...extraVcs.map((command) => `- [ ] \`${command}\``),
    '',
    '## AITM Progress Markers',
    '',
    `<!-- aitm-issue-kind kind="${kind}" -->`,
  ].join('\n');
}

// Drives one full green run and reports what the sandbox was actually asked to
// execute. `changedPaths` is injected the way the real verb resolves it — from
// the sandbox worktree — so each test states its own diff explicitly.
async function runWith({ kind, changedPaths, extraVcs = [] }) {
  let body = issueBody({ kind, extraVcs });
  const sandboxRuns = [];
  const comments = [];
  const result = await runVerbTest({
    cfg,
    issueNumber: 1158,
    projectDir: process.cwd(),
    now: () => INSTANT,
    deps: {
      fetchBody: async () => body,
      mutateBody: async ({ mutate }) => {
        body = mutate(body);
        return { status: 'ok' };
      },
      postComment: async ({ body: comment }) => comments.push(comment),
      getHeadSha: async () => SHA,
      runDevelopFinalization: async () => ({
        ok: true,
        fingerprint: fingerprint('/outer'),
        receipt: developReceipt(),
      }),
      createWorktree: async () => {},
      removeWorktree: async () => {},
      npmCi: async () => {},
      getSandboxHeadSha: async () => SHA,
      buildFingerprint: () => fingerprint('/sandbox'),
      computeChangedPaths: async () => changedPaths,
      execInSandbox: async ({ argv }) => {
        sandboxRuns.push(argv.join(' '));
        return {
          exit: 0,
          stdout: '',
          stderr: '',
          durationMs: 5,
          startedAt: INSTANT,
          completedAt: INSTANT,
        };
      },
      moveState: async () => ({ ok: true }),
      logIssueTime: async () => {},
    },
  });
  return { result, sandboxRuns, comments, body };
}

const LANES = ['npm run test:unit', 'npm run test:integration', 'npm run test:slow'];

test('a docs-only kind with a provably docs-only diff skips the complete lanes', async () => {
  const { result, sandboxRuns } = await runWith({ kind: 'docs-only', changedPaths: DOC_PATHS });
  assert.equal(result.status, 'passed');
  assert.deepEqual(sandboxRuns, []);
});

test('a code kind runs every lane even when its diff is all documentation', async () => {
  // The kind declares; the diff decides. A docs-only DIFF is not enough — the
  // issue must also be marked docs-only.
  const { result, sandboxRuns } = await runWith({ kind: 'code', changedPaths: DOC_PATHS });
  assert.equal(result.status, 'passed');
  assert.deepEqual(sandboxRuns, LANES);
});

test('a docs-only kind whose diff touches code still runs every lane', async () => {
  const { result, sandboxRuns } = await runWith({
    kind: 'docs-only',
    changedPaths: [...DOC_PATHS, ...CODE_PATHS],
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(sandboxRuns, LANES);
});

test('an unresolvable (empty) diff is default-deny: the lanes run', async () => {
  // `computeChangedPaths` returns [] on ANY failure. An empty set is not proof
  // of a docs-only change, so the floor must hold.
  const { result, sandboxRuns } = await runWith({ kind: 'docs-only', changedPaths: [] });
  assert.equal(result.status, 'passed');
  assert.deepEqual(sandboxRuns, LANES);
});

test('skipping lanes while a legacy aggregate is declared refuses the transition', async () => {
  // `npm test` is the post-#934 lane-split form the verb actually sees; a body
  // still declaring `npm run test:all` is migrated to it before partitioning.
  const { result, sandboxRuns, comments } = await runWith({
    kind: 'docs-only',
    changedPaths: DOC_PATHS,
    extraVcs: ['npm test'],
  });
  assert.equal(result.status, 'lane-skip-refused');
  assert.equal(result.reasons[0].code, 'lane-skip-vs-legacy-aggregate');
  assert.deepEqual(result.reasons[0].declared, ['npm test']);
  // Nothing ran, and — the point of the refusal — no verdict was derived for
  // the aggregate from lanes that never executed.
  assert.deepEqual(sandboxRuns, []);
  assert.match(comments.at(-1), /lane-skip-vs-legacy-aggregate/);
});

test('a declared aggregate is still derived normally when the lanes DO run', async () => {
  const { result, sandboxRuns } = await runWith({
    kind: 'code',
    changedPaths: CODE_PATHS,
    extraVcs: ['npm run test:all'],
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(sandboxRuns, LANES);
});

test('the receipt records the skip and fabricates no lane pass entries', async () => {
  const { body } = await runWith({ kind: 'docs-only', changedPaths: DOC_PATHS });
  const receipt = parseVerificationReceipt(body, 'test');
  assert.ok(receipt);
  const classifications = receipt.commands.map(({ classification }) => classification);
  assert.deepEqual(classifications, ['lint-full', 'format-full']);
  assert.equal(receipt.laneSkip.reason, 'docs-only-diff');
  assert.equal(receipt.laneSkip.kind, 'docs-only');
  assert.deepEqual(receipt.laneSkip.lanes, ['test-unit', 'test-integration', 'test-slow']);
  assert.deepEqual(receipt.laneSkip.changedPaths, DOC_PATHS);
});

test('a receipt from a run that DID execute the lanes carries no skip record', async () => {
  const { body } = await runWith({ kind: 'code', changedPaths: CODE_PATHS });
  const receipt = parseVerificationReceipt(body, 'test');
  assert.equal(receipt.laneSkip, undefined);
  assert.deepEqual(
    receipt.commands.map(({ classification }) => classification),
    ['lint-full', 'format-full', 'test-unit', 'test-integration', 'test-slow']
  );
});

test('the green summary comment names the skipped lanes', async () => {
  const { comments } = await runWith({ kind: 'docs-only', changedPaths: DOC_PATHS });
  const summary = comments.find((c) => /Sandboxed verification passed/.test(c));
  assert.ok(summary);
  assert.match(summary, /Complete test lanes skipped/);
  assert.match(summary, /test-unit, test-integration, test-slow/);
});
