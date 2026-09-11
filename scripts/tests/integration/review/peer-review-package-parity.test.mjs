// @story #1546
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const entrypointsPath = path.join(
  repoRoot,
  'scripts/task-tracker/lib/command-surface/entrypoints.mjs'
);
const packageRoot = path.join(repoRoot, 'node_modules/ai-peer-review');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const peerReviewCli = path.join(packageRoot, packageJson.bin['peer-review']);

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function createHostFixture(t) {
  const root = mkdtempProjectIsolated('aitm-peer-review-host-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'config', 'user.email', 'tests@example.invalid');
  git(root, 'config', 'user.name', 'AITM Tests');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, 'docs/spec.md'), '# Package boundary fixture\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  git(root, 'add', '-f', 'docs/spec.md');
  git(root, 'commit', '-m', 'fixture');
  return realpathSync(root);
}

function runPeerReview(root, args, session = 'author') {
  return execFileSync(process.execPath, [peerReviewCli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_THREAD_ID: `aitm-package-parity-${session}`,
      CODEX_MODEL_ID: 'gpt-test',
      CODEX_MODEL_DISPLAY: 'GPT Test',
    },
  });
}

function responseFile(destination, suffix) {
  const match = readdirSync(destination).find((entry) => entry.endsWith(suffix));
  assert.ok(match, `expected response ending in ${suffix}`);
  return path.join(destination, match);
}

function replaceSection(file, heading, content) {
  const source = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(source, pattern);
  writeFileSync(file, source.replace(pattern, `$1${content}`));
}

function reviewCoordinates(root, started) {
  const reviewId = started.match(/^Review (review-[a-f0-9]+):/m)?.[1];
  assert.ok(reviewId, 'start output must identify the review workspace');
  return {
    reviewId,
    workspace: path.join(root, '.scratch/peer-review', reviewId),
    destination: path.join(root, 'docs/superpowers/reviews/1546/spec'),
  };
}

test('AITM consumes the exact published package without adding a peer-review wrapper', async () => {
  const { AITM_PEER_REVIEW_CONFIG } = await import(adapterPath);
  const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const entrypoints = readFileSync(entrypointsPath, 'utf8');

  assert.equal(rootPackage.dependencies['ai-peer-review'], '0.1.0');
  assert.equal(packageJson.name, 'ai-peer-review');
  assert.equal(packageJson.version, '0.1.0');
  assert.equal(packageJson.exports, './src/public-api.mjs');
  assert.equal(packageJson.bin['peer-review'], './bin/peer-review.mjs');
  assert.deepEqual(AITM_PEER_REVIEW_CONFIG, {
    reviewsRoot: 'docs/superpowers/reviews',
    reviewPathTemplate: '<issue>/<kind>',
    allowNoCommit: false,
  });
  assert.doesNotMatch(entrypoints, /['"]peer-review['"]/);
  assert.match(runPeerReview(repoRoot, ['--help']), /Commands:/);
});

test('installed CLI preserves AITM settings through revision and acceptance', async (t) => {
  const { peerReviewStartArgs, peerReviewStatus } = await import(adapterPath);
  const root = createHostFixture(t);
  const args = peerReviewStartArgs({
    artifact: 'docs/spec.md',
    issue: 1546,
    kind: 'spec',
    noCommit: true,
    testMode: true,
    testHumanAuthority: 'aitm-package-parity',
  });

  const started = runPeerReview(root, args);
  assert.match(started, /awaiting-reviewer/);
  const { reviewId, workspace, destination } = reviewCoordinates(root, started);
  const protocol = JSON.parse(readFileSync(path.join(workspace, 'protocol.json'), 'utf8'));
  const status = peerReviewStatus({ workspace });

  assert.equal(protocol.startup.context.issue, 1546);
  assert.equal(protocol.startup.context.artifact_kind, 'spec');
  assert.equal(protocol.startup.context.reviews_root, 'docs/superpowers/reviews');
  assert.equal(protocol.startup.context.review_path_template, '<issue>/<kind>');
  assert.equal(protocol.commit_mode, 'no-commit');
  assert.equal(status.state, 'awaiting-reviewer');
  assert.equal(status.reviewId, reviewId);
  assert.equal(status.worktree, workspace);

  runPeerReview(root, ['join', path.join(destination, 'reviewer-invitation.md')], 'reviewer');
  const reviewerOne = responseFile(destination, 'reviewer-response-1.md');
  replaceSection(reviewerOne, 'Summary', 'One revision is required.');
  replaceSection(reviewerOne, 'Findings', '### R1-F001 — Clarify\n\nClarify the text.');
  replaceSection(reviewerOne, 'Required changes', '- Address R1-F001.');
  replaceSection(reviewerOne, 'Optional suggestions', 'None.');
  replaceSection(reviewerOne, 'Decision', 'revisions-requested');
  runPeerReview(root, ['submit', workspace, '--decision', 'revisions-requested'], 'reviewer');
  assert.equal(peerReviewStatus({ workspace }).state, 'author-revision');

  writeFileSync(path.join(root, 'docs/spec.md'), '# Package boundary fixture\n\nClarified.\n');
  const authorOne = responseFile(destination, 'author-response-1.md');
  replaceSection(authorOne, 'Summary', 'Clarified the specification.');
  replaceSection(authorOne, 'Finding dispositions', '- R1-F001: fixed.');
  replaceSection(authorOne, 'Changes made', 'Added clarification.');
  replaceSection(authorOne, 'Declined changes and rationale', 'None.');
  replaceSection(authorOne, 'Verification', 'No-commit package fixture.');
  runPeerReview(root, ['submit', workspace], 'author');
  assert.equal(peerReviewStatus({ workspace }).state, 'reviewer-turn');

  const reviewerTwo = responseFile(destination, 'reviewer-response-2.md');
  replaceSection(reviewerTwo, 'Summary', 'The revision resolves the finding.');
  replaceSection(reviewerTwo, 'Findings', 'None.');
  replaceSection(reviewerTwo, 'Required changes', 'None.');
  replaceSection(reviewerTwo, 'Optional suggestions', 'None.');
  replaceSection(reviewerTwo, 'Decision', 'accepted');
  runPeerReview(root, ['submit', workspace, '--decision', 'accepted'], 'reviewer');
  assert.equal(peerReviewStatus({ workspace }).state, 'acceptance-pending');
});

test('installed package preserves the legacy turn-budget intervention', async (t) => {
  const { peerReviewStartArgs, peerReviewStatus } = await import(adapterPath);
  const root = createHostFixture(t);
  const started = runPeerReview(
    root,
    peerReviewStartArgs({
      artifact: 'docs/spec.md',
      issue: 1546,
      kind: 'spec',
      noCommit: true,
      testMode: true,
      testHumanAuthority: 'aitm-budget-recovery',
      maxTurns: 1,
    })
  );
  const { workspace, destination } = reviewCoordinates(root, started);
  runPeerReview(root, ['join', path.join(destination, 'reviewer-invitation.md')], 'reviewer');

  const reviewerOne = responseFile(destination, 'reviewer-response-1.md');
  replaceSection(reviewerOne, 'Summary', 'One revision is required.');
  replaceSection(reviewerOne, 'Findings', '### R1-F001 — Clarify\n\nClarify the text.');
  replaceSection(reviewerOne, 'Required changes', '- Address R1-F001.');
  replaceSection(reviewerOne, 'Optional suggestions', 'None.');
  replaceSection(reviewerOne, 'Decision', 'revisions-requested');
  runPeerReview(root, ['submit', workspace, '--decision', 'revisions-requested'], 'reviewer');
  writeFileSync(path.join(root, 'docs/spec.md'), '# Package boundary fixture\n\nClarified.\n');
  const authorOne = responseFile(destination, 'author-response-1.md');
  replaceSection(authorOne, 'Summary', 'Clarified the specification.');
  replaceSection(authorOne, 'Finding dispositions', '- R1-F001: fixed.');
  replaceSection(authorOne, 'Changes made', 'Added clarification.');
  replaceSection(authorOne, 'Declined changes and rationale', 'None.');
  replaceSection(authorOne, 'Verification', 'No-commit package fixture.');
  runPeerReview(root, ['submit', workspace], 'author');
  assert.equal(peerReviewStatus({ workspace }).state, 'intervention-required');
});

test('installed package refuses dirty artifacts and occupied AITM outputs', async (t) => {
  const { peerReviewStartArgs } = await import(adapterPath);
  const dirtyRoot = createHostFixture(t);
  writeFileSync(path.join(dirtyRoot, 'docs/spec.md'), '# Dirty artifact\n');
  assert.throws(
    () =>
      runPeerReview(
        dirtyRoot,
        peerReviewStartArgs({ artifact: 'docs/spec.md', issue: 1546, kind: 'spec' })
      ),
    /APR_ARTIFACT_DIRTY/
  );

  const collisionRoot = createHostFixture(t);
  const destination = path.join(collisionRoot, 'docs/superpowers/reviews/1546/spec');
  mkdirSync(destination, { recursive: true });
  writeFileSync(path.join(destination, 'author-startup.md'), 'foreign bytes\n');
  assert.throws(
    () =>
      runPeerReview(
        collisionRoot,
        peerReviewStartArgs({
          artifact: 'docs/spec.md',
          issue: 1546,
          kind: 'spec',
          noCommit: true,
          testMode: true,
          testHumanAuthority: 'aitm-collision',
        })
      ),
    /APR_OUTPUT_COLLISION/
  );
});

test('installed package owns supplement, continuation, good-enough, and recovery help', () => {
  const help = runPeerReview(repoRoot, ['help', '--all']);
  for (const expected of [
    'peer-review supplement <workspace>',
    'peer-review continue <workspace>',
    'peer-review finalize <workspace> [--good-enough',
    'peer-review recover <workspace>',
  ]) {
    assert.match(help, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('AITM rejects no-commit mode outside an explicit test harness', async () => {
  const { peerReviewStartArgs } = await import(adapterPath);
  assert.throws(
    () =>
      peerReviewStartArgs({
        artifact: 'docs/spec.md',
        issue: 1546,
        kind: 'spec',
        noCommit: true,
      }),
    /no-commit mode is test-only/
  );
});
