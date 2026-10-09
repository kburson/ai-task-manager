import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { joinReview, run, startReview, statusReview } from '../../src/cli/run.mjs';
import {
  canonicalChallengeBytes,
  digestGrantParameters,
} from '../../src/authority/canonicalize.mjs';
import { resolveReviewPaths } from '../../src/collateral/paths.mjs';
import { createGitRepository } from '../../src/git/repository.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { canonicalProjection, inspectReview, mutateReview } from '../../src/protocol/service.mjs';
import { executeJoinCommand } from '../helpers/command-roundtrip.mjs';

const NOW = '2026-09-08T12:00:00.000Z';

function repositoryFixture(prefix = 'apr-start-') {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/example.md'), '# Example\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/example.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('CLI start accepts explicit reviewer intent without changing direct startReview enforcement', async (t) => {
  const fx = repositoryFixture('apr-cli-start-');
  t.after(fx.cleanup);
  let stdout = '';
  const code = await run(
    [
      'start',
      'docs/example.md',
      '--artifact-kind',
      'spec',
      '--reviewer-provider',
      'claude',
      '--reviewer-model',
      'claude-opus-5',
      '--reviewer-effort',
      'medium',
    ],
    {
      cwd: fx.root,
      env: {
        CODEX_THREAD_ID: 'start-cli-author',
        CODEX_MODEL_ID: 'gpt-test',
        CODEX_MODEL_DISPLAY: 'GPT Test',
      },
      now: new Date(NOW),
      stdout: { write: (value) => (stdout += value) },
      stderr: { write: () => {} },
    }
  );
  assert.equal(code, 0);
  assert.match(stdout, /awaiting-reviewer/);
});

test('generated routing and commands remain safe for shell metacharacters in paths', async (t) => {
  const fx = repositoryFixture("apr start ' `tick` $()-");
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-shell-path'),
    reviewId: 'review-shell-path',
    now: NOW,
  });
  const status = statusReview(started.paths.workspace, { now: NOW });
  assert.equal(executeJoinCommand(status.next_action.command), started.paths.reviewer_invitation);
  const invitation = readFileSync(started.paths.reviewer_invitation, 'utf8');
  assert.match(invitation, /ai-peer-review-invitation data="[A-Za-z0-9_-]+"/);
  assert.doesNotMatch(invitation, /Installed join: `peer-review join \/tmp\/apr start/);
  const joined = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: identity('reviewer', 'reviewer-shell-path'),
    now: NOW,
  });
  assert.equal(joined.state, 'reviewer-turn');
});

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

test('start performs preflight checks before mutation and writes default event-first collateral', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  writeFileSync(path.join(fx.root, 'docs/example.md'), '# Dirty\n');
  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-session'),
      reviewId: 'review-dirty',
      now: NOW,
    }),
    (error) => error.code === 'APR_ARTIFACT_DIRTY'
  );
  assert.equal(
    readFileSync(path.join(fx.root, '.git/info/exclude'), 'utf8'),
    '.scratch/peer-review/\n'
  );
  assert.throws(() =>
    readFileSync(path.join(fx.root, '.scratch/peer-review/review-dirty/events.jsonl'))
  );

  writeFileSync(path.join(fx.root, 'docs/example.md'), '# Example\n');
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    now: NOW,
  });
  assert.equal(started.schema, 'ai-peer-review.cli-result/v1');
  assert.equal(started.command, 'start');
  assert.equal(started.state, 'awaiting-reviewer');
  assert.equal(started.review.max_turns, 10);
  assert.equal(started.review.claim_ttl_ms, 8 * 60 * 60 * 1000);
  assert.equal(started.review.commit_mode, 'normal');
  assert.equal(started.review.transport_mode, 'manual');
  assert.equal(started.review.author_transport_capability, 'manual');
  assert.equal(started.review.no_commit_baseline, null);
  assert.equal(started.review.authority.authority_policy, 'unavailable');
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);
  assert.match(readFileSync(started.paths.author_startup, 'utf8'), /# Author startup/);
  assert.match(readFileSync(started.paths.reviewer_invitation, 'utf8'), /# Reviewer invitation/);
  const retried = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    now: '2026-09-08T13:00:00.000Z',
  });
  assert.equal(retried.paths.events, started.paths.events);
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);

  rmSync(started.paths.author_startup);
  rmSync(path.join(started.paths.workspace, 'protocol.json'));
  rmSync(path.join(started.paths.workspace, 'participants.json'));
  const recovered = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    now: '2026-09-09T13:00:00.000Z',
  });
  assert.equal(recovered.review_id, started.review_id);
  assert.match(readFileSync(recovered.paths.author_startup, 'utf8'), /# Author startup/);
  assert.equal(
    JSON.parse(readFileSync(path.join(started.paths.workspace, 'protocol.json'))).review_id,
    started.review_id
  );
  assert.equal(
    JSON.parse(readFileSync(path.join(started.paths.workspace, 'participants.json'))).review_id,
    started.review_id
  );
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);
});

test('replacement attempts share one explicit record destination without sharing protocol authority', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const base = {
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'record-author'),
    recordId: 'record-stable',
    now: NOW,
  };
  const first = await startReview({ ...base, reviewId: 'review-first' });
  const second = await startReview({ ...base, reviewId: 'review-second' });

  const firstContext = JSON.parse(
    readFileSync(path.join(first.paths.workspace, 'review-context.json'), 'utf8')
  );
  const secondContext = JSON.parse(
    readFileSync(path.join(second.paths.workspace, 'review-context.json'), 'utf8')
  );
  assert.equal(first.review_id, 'review-first');
  assert.equal(second.review_id, 'review-second');
  assert.equal(first.record_id, 'record-stable');
  assert.equal(second.record_id, 'record-stable');
  assert.equal(firstContext.record_id, 'record-stable');
  assert.equal(secondContext.record_id, 'record-stable');
  assert.notEqual(first.paths.workspace, second.paths.workspace);
  assert.equal(path.dirname(first.paths.author_startup), path.dirname(second.paths.author_startup));
  assert.equal(path.basename(first.paths.author_startup), 'review-first-author-startup.md');
  assert.equal(path.basename(second.paths.author_startup), 'review-second-author-startup.md');

  await assert.rejects(
    startReview({ ...base, reviewId: 'review-first', recordId: 'record-conflict' }),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
});

test('exact start recovery validates every collision before repairing derived files', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-atomic-recovery',
    now: NOW,
  });
  const protocol = path.join(started.paths.workspace, 'protocol.json');
  const participants = path.join(started.paths.workspace, 'participants.json');
  const reservation = path.join(started.paths.workspace, 'collateral-reservation.json');
  const context = path.join(started.paths.workspace, 'review-context.json');
  rmSync(protocol);
  rmSync(participants);
  rmSync(reservation);
  writeFileSync(context, 'foreign bytes');

  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-session'),
      reviewId: 'review-atomic-recovery',
      now: '2026-09-09T13:00:00.000Z',
    }),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );

  assert.throws(() => readFileSync(protocol));
  assert.throws(() => readFileSync(participants));
  assert.throws(() => readFileSync(reservation));
  assert.equal(readFileSync(context, 'utf8'), 'foreign bytes');
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);
});

test('start validates transport and seals the no-commit Git baseline', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-session'),
      reviewId: 'review-bad-transport',
      transportMode: 'carrier-pigeon',
      now: NOW,
    }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-no-commit',
    noCommit: true,
    testHumanAuthority: 'fixture-a',
    now: NOW,
  });
  assert.equal(started.review.commit_mode, 'no-commit');
  assert.equal(started.review.no_commit_baseline.head.length, 40);
  assert.match(started.review.no_commit_baseline.index_digest, /^sha256:[0-9a-f]{64}$/);
  assert.match(started.review.no_commit_baseline.worktree_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(started.review.authority.verifier.assurance_grade, 'test-fixture');
  assert.equal(started.review.bootstrap.challenge.action, 'pin-verifier');
  assert.equal(started.review.bootstrap.attestation.strength, 'unverified-test');
  assert.deepEqual(
    inspectReview(started.paths.workspace).protocol.startup.no_commit_baseline,
    started.review.no_commit_baseline
  );
  const retried = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-no-commit',
    noCommit: true,
    testHumanAuthority: 'fixture-a',
    now: '2026-09-08T13:00:00.000Z',
  });
  assert.equal(retried.paths.events, started.paths.events);
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);

  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'other-author-session'),
      reviewId: 'review-test-normal-mode',
      testHumanAuthority: 'fixture-a',
      now: NOW,
    }),
    (error) => error.code === 'APR_AUTHORITY_POLICY'
  );
});

test('start verifies and consumes an exact prevention-grade pin-verifier grant', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const fingerprint = `sha256:${createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')}`;
  const authority = {
    authority_policy: 'prevention-required',
    challenge_ttl_ms: 15 * 60 * 1000,
    verifier: {
      kind: 'ed25519',
      verifier_id: 'human:test-hardware',
      verifier_fingerprint: fingerprint,
      public_key: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      assurance_grade: 'hardened',
      signer_strength: 'cryptographic-external',
    },
  };
  const parameters = {
    verifier_fingerprint: fingerprint,
    assurance_grade: 'hardened',
    authority_policy: 'prevention-required',
    artifact_path: 'docs/example.md',
    artifact_kind: 'spec',
    reviews_root: 'docs/peer-reviews',
    path_template: '<kind>/<date>-<name>-<record-id>',
    issue_id: null,
    maximum_turns: 10,
    commit_mode: 'normal',
  };
  const challenge = {
    schema: 'ai-peer-review.grant-challenge/v1',
    challenge_id: 'challenge-bootstrap',
    review_id: 'review-bootstrap',
    intervention_id: null,
    protocol_revision: 0,
    action: 'pin-verifier',
    parameters_digest: digestGrantParameters('pin-verifier', parameters),
    nonce: 'a'.repeat(43),
    expires_at: '2026-09-08T12:15:00.000Z',
  };
  const grant = {
    schema: 'ai-peer-review.grant/v1',
    challenge,
    parameters,
    authorization: {
      source: 'detached-signature',
      signer_id: authority.verifier.verifier_id,
      signer_fingerprint: fingerprint,
      verifier_fingerprint: fingerprint,
      signature: sign(null, canonicalChallengeBytes(challenge), privateKey).toString('base64url'),
    },
  };
  const grantFile = path.join(fx.root, 'bootstrap-grant.json');
  writeFileSync(grantFile, JSON.stringify(grant));
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-bootstrap',
    authority,
    bootstrapGrant: grantFile,
    now: NOW,
  });
  assert.equal(started.review.bootstrap.challenge.challenge_id, 'challenge-bootstrap');
  assert.equal(started.review.bootstrap.attestation.strength, 'cryptographic-external');
  assert.equal(inspectReview(started.paths.workspace).protocol.startup.bootstrap !== null, true);
});

test('start refuses unsafe scratch and tracked collisions without creating authority', async (t) => {
  const unignored = repositoryFixture();
  t.after(unignored.cleanup);
  writeFileSync(path.join(unignored.root, '.git/info/exclude'), '');
  await assert.rejects(
    startReview({
      cwd: unignored.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-session'),
      reviewId: 'review-unignored',
      now: NOW,
    }),
    (error) => error.code === 'APR_SCRATCH_NOT_IGNORED'
  );

  const occupied = repositoryFixture();
  t.after(occupied.cleanup);
  const output = path.join(
    occupied.root,
    'docs/peer-reviews/spec/2026-09-08-example-review-occupied/review-occupied-author-startup.md'
  );
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, 'foreign bytes');
  let verifierCalled = false;
  await assert.rejects(
    startReview(
      {
        cwd: occupied.root,
        artifact: 'docs/example.md',
        artifactKind: 'spec',
        identity: identity('author', 'author-session'),
        reviewId: 'review-occupied',
        bootstrapGrant: 'must-not-be-consumed.json',
        now: NOW,
      },
      {
        verifyBootstrapGrant: () => {
          verifierCalled = true;
          throw new Error('must not run');
        },
      }
    ),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.equal(readFileSync(output, 'utf8'), 'foreign bytes');
  assert.equal(verifierCalled, false);
  assert.throws(() =>
    readFileSync(path.join(occupied.root, '.scratch/peer-review/review-occupied/events.jsonl'))
  );

  const unsafeTemplate = repositoryFixture('apr-{{unsafe}}-');
  t.after(unsafeTemplate.cleanup);
  await assert.rejects(
    startReview({
      cwd: unsafeTemplate.root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity('author', 'author-session'),
      reviewId: 'review-unsafe-template',
      now: NOW,
    }),
    (error) => error.code === 'APR_TEMPLATE_INVALID'
  );
  assert.throws(() =>
    readFileSync(
      path.join(unsafeTemplate.root, '.scratch/peer-review/review-unsafe-template/events.jsonl')
    )
  );
});

test('join binds the same physical worktree and a distinct reviewer before drafting', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const author = identity('author', 'author-session');
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: author,
    reviewId: 'review-join',
    now: NOW,
  });
  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: identity('reviewer', 'reviewer-session'),
      transportCapability: 'automatic-required',
      now: NOW,
    }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: { ...author, role: 'reviewer' },
      now: NOW,
    }),
    (error) => error.code === 'APR_IDENTITY_CONFLICT'
  );

  const joined = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: identity('reviewer', 'reviewer-session'),
    now: NOW,
  });
  assert.equal(joined.state, 'reviewer-turn');
  assert.equal(joined.next_action, 'reviewer-submit');
  assert.equal(joined.review.claim.role, 'reviewer');
  assert.match(readFileSync(joined.paths.response, 'utf8'), /role: "reviewer"/);
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 3);
  const retried = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: identity('reviewer', 'reviewer-session'),
    now: '2026-09-08T13:00:00.000Z',
  });
  assert.equal(retried.paths.response, joined.paths.response);
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 3);
});

test('runtime-sealed startup rejects a mismatched reviewer before joining or claiming', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const runtime = {
    schema: 'ai-peer-review.runtime/v1',
    classification: 'XPR',
    ownership: 'broker',
    transport_mode: 'manual',
    reviewer: {
      selector: 'claude',
      provider: 'anthropic',
      host: 'claude-code',
      model_id: 'fixture-opus',
      model_display: 'Fixture Opus',
      effort: 'high',
    },
    adapter_version: '1.0.0',
    project_root_digest: 'a'.repeat(64),
  };
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: identity('author', 'author-runtime'),
    runtime,
    reviewId: 'review-runtime-registration',
    now: NOW,
  });
  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: identity('reviewer', 'wrong-runtime'),
      runtimeObservation: {
        provider: 'openai',
        host: 'codex',
        model_id: 'gpt-test',
        effort: 'high',
        adapter_version: '1.0.0',
        assurance: 'runtime',
      },
      now: NOW,
    }),
    (error) => error.code === 'APR_IDENTITY_CONFLICT'
  );
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);
  const requested = participantIdentity({
    role: 'reviewer',
    host: 'claude-code',
    provider: 'anthropic',
    modelId: 'fixture-opus',
    modelDisplay: 'Fixture Opus',
    sessionId: 'requested-runtime',
    source: 'runtime',
    joinedAt: NOW,
  });
  const joined = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: requested,
    runtimeObservation: {
      provider: 'anthropic',
      host: 'claude-code',
      model_id: 'fixture-opus',
      effort: 'high',
      adapter_version: '1.0.0',
      assurance: 'runtime',
    },
    now: NOW,
  });
  assert.equal(joined.state, 'reviewer-turn');
  assert.deepEqual(inspectReview(started.paths.workspace).protocol.startup.runtime, runtime);
});

test('runtime-sealed declared registration cannot claim unverified resume-only transport', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const runtime = {
    schema: 'ai-peer-review.runtime/v1',
    classification: 'XPR',
    ownership: 'broker',
    transport_mode: 'manual',
    reviewer: {
      selector: 'claude',
      provider: 'anthropic',
      host: 'claude-code',
      model_id: 'fixture-opus',
      model_display: 'Fixture Opus',
      effort: 'high',
    },
    adapter_version: '1.0.0',
    project_root_digest: 'a'.repeat(64),
  };
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: identity('author', 'author-declared-transport'),
    runtime,
    reviewId: 'review-declared-transport',
    now: NOW,
  });
  const declared = participantIdentity({
    role: 'reviewer',
    host: 'claude-code',
    provider: 'anthropic',
    modelId: 'fixture-opus',
    modelDisplay: 'Fixture Opus',
    sessionId: 'declared-transport',
    source: 'declared',
    joinedAt: NOW,
  });
  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: started.paths.reviewer_invitation,
      identity: declared,
      runtimeObservation: {
        provider: 'anthropic',
        host: 'claude-code',
        model_id: 'fixture-opus',
        effort: 'high',
        adapter_version: '1.0.0',
        assurance: 'declared',
      },
      transportCapability: 'resume-only',
      now: NOW,
    }),
    (error) => error.code === 'APR_TRANSPORT_UNAVAILABLE'
  );
  const events = readFileSync(started.paths.events, 'utf8').trim().split('\n');
  assert.equal(events.length, 1);
  assert.equal(JSON.parse(events[0]).type, 'review-created');
  assert.equal(inspectReview(started.paths.workspace).protocol.claims.reviewer, undefined);
});

test('start refuses a runtime descriptor whose transport disagrees before creating reviewer authority', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const runtime = {
    schema: 'ai-peer-review.runtime/v1',
    classification: 'XPR',
    ownership: 'broker',
    transport_mode: 'manual',
    reviewer: {
      selector: 'claude',
      provider: 'anthropic',
      host: 'claude-code',
      model_id: 'fixture-opus',
      model_display: 'Fixture Opus',
      effort: 'high',
    },
    adapter_version: '1.0.0',
    project_root_digest: 'a'.repeat(64),
  };
  await assert.rejects(
    startReview({
      cwd: fx.root,
      artifact: 'docs/example.md',
      artifactKind: 'plan',
      identity: identity('author', 'author-transport-conflict'),
      runtime,
      transportMode: 'resume-only',
      transportCapability: 'resume-only',
      reviewId: 'review-runtime-transport-conflict',
      now: NOW,
    }),
    (error) => error.code === 'APR_USAGE'
  );
  assert.throws(() =>
    readFileSync(
      path.join(fx.root, '.scratch/peer-review/review-runtime-transport-conflict/events.jsonl')
    )
  );
});

test('join resumes an identical registration interrupted before its claim event', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: identity('author', 'author-session'),
    reviewId: 'review-interrupted-join',
    now: NOW,
  });
  const reviewer = identity('reviewer', 'reviewer-session');
  const initial = inspectReview(started.paths.workspace);
  await mutateReview(
    started.paths.workspace,
    {
      reviewId: initial.protocol.review_id,
      revision: initial.protocol.revision,
      sequence: initial.protocol.sequence,
      actor: initial.protocol.current_actor,
    },
    () => ({
      schema: 'ai-peer-review.event/v1',
      review_id: initial.protocol.review_id,
      sequence: 2,
      revision: 2,
      type: 'reviewer-joined',
      actor: reviewer.session_fingerprint,
      at: NOW,
      payload: {
        reviewer,
        transport_capability: 'manual',
        repository_boundary: createGitRepository().reviewerBoundary(
          fx.root,
          path
            .relative(
              createGitRepository().root(fx.root),
              path.join(path.dirname(started.paths.reviewer_invitation), 'reviewer-response-1.md')
            )
            .split(path.sep)
            .join('/')
        ),
      },
    })
  );

  const joined = await joinReview({
    cwd: fx.root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  assert.equal(joined.state, 'reviewer-turn');
  assert.equal(joined.review.claim.role, 'reviewer');
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 3);
});

test('join rejects scratch context and invitation redirection outside sealed startup authority', async (t) => {
  const fx = repositoryFixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/example.md',
    artifactKind: 'plan',
    identity: identity('author', 'author-session'),
    reviewId: 'review-redirection',
    now: NOW,
  });
  const contextFile = path.join(started.paths.workspace, 'review-context.json');
  const context = JSON.parse(readFileSync(contextFile, 'utf8'));
  context.reviews_root = 'docs/redirected-reviews';
  writeFileSync(contextFile, `${JSON.stringify(context, null, 2)}\n`);
  const redirected = resolveReviewPaths({
    root: fx.root,
    reviewsRoot: context.reviews_root,
    reviewPathTemplate: context.review_path_template,
    issue: context.issue,
    kind: context.artifact_kind,
    name: context.artifact_name,
    date: context.review_date,
    reviewId: context.review_id,
  });
  const forged = path.join(redirected.destination.absolute, 'reviewer-invitation.md');
  mkdirSync(path.dirname(forged), { recursive: true });
  const forgedRouting = Buffer.from(
    canonicalProjection({
      schema: 'ai-peer-review.invitation-routing/v1',
      review_id: context.review_id,
      artifact: path.join(context.repository_root, 'docs/example.md'),
      workspace: redirected.scratch.absolute,
      response: redirected.reviewerResponse(1).absolute,
    })
  ).toString('base64url');
  writeFileSync(
    forged,
    readFileSync(started.paths.reviewer_invitation, 'utf8').replace(
      /ai-peer-review-invitation data="[A-Za-z0-9_-]+"/,
      `ai-peer-review-invitation data="${forgedRouting}"`
    )
  );

  await assert.rejects(
    joinReview({
      cwd: fx.root,
      invitation: forged,
      identity: identity('reviewer', 'reviewer-session'),
      now: NOW,
    }),
    (error) => error.code === 'APR_INVITATION_INVALID'
  );
  assert.equal(readFileSync(started.paths.events, 'utf8').trim().split('\n').length, 1);
});
