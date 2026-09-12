// @story #1609
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../task-tracker/lib/scratch-dir.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const adapterPath = path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs');
const packageRoot = path.join(repoRoot, 'node_modules/ai-peer-review');
const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const peerReviewCli = path.join(packageRoot, packageJson.bin['peer-review']);

function git(root, ...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
}

function createHostFixture(t) {
  const root = mkdtempProjectIsolated('aitm-peer-review-finalize-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'config', 'user.email', 'tests@example.invalid');
  git(root, 'config', 'user.name', 'AITM Tests');
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  writeFileSync(path.join(root, '.gitignore'), '.scratch/peer-review/\n');
  writeFileSync(path.join(root, 'docs/spec.md'), '# Finalization CLI fixture\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  git(root, 'add', '-f', '.gitignore', 'docs/spec.md');
  git(root, 'commit', '-m', 'fixture');
  return realpathSync(root);
}

function peerReviewEnv(session) {
  const env = { ...process.env };
  for (const key of [
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_SESSION_ID',
    'CODEX_SESSION_ID',
    'CODEX_THREAD_ID',
    'GROK_SESSION_ID',
  ]) {
    delete env[key];
  }
  if (session !== null) env.CODEX_THREAD_ID = `aitm-finalize-cli-${session}`;
  env.CODEX_MODEL_ID = 'gpt-test';
  env.CODEX_MODEL_DISPLAY = 'GPT Test';
  return env;
}

function runPeerReview(root, args, session = 'author') {
  return execFileSync(process.execPath, [peerReviewCli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: peerReviewEnv(session),
  });
}

function matchingFile(destination, suffix) {
  const match = readdirSync(destination).find((entry) => entry.endsWith(suffix));
  assert.ok(match, `expected output ending in ${suffix}`);
  return path.join(destination, match);
}

function replaceSection(file, heading, content) {
  const source = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(source, pattern);
  writeFileSync(file, source.replace(pattern, `$1${content}`));
}

test('released package finalization CLI returns terminal success exactly once', async (t) => {
  assert.equal(packageJson.version, '0.2.1');
  const { peerReviewStartArgs } = await import(adapterPath);
  const { statusReview } = await import('ai-peer-review');
  const root = createHostFixture(t);
  const started = runPeerReview(
    root,
    peerReviewStartArgs({ artifact: 'docs/spec.md', issue: 1609, kind: 'spec' })
  );
  const reviewId = started.match(/^Review (review-[a-f0-9]+):/m)?.[1];
  assert.ok(reviewId);
  const workspace = path.join(root, '.scratch/peer-review', reviewId);
  const destination = path.join(root, 'docs/superpowers/reviews/1609/spec');

  runPeerReview(root, ['join', path.join(destination, 'reviewer-invitation.md')], 'reviewer');
  const reviewerResponse = matchingFile(destination, 'reviewer-response-1.md');
  replaceSection(reviewerResponse, 'Summary', 'Accepted as written.');
  replaceSection(reviewerResponse, 'Findings', 'None.');
  replaceSection(reviewerResponse, 'Required changes', 'None.');
  replaceSection(reviewerResponse, 'Optional suggestions', 'None.');
  replaceSection(reviewerResponse, 'Decision', 'accepted');

  const acceptedHead = git(root, 'rev-parse', 'HEAD');
  runPeerReview(root, ['submit', workspace, '--decision', 'accepted'], 'reviewer');
  const pending = statusReview(workspace);
  assert.equal(pending.state, 'acceptance-pending');
  assert.equal(pending.claim.role, 'author');
  assert.equal(pending.next_action.action, 'finalize-acceptance');
  assert.match(pending.next_action.command, /peer-review finalize/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), acceptedHead);
  assert.equal(
    readdirSync(destination).some((entry) => entry.endsWith('review-manifest.md')),
    false
  );

  for (const session of ['reviewer', 'foreign-author']) {
    assert.throws(
      () => runPeerReview(root, ['finalize', workspace], session),
      /APR_IDENTITY_CONFLICT/
    );
    assert.equal(git(root, 'rev-parse', 'HEAD'), acceptedHead);
  }
  assert.throws(() => runPeerReview(root, ['finalize', workspace], null), /APR_IDENTITY_REQUIRED/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), acceptedHead);

  const finalized = runPeerReview(root, ['finalize', workspace], 'author');
  const manifest = matchingFile(destination, 'review-manifest.md');
  const finalCommit = git(root, 'rev-parse', 'HEAD');
  assert.match(finalized, /: accepted/);
  assert.match(finalized, /Next: none/);
  assert.ok(existsSync(manifest));
  assert.notEqual(finalCommit, acceptedHead);
  assert.deepEqual(
    git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', finalCommit).split('\n').sort(),
    [
      path.relative(root, reviewerResponse).split(path.sep).join('/'),
      path.relative(root, manifest).split(path.sep).join('/'),
    ].sort()
  );

  const terminalEvents = readFileSync(path.join(workspace, 'events.jsonl'));
  const retried = runPeerReview(root, ['finalize', workspace], 'author');
  assert.match(retried, /: accepted/);
  assert.match(retried, /Next: none/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), finalCommit);
  assert.deepEqual(readFileSync(path.join(workspace, 'events.jsonl')), terminalEvents);
});
