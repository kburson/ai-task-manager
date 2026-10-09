import { createHash } from 'node:crypto';

import { AprError } from '../errors.mjs';
import { hydrateTemplate } from '../templates/index.mjs';

const AUTHOR_HANDOFFS = new Set([
  'author-revision-committed',
  'author-closing-round-committed',
  'author-revision-sealed-no-commit',
  'author-closing-round-sealed-no-commit',
]);
const REVIEWER_DECISIONS = new Set(['reviewer-revisions-requested', 'reviewer-accepted']);

function fail(message, details = {}) {
  throw new AprError('APR_MANIFEST_INVALID', message, {
    recovery: 'Rebuild finalization evidence from the complete event-authoritative review.',
    details,
  });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])])
    );
  }
  return value;
}

function canonical(value) {
  return `${JSON.stringify(ordered(value), null, 2)}\n`;
}

function exactKeys(value, keys, label) {
  const actual =
    value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [];
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} does not match the closed manifest schema.`, { fields: actual });
  }
}

function deepFreeze(value) {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function reviewParts(review) {
  const state = review?.state ?? review;
  const protocol = state?.protocol;
  const events = review?.events;
  if (!protocol || !state?.participants || !Array.isArray(events) || events.length === 0) {
    fail('Manifest construction requires reduced state and its complete event history.');
  }
  return { state, protocol, events };
}

function safeParticipant(participant) {
  if (!participant) return null;
  return Object.fromEntries(
    [
      'role',
      'host',
      'provider',
      'model_id',
      'model_display',
      'session_fingerprint',
      'identity_source',
      'joined_at',
    ].map((key) => [key, participant[key]])
  );
}

function safeClaim(claim) {
  return Object.fromEntries(
    [
      'claim_id',
      'role',
      'session_fingerprint',
      'host',
      'claimed_at',
      'last_activity_at',
      'expires_at',
    ].map((key) => [key, claim[key]])
  );
}

function turnsFrom(events) {
  const turns = new Map();
  for (const event of events) {
    if (REVIEWER_DECISIONS.has(event.type)) {
      turns.set(event.payload.turn, {
        turn: event.payload.turn,
        decision: event.type === 'reviewer-accepted' ? 'accepted' : 'revisions-requested',
        reviewer_response: { ...event.payload.response },
        finding_ids: [...event.payload.finding_ids],
        author_response: null,
        artifact: null,
        commit: null,
        snapshot: null,
      });
    }
    if (AUTHOR_HANDOFFS.has(event.type)) {
      const turn = turns.get(event.payload.turn);
      if (!turn)
        fail('Author handoff has no preceding reviewer decision.', { sequence: event.sequence });
      turn.author_response = { ...event.payload.response };
      turn.artifact = { ...event.payload.artifact };
      turn.commit = event.payload.commit ?? null;
      turn.snapshot = event.payload.snapshot ? { ...event.payload.snapshot } : null;
    }
  }
  return [...turns.values()].sort((left, right) => left.turn - right.turn);
}

function artifactHistory(events) {
  const created = events[0];
  const history = [
    {
      turn: 0,
      path: created.payload.artifact.path,
      commit: created.payload.artifact.head,
      blob: created.payload.artifact.blob,
      digest: created.payload.artifact.digest,
      snapshot: null,
    },
  ];
  for (const event of events.filter((candidate) => AUTHOR_HANDOFFS.has(candidate.type))) {
    history.push({
      turn: event.payload.turn,
      path: event.payload.artifact.path,
      commit: event.payload.commit ?? null,
      blob: event.payload.artifact.blob,
      digest: event.payload.artifact.digest,
      snapshot: event.payload.snapshot ? { ...event.payload.snapshot } : null,
    });
  }
  return history;
}

function identityChanges(events) {
  return events
    .filter((event) => event.type === 'identity-changed')
    .map((event) => ({
      sequence: event.sequence,
      role: event.payload.role,
      identity: safeParticipant(event.payload.identity),
    }));
}

function recoveryHistory(events) {
  return events
    .filter((event) =>
      [
        'same-session-reclaim',
        'participant-replaced',
        'continued-to-reviewer',
        'continued-to-author',
      ].includes(event.type)
    )
    .map((event) => ({
      sequence: event.sequence,
      type: event.type,
      role: event.payload.role ?? event.payload.new_claim?.role ?? null,
      outgoing_session_fingerprint:
        event.payload.outgoing_claim?.session_fingerprint ??
        event.payload.old_claim?.session_fingerprint ??
        null,
      incoming_session_fingerprint:
        event.payload.incoming_participant?.session_fingerprint ??
        event.payload.new_claim?.session_fingerprint ??
        null,
      attestation: event.payload.attestation ? { ...event.payload.attestation } : null,
    }));
}

function supplementHistory(protocol, events) {
  return (protocol.supplements ?? []).map((supplement) => {
    const acknowledgment = events.find((event) => {
      const role = ['reviewer-revisions-requested', 'reviewer-accepted'].includes(event.type)
        ? 'reviewer'
        : AUTHOR_HANDOFFS.has(event.type)
          ? 'author'
          : null;
      return (
        role === supplement.target_role &&
        event.payload.turn === supplement.target_turn &&
        event.at === supplement.acknowledged_at
      );
    });
    return {
      ...structuredClone(supplement),
      acknowledgment_response: acknowledgment ? { ...acknowledgment.payload.response } : null,
    };
  });
}

function assertManifestTruth(model, { closed = false } = {}) {
  if (closed) {
    exactKeys(
      model,
      [
        'schema',
        'review_id',
        'record_id',
        'status',
        'acceptance_basis',
        'commit_mode',
        'authority_assurance',
        'residual_risk',
        'startup_commit',
        'final_commit',
        'artifact_path',
        'artifact_history',
        'participants',
        'turns',
        'identity_changes',
        'claims',
        'recoveries',
        'supplements',
        'authority',
        'human_decision',
        ...(model.runtime === undefined ? [] : ['runtime']),
      ],
      'Manifest model'
    );
  }
  if (model.schema !== 'ai-peer-review.manifest/v1') fail('Manifest model schema is invalid.');
  const key = `${model.commit_mode}|${model.acceptance_basis}`;
  const expectedStatus = {
    'normal|reviewer-consensus': 'accepted',
    'normal|human-override': 'accepted-over-objections',
    'no-commit|reviewer-consensus': 'accepted-uncommitted',
    'no-commit|human-override': 'accepted-over-objections-uncommitted',
  }[key];
  if (
    expectedStatus === undefined ||
    ![
      'accepted',
      'accepted-uncommitted',
      'accepted-over-objections',
      'accepted-over-objections-uncommitted',
    ].includes(model.status)
  ) {
    fail('Manifest mode, acceptance basis, or status is outside the closed terminal enums.');
  }
  const needsCommit = model.commit_mode === 'normal';
  const needsDecision = model.acceptance_basis === 'human-override';
  if (
    model.status !== expectedStatus ||
    (needsCommit ? typeof model.final_commit !== 'string' : model.final_commit !== null) ||
    (needsDecision ? model.human_decision === null : model.human_decision !== null)
  ) {
    fail('Manifest terminal fields contradict their mode or acceptance authority.');
  }
  return model;
}

function safeVerifier(verifier) {
  if (!verifier) return null;
  return Object.fromEntries(
    ['kind', 'verifier_id', 'verifier_fingerprint', 'assurance_grade', 'signer_strength'].map(
      (key) => [key, verifier[key]]
    )
  );
}

export function buildManifest(review) {
  const { state, protocol, events } = reviewParts(review);
  const status = review.status;
  const acceptanceBasis = review.acceptance_basis;
  if (
    ![
      'accepted',
      'accepted-uncommitted',
      'accepted-over-objections',
      'accepted-over-objections-uncommitted',
    ].includes(status) ||
    !['reviewer-consensus', 'human-override'].includes(acceptanceBasis)
  ) {
    fail('Manifest terminal status or acceptance basis is invalid.');
  }
  const assurance =
    review.human_decision?.human_attestation?.strength ??
    protocol.authority?.verifier?.signer_strength ??
    'unavailable';
  const residualRisk = [];
  if (protocol.commit_mode === 'no-commit') residualRisk.push('uncommitted-test-evidence');
  if (assurance === 'unavailable') residualRisk.push('human-authority-unavailable');
  if (['cryptographic-local', 'unverified-test'].includes(assurance)) {
    residualRisk.push('detection-grade-authority');
  }
  const model = {
    schema: 'ai-peer-review.manifest/v1',
    review_id: protocol.review_id,
    record_id: protocol.startup?.context?.record_id ?? protocol.review_id,
    status,
    acceptance_basis: acceptanceBasis,
    commit_mode: protocol.commit_mode,
    authority_assurance: assurance,
    residual_risk: residualRisk,
    startup_commit: events[0].payload.artifact.head,
    final_commit: review.final_commit ?? null,
    artifact_path: protocol.artifact.path,
    artifact_history: artifactHistory(events),
    participants: {
      author: safeParticipant(state.participants.author),
      reviewer: safeParticipant(state.participants.reviewer),
    },
    turns: turnsFrom(events),
    identity_changes: identityChanges(events),
    claims: events
      .filter((event) => event.type === 'turn-claimed')
      .map((event) => safeClaim(event.payload.claim)),
    recoveries: recoveryHistory(events),
    supplements: supplementHistory(protocol, events),
    authority: {
      policy: protocol.authority?.authority_policy ?? 'unavailable',
      verifier: safeVerifier(protocol.authority?.verifier),
      acceptance_attestation: review.human_decision?.human_attestation
        ? structuredClone(review.human_decision.human_attestation)
        : null,
    },
    human_decision: review.human_decision ? structuredClone(review.human_decision) : null,
    ...(protocol.startup?.runtime ? { runtime: structuredClone(protocol.startup.runtime) } : {}),
  };
  return deepFreeze(assertManifestTruth(model, { closed: true }));
}

export function buildPhaseManifest(review) {
  const { state, protocol, events } = reviewParts(review);
  const phase = protocol.phases;
  if (!phase || phase.cursor < 0 || phase.cursor >= phase.kinds.length - 1) {
    fail('Phase manifest requires one accepted non-final phased artifact.');
  }
  const boundaryIndex =
    phase.cursor === 0
      ? 0
      : events.findLastIndex(
          (event) =>
            ['phase-artifact-committed', 'phase-artifact-sealed-no-commit'].includes(event.type) &&
            event.payload.cursor === phase.cursor
        );
  if (boundaryIndex < 0) fail('Phase manifest cannot locate current artifact authority.');
  const phaseEvents = events.slice(boundaryIndex);
  const entry = events[boundaryIndex];
  const assurance = protocol.authority?.verifier?.signer_strength ?? 'unavailable';
  const residualRisk = [];
  if (protocol.commit_mode === 'no-commit') residualRisk.push('uncommitted-test-evidence');
  if (assurance === 'unavailable') residualRisk.push('human-authority-unavailable');
  if (['cryptographic-local', 'unverified-test'].includes(assurance)) {
    residualRisk.push('detection-grade-authority');
  }
  const entryArtifact = entry.payload.artifact;
  const phaseStartCommit =
    phase.cursor === 0
      ? entryArtifact.head
      : (entry.payload.commit ?? entry.payload.repository_boundary?.head ?? null);
  const model = {
    schema: 'ai-peer-review.phase-manifest/v1',
    review_id: protocol.review_id,
    record_id: protocol.startup?.context?.record_id ?? protocol.review_id,
    phase_index: phase.cursor,
    phase_kind: phase.current_kind,
    phase_status: 'accepted',
    commit_mode: protocol.commit_mode,
    authority_assurance: assurance,
    residual_risk: residualRisk,
    phase_start_commit: phaseStartCommit,
    final_commit: review.final_commit ?? null,
    artifact_path: protocol.artifact.path,
    artifact_history: [
      {
        turn: protocol.turns_used - protocol.phases.phase_turns_used,
        path: entryArtifact.path,
        commit: phaseStartCommit,
        blob: entryArtifact.blob,
        digest: entryArtifact.digest,
        snapshot: entry.payload.snapshot ? { ...entry.payload.snapshot } : null,
      },
      ...artifactHistory(phaseEvents)
        .slice(phase.cursor === 0 ? 1 : 0)
        .filter((item) => item.path === protocol.artifact.path),
    ],
    participants: {
      author: safeParticipant(state.participants.author),
      reviewer: safeParticipant(state.participants.reviewer),
    },
    turns: turnsFrom(phaseEvents),
    identity_changes: identityChanges(phaseEvents),
    claims: phaseEvents
      .filter((event) => event.type === 'turn-claimed')
      .map((event) => safeClaim(event.payload.claim)),
    recoveries: recoveryHistory(phaseEvents),
    supplements: supplementHistory(protocol, phaseEvents),
    authority: {
      policy: protocol.authority?.authority_policy ?? 'unavailable',
      verifier: safeVerifier(protocol.authority?.verifier),
    },
  };
  exactKeys(
    model,
    [
      'schema',
      'review_id',
      'record_id',
      'phase_index',
      'phase_kind',
      'phase_status',
      'commit_mode',
      'authority_assurance',
      'residual_risk',
      'phase_start_commit',
      'final_commit',
      'artifact_path',
      'artifact_history',
      'participants',
      'turns',
      'identity_changes',
      'claims',
      'recoveries',
      'supplements',
      'authority',
    ],
    'Phase manifest model'
  );
  return deepFreeze(model);
}

export function sealPhaseManifest(model, { path: relative } = {}) {
  if (
    model?.schema !== 'ai-peer-review.phase-manifest/v1' ||
    model.phase_status !== 'accepted' ||
    typeof relative !== 'string' ||
    relative.length === 0
  ) {
    fail('Phase manifest seal is invalid.');
  }
  const bytes = Buffer.from(`# Phase Review Manifest\n\n\`\`\`json\n${canonical(model)}\`\`\`\n`);
  return deepFreeze({ path: relative, bytes, digest: sha256(bytes), mode: '100644', model });
}

export function renderManifest(model) {
  assertManifestTruth(model);
  const modeBanner =
    model.commit_mode === 'no-commit'
      ? `> **NO-COMMIT TEST MODE** — authority assurance: \`${model.authority_assurance}\``
      : 'Mode: `normal`';
  return hydrateTemplate('review-manifest', {
    mode_banner: modeBanner,
    manifest_body: `\`\`\`json\n${canonical(model)}\`\`\``,
  });
}

function decisionFrontmatter(model) {
  const lines = [
    '---',
    `schema: ${model.schema}`,
    `review_id: ${JSON.stringify(model.review_id)}`,
    `decision: ${model.decision}`,
    `artifact_path: ${JSON.stringify(model.artifact_path)}`,
    `artifact_commit: ${model.artifact_commit === null ? 'null' : model.artifact_commit}`,
    `artifact_blob: ${model.artifact_blob}`,
    `artifact_digest: ${model.artifact_digest}`,
    'unresolved_findings:',
  ];
  for (const unresolved of model.unresolved_findings) {
    lines.push(
      `  - reviewer_response_path: ${JSON.stringify(unresolved.reviewer_response_path)}`,
      `    reviewer_response_digest: ${unresolved.reviewer_response_digest}`,
      `    finding_ids: ${JSON.stringify(unresolved.finding_ids)}`
    );
  }
  lines.push('human_attestation:');
  for (const key of [
    'source',
    'strength',
    'signer_id',
    'signer_fingerprint',
    'challenge_digest',
    'verified_at',
  ]) {
    lines.push(`  ${key}: ${JSON.stringify(model.human_attestation[key])}`);
  }
  lines.push(`decided_at: ${JSON.stringify(model.decided_at)}`, '---');
  return lines.join('\n');
}

export function sealHumanDecision(input) {
  const { protocol, events } = reviewParts({ state: input.state, events: input.events });
  const reviewer = [...events].reverse().find((event) => REVIEWER_DECISIONS.has(event.type));
  const parameters = input.parameters;
  if (
    !reviewer ||
    reviewer.type !== 'reviewer-revisions-requested' ||
    parameters?.artifact_path !== protocol.artifact.path ||
    parameters.artifact_blob !== protocol.artifact.blob ||
    parameters.artifact_digest !== protocol.artifact.digest ||
    parameters.final_round !== reviewer.payload.turn ||
    parameters.reviewer_response_path !== reviewer.payload.response.path ||
    parameters.reviewer_response_digest !== reviewer.payload.response.digest ||
    canonical(parameters.unresolved_finding_ids) !== canonical(reviewer.payload.finding_ids)
  ) {
    fail('Human decision parameters differ from unresolved event authority.');
  }
  if (!Buffer.isBuffer(input.rationale_bytes)) {
    fail('Human decision requires canonical signed rationale bytes.');
  }
  let rationaleText;
  try {
    rationaleText = new TextDecoder('utf-8', { fatal: true }).decode(input.rationale_bytes);
  } catch {
    fail('Human decision rationale is not valid UTF-8.');
  }
  const normalizedRationale = Buffer.from(
    `${rationaleText.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n').trimEnd()}\n`
  );
  if (!rationaleText.trim() || sha256(normalizedRationale) !== parameters.human_rationale_digest) {
    fail('Human decision rationale differs from signed authority.');
  }
  const model = deepFreeze({
    schema: 'ai-peer-review.human-decision/v1',
    review_id: protocol.review_id,
    decision: 'accepted-over-objections',
    artifact_path: protocol.artifact.path,
    artifact_commit: protocol.commit_mode === 'normal' ? protocol.artifact.head : null,
    artifact_blob: protocol.artifact.blob,
    artifact_digest: protocol.artifact.digest,
    unresolved_findings: [
      {
        reviewer_response_path: reviewer.payload.response.path,
        reviewer_response_digest: reviewer.payload.response.digest,
        finding_ids: [...reviewer.payload.finding_ids],
      },
    ],
    human_attestation: { ...input.attestation },
    decided_at: input.decided_at,
  });
  const rationale = [
    normalizedRationale.toString('utf8').trimEnd(),
    '',
    `human_rationale_digest: ${parameters.human_rationale_digest}`,
    '',
    'Unresolved findings accepted by Human Authority:',
    '',
    ...parameters.unresolved_finding_ids.map((findingId) => `- ${findingId}`),
  ].join('\n');
  const assurance = input.attestation.strength;
  const bytes = hydrateTemplate('human-decision', {
    frontmatter: decisionFrontmatter(model),
    mode_banner:
      protocol.commit_mode === 'no-commit'
        ? `> **NO-COMMIT TEST MODE** — authority assurance: \`${assurance}\``
        : 'Mode: `normal`',
    human_rationale: rationale,
  });
  return deepFreeze({
    model,
    path: input.path,
    bytes,
    digest: sha256(bytes),
    mode: '100644',
  });
}

export function sealManifest(model, { path: relative = 'review-manifest.md' } = {}) {
  assertManifestTruth(model, { closed: true });
  const bytes = renderManifest(model);
  return deepFreeze({ path: relative, bytes, digest: sha256(bytes), mode: '100644', model });
}

export function pathsToSeals(items, { expected_head: expectedHead } = {}) {
  if (!Array.isArray(items) || items.length === 0 || typeof expectedHead !== 'string') {
    fail('Finalization path seals and expected HEAD are required.');
  }
  return deepFreeze({
    expected_head: expectedHead,
    paths: items.map(({ path: relative, bytes, digest, mode = '100644' }) => ({
      path: relative,
      bytes,
      digest,
      mode,
    })),
    commit_paths: items.map((item) => item.path),
  });
}

export function finalMessage(review) {
  const protocol = review?.protocol ?? review?.state?.protocol;
  if (!protocol?.review_id) fail('Final commit message requires review authority.');
  return `chore: finalize peer review ${protocol.review_id}`;
}

export function finalTrailers({ state, acceptance, manifest }) {
  const protocol = state?.protocol ?? state;
  if (!protocol?.review_id || !acceptance?.digest || !manifest?.digest) {
    fail('Final commit trailers require sealed acceptance and manifest evidence.');
  }
  return deepFreeze({
    'Peer-Review-ID': protocol.review_id,
    // Author handoffs already own the journal key for turns_used. Finalization
    // is the next exact-path transaction and must have its own durable key.
    'Peer-Review-Turn': String(protocol.turns_used + 1),
    'Peer-Review-Artifact-Blob': protocol.artifact.blob,
    'Peer-Review-Acceptance': acceptance.digest,
    'Peer-Review-Manifest': manifest.digest,
  });
}
