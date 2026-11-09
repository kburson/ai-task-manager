import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptancePendingEvents,
  attestation,
  authorRevisionEvents,
  event,
  FINGERPRINTS,
  protectedParameters,
} from '../helpers/review-fixture.mjs';
import { reduceEvents } from '../../src/protocol/reducer.mjs';
import {
  buildPhaseManifest,
  buildManifest,
  finalMessage,
  finalTrailers,
  pathsToSeals,
  renderManifest,
  sealHumanDecision,
  sealManifest,
  sealPhaseManifest,
} from '../../src/manifest/render.mjs';

function review(events, overrides = {}) {
  return { state: reduceEvents(events), events, ...overrides };
}

test('manifest schema is closed and covers both terminal authority paths', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/manifest-v1.json', import.meta.url), 'utf8')
  );
  assert.equal(schema.$id, 'ai-peer-review.manifest/v1');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required.includes('record_id'), true);
  assert.deepEqual(schema.properties.record_id, { $ref: '#/$defs/id' });
  assert.deepEqual(schema.properties.acceptance_basis.enum, [
    'reviewer-consensus',
    'human-override',
  ]);
  assert.equal(schema.$defs.participant.additionalProperties, false);
  assert.equal(schema.$defs.claim.properties.pid, undefined);
});

test('phase manifest schema is closed and nonterminal', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/phase-manifest-v1.json', import.meta.url), 'utf8')
  );
  assert.equal(schema.$id, 'ai-peer-review.phase-manifest/v1');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.required.includes('phase_status'), true);
  assert.equal(schema.properties.phase_status.const, 'accepted');
  assert.equal(Object.hasOwn(schema.properties, 'status'), false);
});

test('manifest rendering is deterministic, ordered, and privacy bounded', () => {
  const events = acceptancePendingEvents();
  events[0].payload.startup.context.record_id = 'record-stable';
  const model = buildManifest(
    review(events, {
      status: 'accepted',
      acceptance_basis: 'reviewer-consensus',
      final_commit: events[0].payload.artifact.head,
    })
  );
  const first = renderManifest(model);
  const second = renderManifest(structuredClone(model));
  assert.deepEqual(second, first);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(model.record_id, 'record-stable');
  assert.equal(model.turns[0].decision, 'accepted');
  assert.equal(model.artifact_history[0].commit, events[0].payload.artifact.head);
  assert.doesNotMatch(first.toString(), /session_id|transcript|token|ipc|private_key/i);
  assert.match(first.toString(), /reviewer-consensus/);
});

test('manifest preserves legacy omission and emits a newly sealed runtime descriptor', () => {
  const events = acceptancePendingEvents();
  const legacy = buildManifest(
    review(events, {
      status: 'accepted',
      acceptance_basis: 'reviewer-consensus',
      final_commit: events[0].payload.artifact.head,
    })
  );
  assert.equal(Object.hasOwn(legacy, 'runtime'), false);
  events[0].payload.startup.runtime = {
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
  const sealed = buildManifest(
    review(events, {
      status: 'accepted',
      acceptance_basis: 'reviewer-consensus',
      final_commit: events[0].payload.artifact.head,
    })
  );
  assert.deepEqual(sealed.runtime, events[0].payload.startup.runtime);
});

test('phase manifest binds one current phase without claiming terminal authority', () => {
  const events = acceptancePendingEvents();
  events[0].payload.phases = { kinds: ['spec', 'plan'] };
  const state = reduceEvents(events);
  const model = buildPhaseManifest({
    state,
    events,
    final_commit: events[0].payload.artifact.head,
  });
  assert.equal(model.schema, 'ai-peer-review.phase-manifest/v1');
  assert.equal(model.phase_index, 0);
  assert.equal(model.phase_kind, 'spec');
  assert.equal(model.phase_status, 'accepted');
  assert.equal(Object.hasOwn(model, 'status'), false);
  const sealed = sealPhaseManifest(model, { path: 'reviews/phase-01-spec-review-manifest.md' });
  assert.equal(sealed.path, 'reviews/phase-01-spec-review-manifest.md');
  assert.match(sealed.bytes.toString(), /ai-peer-review\.phase-manifest\/v1/);
});

test('manifest preserves bounded identity, claim, recovery, and supplement history', () => {
  const base = acceptancePendingEvents();
  const identityChange = event('identity-changed', { sequence: base.length + 1 });
  const reclaim = event('same-session-reclaim', { sequence: base.length + 2 });
  const supplement = event('supplement-registered', { sequence: base.length + 3 });
  const state = structuredClone(reduceEvents(base));
  const accepted = base.find((item) => item.type === 'reviewer-accepted');
  state.protocol.supplements = [
    {
      ...structuredClone(supplement.payload.supplement),
      target_turn: 1,
      acknowledged_at: accepted.at,
      parameters: { ...supplement.payload.supplement.parameters, target_turn: 1 },
    },
  ];
  const model = buildManifest({
    state,
    events: [...base, identityChange, reclaim, supplement],
    status: 'accepted',
    acceptance_basis: 'reviewer-consensus',
    final_commit: state.protocol.artifact.head,
  });
  assert.equal(model.identity_changes[0].identity.identity_source, 'runtime');
  assert.equal(model.claims.length, 1);
  assert.equal(Object.hasOwn(model.claims[0], 'pid'), false);
  assert.equal(model.recoveries[0].type, 'same-session-reclaim');
  assert.equal(model.supplements[0].content_retention, 'scratch-only');
  assert.deepEqual(model.supplements[0].acknowledgment_response, accepted.payload.response);
  assert.equal(Object.isFrozen(identityChange.payload.identity), false);
});

test('human decision and manifest seals bind exact override authority', () => {
  const events = authorRevisionEvents();
  events[0].payload.max_turns = 1;
  events.push(
    event('author-closing-round-committed', {
      sequence: 6,
      revision: 4,
      actor: FINGERPRINTS.author,
    })
  );
  const state = reduceEvents(events);
  const reviewer = [...events]
    .reverse()
    .find((item) => item.type === 'reviewer-revisions-requested');
  const rationale = Buffer.from('Ship despite the bounded unresolved finding.\n');
  const parameters = {
    ...protectedParameters('accept-over-objections'),
    artifact_path: state.protocol.artifact.path,
    artifact_blob: state.protocol.artifact.blob,
    artifact_digest: state.protocol.artifact.digest,
    final_round: reviewer.payload.turn,
    reviewer_response_path: reviewer.payload.response.path,
    reviewer_response_digest: reviewer.payload.response.digest,
    unresolved_finding_ids: reviewer.payload.finding_ids,
    human_rationale_digest: `sha256:${createHash('sha256').update(rationale).digest('hex')}`,
  };
  const decision = sealHumanDecision({
    state,
    events,
    parameters,
    attestation: attestation(),
    rationale_bytes: rationale,
    decided_at: '2026-09-09T12:00:00.000Z',
    path: 'reviews/human-decision.md',
  });
  assert.equal(decision.model.unresolved_findings[0].finding_ids[0], 'finding-001');
  assert.match(decision.bytes.toString(), /human_rationale_digest/);
  assert.match(decision.bytes.toString(), /Ship despite the bounded unresolved finding/);
  assert.equal(Object.isFrozen(decision), true);
  assert.throws(
    () =>
      sealHumanDecision({
        state,
        events,
        parameters,
        attestation: attestation(),
        rationale_bytes: Buffer.from('Different rationale.\n'),
        decided_at: '2026-09-09T12:00:00.000Z',
        path: 'reviews/human-decision.md',
      }),
    (error) => error.code === 'APR_MANIFEST_INVALID'
  );

  const manifest = sealManifest(
    buildManifest(
      review(events, {
        status: 'accepted-over-objections',
        acceptance_basis: 'human-override',
        final_commit: state.protocol.artifact.head,
        human_decision: decision.model,
      })
    ),
    { path: 'reviews/review-manifest.md' }
  );
  assert.equal(manifest.model.authority_assurance, 'unverified-test');
  assert.equal(manifest.model.residual_risk.includes('detection-grade-authority'), true);
  const sealed = pathsToSeals([decision, manifest], {
    expected_head: state.protocol.artifact.head,
  });
  assert.deepEqual(sealed.commit_paths, [decision.path, manifest.path]);
  assert.match(finalMessage(state), /review-01/);
  assert.equal(
    finalTrailers({ state, acceptance: decision, manifest })['Peer-Review-Manifest'],
    manifest.digest
  );
});

test('manifest sealing rejects contradictory terminal claims', () => {
  const events = acceptancePendingEvents();
  events[0].payload.commit_mode = 'no-commit';
  events[0].payload.startup.no_commit_baseline = {
    head: events[0].payload.artifact.head,
    index_digest: `sha256:${'1'.repeat(64)}`,
    worktree_digest: `sha256:${'2'.repeat(64)}`,
    changed_paths: [],
  };
  const valid = buildManifest(
    review(events, {
      status: 'accepted-uncommitted',
      acceptance_basis: 'reviewer-consensus',
      final_commit: null,
    })
  );
  assert.throws(
    () => sealManifest({ ...valid, status: 'accepted', final_commit: '1'.repeat(40) }),
    (error) => error.code === 'APR_MANIFEST_INVALID'
  );
  assert.throws(
    () =>
      sealManifest({
        ...valid,
        commit_mode: undefined,
        acceptance_basis: undefined,
        status: undefined,
      }),
    (error) => error.code === 'APR_MANIFEST_INVALID'
  );
});

test('no-commit manifest carries explicit non-durable status and residual risk', () => {
  const events = acceptancePendingEvents();
  events[0].payload.commit_mode = 'no-commit';
  events[0].payload.startup.no_commit_baseline = {
    head: events[0].payload.artifact.head,
    index_digest: `sha256:${'1'.repeat(64)}`,
    worktree_digest: `sha256:${'2'.repeat(64)}`,
    changed_paths: [],
  };
  const model = buildManifest(
    review(events, {
      status: 'accepted-uncommitted',
      acceptance_basis: 'reviewer-consensus',
      final_commit: null,
    })
  );
  assert.equal(model.commit_mode, 'no-commit');
  assert.equal(model.final_commit, null);
  assert.equal(model.residual_risk.includes('uncommitted-test-evidence'), true);
  assert.match(renderManifest(model).toString(), /NO-COMMIT TEST MODE/);
});
