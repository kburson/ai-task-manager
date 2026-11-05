import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { joinReview, resumeReview, run, startReview, statusReview } from '../../src/cli/run.mjs';
import { renderCommand } from '../../src/cli/help-data.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { statusReview as publicStatusReview } from '../../src/public-api.mjs';

const NOW = '2026-09-08T12:00:00.000Z';

function identity(role, session) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: NOW,
  });
}

async function joinedFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/example.md'), '# Example\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/example.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  const started = await startReview({
    cwd: root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-status',
    now: NOW,
  });
  await joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: identity('reviewer', 'reviewer-session'),
    now: NOW,
  });
  return started;
}

test('status before join names the exact sealed invitation path', async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-status-invite-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/example.md'), '# Example\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/example.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  const started = await startReview({
    cwd: root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-status-invite',
    now: NOW,
  });
  const status = statusReview(started.paths.workspace, { now: NOW });
  const joinCommand = renderCommand(['peer-review', 'join', started.paths.reviewer_invitation]);
  assert.equal(status.next_action.command, joinCommand);
  assert.equal(status.paths.invitation, started.paths.reviewer_invitation);
  assert.equal(status.claim.status, 'unclaimed');
  const resumed = resumeReview(started.paths.workspace, { now: NOW });
  assert.equal(resumed.role, 'reviewer');
  assert.equal(resumed.paths.response, undefined);
  assert.equal(resumed.instructions, `Join from the exact sealed invitation: ${joinCommand}`);
  assert.doesNotMatch(resumed.instructions, /undefined/);
});

test('status is event-derived, read-only, redacted, and returns one exact next action', async (t) => {
  const started = await joinedFixture(t);
  const beforeEvents = readFileSync(started.paths.events);
  const beforeProtocol = readFileSync(path.join(started.paths.workspace, 'protocol.json'));
  const status = statusReview(started.paths.workspace, { now: NOW });
  assert.equal(status.schema, 'ai-peer-review.cli-result/v1');
  assert.equal(status.state, 'reviewer-turn');
  assert.deepEqual(status.next_action, {
    action: 'reviewer-submit',
    command: renderCommand(['peer-review', 'submit', started.paths.workspace]),
  });
  assert.equal(status.claim.status, 'active');
  assert.equal(JSON.stringify(status).includes('session_fingerprint'), false);
  assert.equal(JSON.stringify(status).includes('claim_id'), false);
  assert.equal(JSON.stringify(status).includes('"pid"'), false);
  assert.deepEqual(readFileSync(started.paths.events), beforeEvents);
  assert.deepEqual(
    readFileSync(path.join(started.paths.workspace, 'protocol.json')),
    beforeProtocol
  );
  const stale = statusReview(started.paths.workspace, { now: '2026-09-09T00:00:01.000Z' });
  assert.equal(stale.claim.status, 'stale');
  assert.equal(stale.state, 'intervention-required');
  assert.deepEqual(stale.next_action, {
    action: 'human-intervention',
    command: renderCommand(['peer-review', 'recover', started.paths.workspace, '--reclaim']),
  });
  assert.deepEqual(readFileSync(started.paths.events), beforeEvents);
});

test('public status rejects invalid and noncanonical clocks instead of treating claims as active', async (t) => {
  const started = await joinedFixture(t);
  for (const now of ['not-a-time', '2026-09-08T07:00:00-05:00', new Date(Number.NaN)]) {
    assert.throws(
      () => publicStatusReview(started.paths.workspace, { now }),
      (error) => error.code === 'APR_CLAIM_INVALID'
    );
  }
});

test('resume returns current actor instructions without polling or mutation', async (t) => {
  const started = await joinedFixture(t);
  const before = readFileSync(started.paths.events);
  const resumed = resumeReview(started.paths.workspace, { now: NOW });
  assert.equal(resumed.command, 'resume');
  assert.equal(resumed.role, 'reviewer');
  assert.match(resumed.instructions, /reviewer response/i);
  assert.equal(resumed.paths.response.endsWith('reviewer-response-1.md'), true);
  assert.equal(resumed.instructions.includes(resumed.paths.response), true);
  assert.deepEqual(readFileSync(started.paths.events), before);
});

test('status --next and plain resume render their exact operational output', async (t) => {
  const started = await joinedFixture(t);
  const invoke = async (argv) => {
    let stdout = '';
    let stderr = '';
    const exitCode = await run(argv, {
      cwd: path.dirname(started.paths.workspace),
      env: {},
      now: NOW,
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: (value) => (stderr += value) },
    });
    assert.equal(exitCode, 0, stderr);
    return stdout;
  };
  assert.equal(
    await invoke(['status', started.paths.workspace, '--next']),
    `${renderCommand(['peer-review', 'submit', started.paths.workspace])}\n`
  );
  const resume = await invoke(['resume', started.paths.workspace]);
  assert.match(resume, /^Review review-status: reviewer-turn$/m);
  assert.match(resume, /^Instructions: Open the current reviewer response /m);
});
