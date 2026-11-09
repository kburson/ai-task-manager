import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import * as api from '../helpers/internal-api.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { inspectReviewAuthority, mutateReview } from '../../src/protocol/service.mjs';
import {
  budgetIntervention,
  fixtureAuthority,
  signedGrant,
} from '../helpers/intervention-fixture.mjs';

const NOW = '2026-09-09T12:00:00.000Z';
const RATIONALE = Buffer.from('Accept this bounded residual risk for the release.\n');
const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bin/peer-review.mjs');

function git(root, args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-finalization-'));
  git(root, ['init', '-b', 'trunk'], { stdio: 'ignore' });
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  git(root, ['add', 'docs/artifact.md']);
  git(root, ['commit', '-m', 'fixture'], { stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

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

function finalizeWithCli(root, workspace, session) {
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
  env.CODEX_THREAD_ID = session;
  env.CODEX_MODEL_ID = 'gpt-test';
  env.CODEX_MODEL_DISPLAY = 'GPT Test';
  return spawnSync(process.execPath, [CLI, 'finalize', workspace], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  assert.match(text, pattern);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

async function acceptedReview(root, reviewId, { noCommit = false, phases } = {}) {
  const author = identity('author', `${reviewId}-author`);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    noCommit,
    phases,
    now: NOW,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'Accepted as written.');
  replaceSection(joined.paths.response, 'Findings', 'None.');
  replaceSection(joined.paths.response, 'Required changes', 'None.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'accepted');
  const accepted = await api.submitReviewTurn({
    cwd: root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'accepted',
    now: '2026-09-09T12:01:00.000Z',
  });
  return { author, reviewer, started, accepted };
}

test('non-final phased acceptance produces durable evidence without terminating', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-phase', { phases: 'spec,plan' });
  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    now: '2026-09-09T12:02:00.000Z',
  });
  assert.equal(finalized.state, 'awaiting-phase-artifact');
  assert.equal(finalized.next_action, 'advance-phase-artifact');
  assert.equal(finalized.review.phase.cursor, 0);
  assert.equal(finalized.review.phase.kind, 'spec');
  assert.equal(finalized.paths.phase_manifest.endsWith('phase-01-spec-review-manifest.md'), true);
  assert.equal(readFileSync(finalized.paths.phase_manifest, 'utf8').includes('phase_status'), true);
  assert.equal(
    existsSync(path.join(path.dirname(finalized.paths.phase_manifest), 'review-manifest.md')),
    false
  );
});

function overrideParameters(workspace) {
  const { state, events } = inspectReviewAuthority(workspace);
  const reviewer = [...events]
    .reverse()
    .find((event) => event.type === 'reviewer-revisions-requested');
  return {
    artifact_path: state.protocol.artifact.path,
    artifact_blob: state.protocol.artifact.blob,
    artifact_digest: state.protocol.artifact.digest,
    final_round: reviewer.payload.turn,
    reviewer_response_path: reviewer.payload.response.path,
    reviewer_response_digest: reviewer.payload.response.digest,
    unresolved_finding_ids: reviewer.payload.finding_ids,
    human_rationale_digest: `sha256:${createHash('sha256').update(RATIONALE).digest('hex')}`,
  };
}

async function normalIntervention(root, reviewId) {
  const fixtureId = `${reviewId}-authority`;
  const author = identity('author', `${reviewId}-author`);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    maxTurns: 1,
    authority: fixtureAuthority(fixtureId),
    now: NOW,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'One repair remains.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const handoff = await api.submitReviewTurn({
    cwd: root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T12:01:00.000Z',
  });
  replaceSection(handoff.paths.response, 'Summary', 'No byte change.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: declined');
  replaceSection(handoff.paths.response, 'Changes made', 'None.');
  replaceSection(
    handoff.paths.response,
    'Declined changes and rationale',
    'Human Authority will decide.'
  );
  replaceSection(handoff.paths.response, 'Verification', 'Artifact bytes rechecked.');
  const closed = await api.submitAuthorTurn({
    cwd: root,
    workspace: started.paths.workspace,
    identity: author,
    noArtifactChange: true,
    reason: 'Human Authority will decide.',
    now: '2026-09-09T12:02:00.000Z',
  });
  return { author, reviewer, started, closed, fixtureId };
}

test('consensus finalization commits only acceptance and deterministic manifest', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-consensus');
  assert.equal(review.accepted.state, 'acceptance-pending');
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    now: '2026-09-09T12:02:00.000Z',
  });
  assert.equal(finalized.state, 'accepted');
  assert.notEqual(finalized.review.commit, base);
  const physicalRoot = git(fx.root, ['rev-parse', '--show-toplevel']).trim();
  assert.deepEqual(
    git(fx.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', finalized.review.commit])
      .trim()
      .split('\n')
      .sort(),
    [
      path.relative(physicalRoot, review.accepted.paths.response).split(path.sep).join('/'),
      path.relative(physicalRoot, finalized.paths.manifest).split(path.sep).join('/'),
    ].sort()
  );
  const manifest = readFileSync(finalized.paths.manifest, 'utf8');
  assert.match(manifest, /"status": "accepted"/);
  assert.match(manifest, /"acceptance_basis": "reviewer-consensus"/);
  assert.match(manifest, new RegExp(`"final_commit": "${base}"`));
  const eventBytes = readFileSync(review.started.paths.events);
  const retried = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    now: '2026-09-09T12:02:00.000Z',
  });
  assert.equal(retried.review.commit, finalized.review.commit);
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});

test('terminal finalization CLI renders success and preserves idempotent retry', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-cli');

  const first = finalizeWithCli(fx.root, review.started.paths.workspace, 'finalize-cli-author');
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Review finalize-cli: accepted/);
  const commit = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const eventBytes = readFileSync(review.started.paths.events);

  const retry = finalizeWithCli(fx.root, review.started.paths.workspace, 'finalize-cli-author');
  assert.equal(retry.status, 0, retry.stderr);
  assert.match(retry.stdout, /Review finalize-cli: accepted/);
  assert.equal(git(fx.root, ['rev-parse', 'HEAD']).trim(), commit);
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});

test('finalization refuses changed accepted artifact without appending authority', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-changed');
  writeFileSync(path.join(fx.root, 'docs/artifact.md'), '# Changed after acceptance\n');
  const events = readFileSync(review.started.paths.events);
  await assert.rejects(
    api.finalizeReview({
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      identity: review.author,
      now: '2026-09-09T12:02:00.000Z',
    }),
    (error) => error.code === 'APR_ARTIFACT_CHANGED'
  );
  assert.deepEqual(readFileSync(review.started.paths.events), events);
});

test('no-commit consensus finalization writes retained manifest without Git mutation', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-no-commit', { noCommit: true });
  const head = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const index = git(fx.root, ['ls-files', '--stage', '-z'], { encoding: null });
  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    now: '2026-09-09T12:02:00.000Z',
  });
  assert.equal(finalized.state, 'accepted-uncommitted');
  assert.equal(finalized.review.commit, null);
  assert.equal(git(fx.root, ['rev-parse', 'HEAD']).trim(), head);
  assert.deepEqual(git(fx.root, ['ls-files', '--stage', '-z'], { encoding: null }), index);
  const manifest = readFileSync(finalized.paths.manifest, 'utf8');
  assert.match(manifest, /NO-COMMIT TEST MODE/);
  assert.match(manifest, /"final_commit": null/);
  assert.match(api.resumeReview(review.started.paths.workspace).instructions, /terminal/);
});

test('terminal retry rejects a tampered retained manifest', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await acceptedReview(fx.root, 'finalize-tampered', { noCommit: true });
  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    now: '2026-09-09T12:02:00.000Z',
  });
  writeFileSync(finalized.paths.manifest, '# Tampered\n');
  await assert.rejects(
    api.finalizeReview({
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      identity: review.author,
      now: '2026-09-09T12:02:00.000Z',
    }),
    (error) => error.code === 'APR_GIT_SEAL_MISMATCH'
  );
});

test('good-enough finalization rejects non-budget intervention authority', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const author = identity('author', 'stale-finalize-author');
  const reviewer = identity('reviewer', 'stale-finalize-reviewer');
  const started = await api.startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId: 'stale-finalize',
    noCommit: true,
    testHumanAuthority: 'stale-finalize-authority',
    now: NOW,
  });
  await api.joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  const current = inspectReviewAuthority(started.paths.workspace).state;
  await mutateReview(
    started.paths.workspace,
    {
      reviewId: current.protocol.review_id,
      revision: current.protocol.revision,
      sequence: current.protocol.sequence,
      actor: current.protocol.current_actor,
    },
    (state) => ({
      schema: 'ai-peer-review.event/v1',
      review_id: state.protocol.review_id,
      sequence: state.protocol.sequence + 1,
      revision: state.protocol.revision + 1,
      type: 'intervention-entered',
      actor: reviewer.session_fingerprint,
      at: '2026-09-09T12:01:00.000Z',
      payload: {
        intervention_id: 'intervention-stale-finalize',
        reason: 'stale-claim',
        interrupted_state: 'reviewer-turn',
      },
    })
  );
  await assert.rejects(
    api.finalizeReview({
      cwd: fx.root,
      workspace: started.paths.workspace,
      identity: author,
      goodEnough: true,
      grant: {},
      rationale: RATIONALE,
      now: '2026-09-09T12:02:00.000Z',
    }),
    (error) => error.code === 'APR_INVALID_TRANSITION'
  );
});

test('normal human override recovers an exact commit after interruption', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await normalIntervention(fx.root, 'finalize-override');
  assert.equal(review.closed.state, 'intervention-required');
  const base = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const parameters = overrideParameters(review.started.paths.workspace);
  const grant = await signedGrant(
    review.started.paths.workspace,
    'accept-over-objections',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T12:03:00.000Z',
    'detached-signature'
  );
  await assert.rejects(
    api.finalizeReview(
      {
        cwd: fx.root,
        workspace: review.started.paths.workspace,
        identity: review.author,
        goodEnough: true,
        grant,
        rationale: RATIONALE,
        now: '2026-09-09T12:04:00.000Z',
      },
      {
        checkpoint(name) {
          if (name === 'finalization-commit-created') throw new Error('injected interruption');
        },
      }
    ),
    /injected interruption/
  );
  const created = git(fx.root, ['rev-parse', 'HEAD']).trim();
  assert.notEqual(created, base);
  assert.equal(
    inspectReviewAuthority(review.started.paths.workspace).state.protocol.state,
    'intervention-required'
  );

  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    goodEnough: true,
    grant,
    rationale: RATIONALE,
    now: '2026-09-09T12:04:00.000Z',
  });
  assert.equal(finalized.state, 'accepted-over-objections');
  assert.equal(finalized.review.commit, created);
  assert.equal(finalized.review.authority.strength, 'cryptographic-local');
  const physicalRoot = git(fx.root, ['rev-parse', '--show-toplevel']).trim();
  assert.deepEqual(
    git(fx.root, ['diff-tree', '--no-commit-id', '--name-only', '-r', created])
      .trim()
      .split('\n')
      .sort(),
    [
      path.relative(physicalRoot, finalized.paths.human_decision).split(path.sep).join('/'),
      path.relative(physicalRoot, finalized.paths.manifest).split(path.sep).join('/'),
    ].sort()
  );
  assert.match(readFileSync(finalized.paths.human_decision, 'utf8'), /R1-F001/);
  assert.match(
    readFileSync(finalized.paths.manifest, 'utf8'),
    /"acceptance_basis": "human-override"/
  );
});

test('no-commit human override seals retained decision without Git mutation', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'finalize-override-no-commit');
  const head = git(fx.root, ['rev-parse', 'HEAD']).trim();
  const index = git(fx.root, ['ls-files', '--stage', '-z'], { encoding: null });
  const parameters = overrideParameters(review.started.paths.workspace);
  const grant = await signedGrant(
    review.started.paths.workspace,
    'accept-over-objections',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const finalized = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    goodEnough: true,
    grant,
    rationale: RATIONALE,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(finalized.state, 'accepted-over-objections-uncommitted');
  assert.equal(git(fx.root, ['rev-parse', 'HEAD']).trim(), head);
  assert.deepEqual(git(fx.root, ['ls-files', '--stage', '-z'], { encoding: null }), index);
  assert.match(readFileSync(finalized.paths.human_decision, 'utf8'), /NO-COMMIT TEST MODE/);
  const eventBytes = readFileSync(review.started.paths.events);
  const retry = await api.finalizeReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.author,
    goodEnough: true,
    grant,
    rationale: RATIONALE,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.equal(retry.state, finalized.state);
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});
