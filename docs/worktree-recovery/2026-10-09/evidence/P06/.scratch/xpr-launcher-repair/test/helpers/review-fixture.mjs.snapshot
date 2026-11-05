import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createGitRepository } from '../../src/git/repository.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import { appendEvent, atomicWrite } from '../../src/protocol/store.mjs';

export const FINGERPRINTS = Object.freeze({
  author: `sha256:${'a'.repeat(64)}`,
  reviewer: `sha256:${'b'.repeat(64)}`,
  replacement: `sha256:${'c'.repeat(64)}`,
});

export function participant(role, fingerprint = FINGERPRINTS[role]) {
  return {
    role,
    host: 'codex',
    provider: 'openai',
    model_id: 'gpt-test',
    model_display: 'GPT Test',
    session_fingerprint: fingerprint,
    identity_source: 'runtime',
    joined_at: '2026-09-08T12:00:00.000Z',
  };
}

export function claim(
  role,
  {
    claimId = `claim-${role}`,
    fingerprint = FINGERPRINTS[role],
    claimedAt = '2026-09-08T12:00:00.000Z',
    lastActivityAt = '2026-09-08T12:00:00.000Z',
    expiresAt = '2026-09-08T20:00:00.000Z',
    pid = 12345,
  } = {}
) {
  return {
    claim_id: claimId,
    role,
    session_fingerprint: fingerprint,
    host: 'codex',
    claimed_at: claimedAt,
    last_activity_at: lastActivityAt,
    expires_at: expiresAt,
    pid,
  };
}

export function attestation() {
  return {
    source: 'test-fixture',
    strength: 'unverified-test',
    signer_id: 'human:test',
    signer_fingerprint: `sha256:${'d'.repeat(64)}`,
    challenge_digest: `sha256:${'e'.repeat(64)}`,
    verified_at: '2026-09-08T12:00:00.000Z',
  };
}

export function protectedParameters(action, { resumeRole = 'reviewer' } = {}) {
  if (action === 'continue') {
    return {
      additional_turns: 1,
      resulting_effective_maximum: 3,
      resume_role: resumeRole,
      focus_path: null,
      focus_digest: null,
    };
  }
  if (action === 'replace-participant') {
    return {
      role: 'reviewer',
      outgoing_claim_id: 'claim-reviewer',
      outgoing_session_fingerprint: FINGERPRINTS.reviewer,
      incoming_session_fingerprint: FINGERPRINTS.replacement,
    };
  }
  if (action === 'supplement') {
    return {
      content_digest: `sha256:${'e'.repeat(64)}`,
      target_role: 'reviewer',
      target_turn: 2,
    };
  }
  if (action === 'accept-over-objections') {
    return {
      artifact_path: 'docs/artifact.md',
      artifact_blob: '7'.repeat(40),
      artifact_digest: `sha256:${'8'.repeat(64)}`,
      final_round: 1,
      reviewer_response_path: 'reviews/reviewer-response-1.md',
      reviewer_response_digest: `sha256:${'4'.repeat(64)}`,
      unresolved_finding_ids: ['finding-001'],
      human_rationale_digest: `sha256:${'a'.repeat(64)}`,
    };
  }
  throw new Error(`unsupported protected action: ${action}`);
}

const payloads = {
  'review-created': () => ({
    commit_mode: 'normal',
    max_turns: 2,
    claim_ttl_ms: 8 * 60 * 60 * 1000,
    authority: {
      authority_policy: 'unavailable',
      challenge_ttl_ms: 15 * 60 * 1000,
      verifier: null,
    },
    artifact: {
      path: 'docs/artifact.md',
      head: '1'.repeat(40),
      blob: '2'.repeat(40),
      digest: `sha256:${'3'.repeat(64)}`,
    },
    author: participant('author'),
    startup: {
      context: {
        schema: 'ai-peer-review.context/v1',
        review_id: 'review-01',
        repository_root: '/repo',
        artifact_kind: 'spec',
        artifact_name: 'artifact',
        review_date: '2026-09-08',
        reviews_root: 'docs/reviews',
        review_path_template: '<kind>/<date>-<name>-<review-id>',
        issue: null,
      },
      context_digest: `sha256:${'a'.repeat(64)}`,
      destination: 'docs/reviews/spec/2026-09-08-artifact-review-01',
      author_startup_digest: `sha256:${'b'.repeat(64)}`,
      reviewer_invitation_digest: `sha256:${'c'.repeat(64)}`,
      transport_mode: 'manual',
      author_transport_capability: 'manual',
      no_commit_baseline: null,
      bootstrap: null,
    },
  }),
  'reviewer-joined': () => ({
    reviewer: participant('reviewer'),
    transport_capability: 'manual',
    repository_boundary: {
      head: '1'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'1'.repeat(64)}`,
      refs_digest: `sha256:${'3'.repeat(64)}`,
      worktree_digest: `sha256:${'2'.repeat(64)}`,
    },
  }),
  'reviewer-revisions-requested': () => ({
    turn: 1,
    response: { path: 'reviews/reviewer-response-1.md', digest: `sha256:${'4'.repeat(64)}` },
    finding_ids: ['finding-001'],
  }),
  'reviewer-accepted': () => ({
    turn: 1,
    response: { path: 'reviews/reviewer-response-1.md', digest: `sha256:${'5'.repeat(64)}` },
    finding_ids: [],
  }),
  'author-revision-committed': () => ({
    turn: 1,
    response: { path: 'reviews/author-response-1.md', digest: `sha256:${'6'.repeat(64)}` },
    artifact: {
      path: 'docs/artifact.md',
      blob: '7'.repeat(40),
      digest: `sha256:${'8'.repeat(64)}`,
    },
    commit: '9'.repeat(40),
    repository_boundary: {
      head: '9'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
  }),
  'author-revision-sealed-no-commit': () => ({
    turn: 1,
    response: { path: 'reviews/author-response-1.md', digest: `sha256:${'6'.repeat(64)}` },
    artifact: {
      path: 'docs/artifact.md',
      blob: '7'.repeat(40),
      digest: `sha256:${'8'.repeat(64)}`,
    },
    snapshot: { path: 'artifacts/turn-1.md', digest: `sha256:${'8'.repeat(64)}` },
    repository_boundary: {
      head: '1'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
  }),
  'author-closing-round-committed': () => ({
    turn: 1,
    response: { path: 'reviews/author-response-1.md', digest: `sha256:${'6'.repeat(64)}` },
    artifact: {
      path: 'docs/artifact.md',
      blob: '7'.repeat(40),
      digest: `sha256:${'8'.repeat(64)}`,
    },
    commit: '9'.repeat(40),
    repository_boundary: {
      head: '9'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
    intervention_id: 'intervention-budget',
    reason: 'turn-budget-exhausted',
    interrupted_state: 'reviewer-turn',
  }),
  'author-closing-round-sealed-no-commit': () => ({
    turn: 1,
    response: { path: 'reviews/author-response-1.md', digest: `sha256:${'6'.repeat(64)}` },
    artifact: {
      path: 'docs/artifact.md',
      blob: '7'.repeat(40),
      digest: `sha256:${'8'.repeat(64)}`,
    },
    snapshot: { path: 'artifacts/turn-1.md', digest: `sha256:${'8'.repeat(64)}` },
    repository_boundary: {
      head: '1'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
    intervention_id: 'intervention-budget',
    reason: 'turn-budget-exhausted',
    interrupted_state: 'reviewer-turn',
  }),
  'finalization-started': () => ({}),
  'acceptance-committed': () => ({
    terminal: { commit: 'a'.repeat(40), manifest_digest: `sha256:${'b'.repeat(64)}` },
  }),
  'acceptance-sealed-no-commit': () => ({
    terminal: {
      snapshot_digest: `sha256:${'c'.repeat(64)}`,
      manifest_digest: `sha256:${'d'.repeat(64)}`,
    },
  }),
  'phase-acceptance-committed': () => ({
    cursor: 0,
    kind: 'spec',
    artifact: {
      path: 'docs/artifact.md',
      blob: '2'.repeat(40),
      digest: `sha256:${'3'.repeat(64)}`,
    },
    manifest: {
      path: 'reviews/phase-01-spec-review-manifest.md',
      digest: `sha256:${'b'.repeat(64)}`,
    },
    commit: 'a'.repeat(40),
  }),
  'phase-acceptance-sealed-no-commit': () => ({
    cursor: 0,
    kind: 'spec',
    artifact: {
      path: 'docs/artifact.md',
      blob: '2'.repeat(40),
      digest: `sha256:${'3'.repeat(64)}`,
    },
    manifest: {
      path: 'reviews/phase-01-spec-review-manifest.md',
      digest: `sha256:${'b'.repeat(64)}`,
    },
    snapshot: {
      path: 'artifacts/phase-01-spec.md',
      digest: `sha256:${'3'.repeat(64)}`,
    },
  }),
  'phase-artifact-committed': () => ({
    cursor: 1,
    kind: 'plan',
    artifact: {
      path: 'docs/plan.md',
      blob: 'c'.repeat(40),
      digest: `sha256:${'d'.repeat(64)}`,
    },
    commit: 'e'.repeat(40),
    repository_boundary: {
      head: 'e'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
  }),
  'phase-artifact-sealed-no-commit': () => ({
    cursor: 1,
    kind: 'plan',
    artifact: {
      path: 'docs/plan.md',
      blob: 'c'.repeat(40),
      digest: `sha256:${'d'.repeat(64)}`,
    },
    snapshot: {
      path: 'artifacts/phase-02-plan.md',
      digest: `sha256:${'d'.repeat(64)}`,
    },
    repository_boundary: {
      head: '1'.repeat(40),
      branch: 'trunk',
      index_digest: `sha256:${'9'.repeat(64)}`,
      refs_digest: `sha256:${'b'.repeat(64)}`,
      worktree_digest: `sha256:${'a'.repeat(64)}`,
    },
  }),
  'intervention-entered': () => ({
    intervention_id: 'intervention-stale',
    reason: 'stale-claim',
    interrupted_state: 'reviewer-turn',
  }),
  'continued-to-reviewer': () => ({
    intervention_id: 'intervention-budget',
    additional_turns: 1,
    effective_max_turns: 3,
    parameters: protectedParameters('continue'),
    attestation: attestation(),
  }),
  'continued-to-author': () => ({
    intervention_id: 'intervention-budget',
    additional_turns: 1,
    effective_max_turns: 3,
    parameters: protectedParameters('continue', { resumeRole: 'author' }),
    attestation: attestation(),
  }),
  'same-session-reclaim': () => ({
    intervention_id: 'intervention-stale',
    old_claim: claim('reviewer'),
    new_claim: claim('reviewer', {
      claimId: 'claim-new',
      claimedAt: '2026-09-08T12:01:00.000Z',
      lastActivityAt: '2026-09-08T12:01:00.000Z',
      expiresAt: '2026-09-08T20:01:00.000Z',
    }),
  }),
  'participant-replaced': () => ({
    intervention_id: 'intervention-loss',
    role: 'reviewer',
    outgoing_claim: claim('reviewer'),
    incoming_participant: participant('reviewer', FINGERPRINTS.replacement),
    parameters: protectedParameters('replace-participant'),
    attestation: attestation(),
  }),
  'override-committed': () => ({
    intervention_id: 'intervention-budget',
    terminal: { commit: 'a'.repeat(40), manifest_digest: `sha256:${'b'.repeat(64)}` },
    parameters: protectedParameters('accept-over-objections'),
    attestation: attestation(),
  }),
  'override-sealed-no-commit': () => ({
    intervention_id: 'intervention-budget',
    terminal: {
      snapshot_digest: `sha256:${'c'.repeat(64)}`,
      manifest_digest: `sha256:${'d'.repeat(64)}`,
    },
    parameters: protectedParameters('accept-over-objections'),
    attestation: attestation(),
  }),
  abandoned: () => ({
    intervention_id: 'intervention-budget',
    reason: 'operator ended review',
    retained_paths: [],
  }),
  superseded: () => ({
    reason: 'replacement attempt started',
    successor_review_id: 'review-02',
    retained_paths: [],
  }),
  'turn-claimed': () => ({
    claim: claim('reviewer'),
  }),
  'identity-changed': () => ({ role: 'reviewer', identity: participant('reviewer') }),
  'challenge-requested': () => ({
    challenge: {
      schema: 'ai-peer-review.grant-challenge/v1',
      challenge_id: 'challenge-1',
      review_id: 'review-01',
      intervention_id: 'intervention-stale-claim',
      protocol_revision: 3,
      action: 'continue',
      parameters_digest: `sha256:${'c'.repeat(64)}`,
      nonce: 'n'.repeat(43),
      expires_at: '2026-09-09T12:00:00.000Z',
    },
  }),
  'challenge-superseded': () => ({ challenge_id: 'challenge-1' }),
  'supplement-registered': () => ({
    supplement: {
      supplement_id: 'supplement-1',
      digest: `sha256:${'e'.repeat(64)}`,
      target_role: 'reviewer',
      target_turn: 2,
      content_retention: 'scratch-only',
      acknowledged_at: null,
      parameters: protectedParameters('supplement'),
      attestation: attestation(),
    },
  }),
  'delivery-written': () => ({
    delivery: {
      delivery_id: 'delivery-1',
      recipient: 'reviewer',
      digest: `sha256:${'f'.repeat(64)}`,
    },
  }),
  'delivery-acknowledged': () => ({ delivery_id: 'delivery-1' }),
};

export const REVISION_NEUTRAL_TYPES = new Set([
  'same-session-reclaim',
  'turn-claimed',
  'identity-changed',
  'challenge-requested',
  'challenge-superseded',
  'delivery-written',
  'delivery-acknowledged',
]);

export function event(
  type,
  { sequence = 1, revision, reviewId = 'review-01', actor, payload = {} } = {}
) {
  const effectiveRevision = revision ?? (REVISION_NEUTRAL_TYPES.has(type) ? 0 : 1);
  const effectivePayload = { ...payloads[type]?.(), ...payload };
  if (type === 'review-created' && effectivePayload.startup) {
    effectivePayload.startup = {
      ...effectivePayload.startup,
      context: { ...effectivePayload.startup.context, review_id: reviewId },
    };
  }
  const effectiveActor =
    actor ??
    (type === 'review-created'
      ? 'system'
      : ['reviewer-joined', 'reviewer-revisions-requested', 'reviewer-accepted'].includes(type)
        ? FINGERPRINTS.reviewer
        : type === 'turn-claimed'
          ? (effectivePayload.claim?.session_fingerprint ?? FINGERPRINTS.author)
          : type === 'identity-changed'
            ? (effectivePayload.identity?.session_fingerprint ?? FINGERPRINTS.author)
            : FINGERPRINTS.author);
  return {
    schema: 'ai-peer-review.event/v1',
    review_id: reviewId,
    sequence,
    revision: effectiveRevision,
    type,
    actor: effectiveActor,
    at: new Date(Date.UTC(2026, 8, 8, 12, 0, sequence)).toISOString(),
    payload: effectivePayload,
  };
}

export function sequence(types, overrides = {}) {
  let revision = 0;
  return types.map((type, index) => {
    if (!REVISION_NEUTRAL_TYPES.has(type)) revision += 1;
    return event(type, { sequence: index + 1, revision, ...(overrides[index] ?? {}) });
  });
}

export const reviewerTurnEvents = () =>
  sequence(['review-created', 'reviewer-joined'], {
    1: { actor: FINGERPRINTS.reviewer },
  });
export const authorRevisionEvents = () =>
  sequence(
    [
      'review-created',
      'reviewer-joined',
      'turn-claimed',
      'reviewer-revisions-requested',
      'turn-claimed',
    ],
    {
      1: { actor: FINGERPRINTS.reviewer },
      2: {
        actor: FINGERPRINTS.reviewer,
        payload: { claim: claim('reviewer') },
      },
      3: { actor: FINGERPRINTS.reviewer },
      4: { actor: FINGERPRINTS.author, payload: { claim: claim('author') } },
    }
  );
export const acceptancePendingEvents = () =>
  sequence(['review-created', 'reviewer-joined', 'turn-claimed', 'reviewer-accepted'], {
    1: { actor: FINGERPRINTS.reviewer },
    2: {
      actor: FINGERPRINTS.reviewer,
      payload: { claim: claim('reviewer') },
    },
    3: { actor: FINGERPRINTS.reviewer },
  });
export const interventionEvents = (reason, interruptedState = 'reviewer-turn') => {
  const prefix =
    interruptedState === 'author-revision' ? authorRevisionEvents() : reviewerTurnEvents();
  const role = interruptedState === 'author-revision' ? 'author' : 'reviewer';
  const prepared =
    interruptedState === 'author-revision'
      ? prefix
      : [
          ...prefix,
          event('turn-claimed', {
            sequence: prefix.length + 1,
            revision: prefix.at(-1).revision,
            actor: FINGERPRINTS.reviewer,
            payload: { claim: claim(role) },
          }),
        ];
  return [
    ...prepared,
    event('intervention-entered', {
      sequence: prepared.length + 1,
      revision: prepared.at(-1).revision + 1,
      payload: {
        intervention_id: `intervention-${reason}`,
        reason,
        interrupted_state: interruptedState,
      },
    }),
  ];
};

export async function createReviewWorkspace({ repository, events }) {
  const parent = mkdtempSync(path.join(tmpdir(), 'ai-peer-review-workspace-'));
  const root = path.join(parent, 'repository');
  mkdirSync(root);
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore', shell: false });
  const gitDirectory = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  }).trim();
  writeFileSync(path.resolve(root, gitDirectory, 'info', 'exclude'), '.scratch/peer-review/\n');
  const workspace = path.join(root, '.scratch', 'peer-review', events[0]?.review_id ?? 'review-01');
  mkdirSync(workspace, { recursive: true });
  const repositoryBoundary = repository ?? createGitRepository();
  if (!repositoryBoundary.checkIgnored(root, '.scratch/peer-review/probe')) {
    throw new Error('review fixture scratch workspace is not ignored');
  }
  for (const item of events) await appendEvent(path.join(workspace, 'events.jsonl'), item);
  const state = reduceEvents(events);
  atomicWrite(
    path.join(workspace, 'protocol.json'),
    Buffer.from(`${JSON.stringify(state.protocol, null, 2)}\n`)
  );
  atomicWrite(
    path.join(workspace, 'participants.json'),
    Buffer.from(`${JSON.stringify(state.participants, null, 2)}\n`)
  );
  return {
    repository: repositoryBoundary,
    parent,
    root,
    workspace,
    events: path.join(workspace, 'events.jsonl'),
    protocol: path.join(workspace, 'protocol.json'),
    participants: path.join(workspace, 'participants.json'),
    state,
    readEvents: () => readFileSync(path.join(workspace, 'events.jsonl'), 'utf8'),
    cleanup: () => rmSync(parent, { recursive: true, force: true }),
  };
}
