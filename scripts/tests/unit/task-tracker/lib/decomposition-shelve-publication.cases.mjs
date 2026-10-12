import { publishFieldEstimateRevision } from '../../../../task-tracker/lib/decomposition-field-writer.mjs';
// @story #1988 — real Shelve journal under the publication owner.
import { deriveDecompositionCapabilities } from '../../../../task-tracker/lib/decomposition-assessment.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { CFG, harness } from '../../../integration/task-tracker/lib/shelve-transaction.fixture.mjs';
import { runShelveTransaction } from '../../../../task-tracker/lib/shelve-transaction.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';
import { stampRefinementSnapshot } from '../../../../task-tracker/lib/refinement-snapshot.mjs';
import { parseRefinementHistory } from '../../../../task-tracker/lib/refinement-history.mjs';
import {
  estimationPublicationFixture,
  estimationObservation,
} from '../../../fixtures/estimation-publication.mjs';
import { currentIssueLockOwner } from '../../../../task-tracker/issue-mutator-lock.mjs';
function fixture(options = {}) {
  const h = harness(options);
  h.store.body = h.store.body.replace(/<!--\s*aitm-estimation-forecast-ready[^>]*-->\n?/g, '');
  h.store.body = h.store.body.replace(
    '<!-- aitm-fields:',
    '## Verification Commands\n- [ ] `node verify.mjs` <!-- id=6 -->\n\n## AITM Progress Markers\n<!-- aitm-fields:'
  );
  h.store.body = stampRefinementSnapshot(h.store.body, {
    labels: h.store.labels,
    ts: '2026-08-12T00:00:00.000Z',
  });
  const publication = estimationPublicationFixture({
    cfg: CFG,
    issueNumber: 1215,
    getBody: () => h.store.body,
    setBody: (b) => (h.store.body = b),
    getProject: () => h.store.fields,
    getForecast: () =>
      estimationObservation({
        estimate: null,
        size: null,
        recordId: null,
        proposals: [],
        observedProjections: [],
      }),
  });
  delete h.deps.publishShelveRevision;
  for (const name of ['mutateBody', 'clearBoardFields', 'runMoveState', 'removeOwner']) {
    const port = h.deps[name];
    h.deps[name] = async (...args) => {
      assert.ok(currentIssueLockOwner(1215), 'every actual journal effect has physical ownership');
      assert.equal(readDecompositionRecords(h.store.body).publication?.status, 'pending');
      return port(...args);
    };
  }
  return {
    ...h,
    args: {
      cfg: CFG,
      issueNumber: 1215,
      reason: 'No longer prioritized',
      deps: { ...h.deps, ...publication, plannedEstimate: { listComments: async () => [] } },
    },
  };
}
export function registerShelvePublicationCases() {
  for (const state of ['refine', 'ready-for-plan'])
    test(`actual Shelve from ${state} clears under one owner and preserves its journal`, async () => {
      const h = fixture({ state });
      const result = await runShelveTransaction(h.args);
      assert.equal(
        result.status,
        'shelved',
        result.reason ?? result.error ?? JSON.stringify(result)
      );
      const records = readDecompositionRecords(h.store.body);
      assert.equal(records.publication.writerId, 'shelve');
      assert.equal(records.publication.status, 'complete');
      assert.equal(records.assessment.estimate.basis, 'unset');
      assert.equal(
        deriveDecompositionCapabilities(records.assessment, records.publication).includes(
          'scoped-implementation'
        ),
        false
      );
      assert.equal(parseRefinementHistory(h.store.body).length, 1);
      assert.equal(h.store.state, 'backlog');
    });
  for (const name of ['clear-fields', 'move-status', 'mutate-body', 'remove-owner'])
    test(`actual Shelve reconciles ${name} failure without losing its original journal`, async () => {
      const h = fixture({ failOnce: name });
      h.args.removeOwner = name === 'remove-owner';
      const first = await runShelveTransaction(h.args);
      assert.notEqual(first.status, 'shelved');
      assert.equal(readDecompositionRecords(h.store.body).publication?.status, 'pending');
      const result = await runShelveTransaction(h.args);
      assert.equal(result.status, 'shelved', result.reason ?? result.error);
      assert.equal(parseRefinementHistory(h.store.body).length, 1);
      assert.equal(readDecompositionRecords(h.store.body).publication.status, 'complete');
    });
}

export function registerShelveLandedCases() {
  test('actual Shelve reads every predecessor effect before explicitly superseding a pending field revision', async () => {
    const h = fixture();
    const pending = await publishFieldEstimateRevision({
      cfg: CFG,
      issueNumber: 1215,
      writerId: 'project-tether',
      key: { estimate: 25 },
      estimate: 25,
      size: 'M',
      deps: h.args.deps,
      beforeEffects: async () => {
        throw new Error('interrupted before first business effect');
      },
      writeField: async () => {
        throw new Error('must not write');
      },
    });
    assert.equal(pending.status, 'partial');
    const previous = readDecompositionRecords(h.store.body).publication;
    const result = await runShelveTransaction(h.args);
    assert.equal(result.status, 'shelved', result.reason ?? result.error);
    const current = readDecompositionRecords(h.store.body).publication;
    assert.equal(current.supersedes.operationId, previous.operationId);
    assert.equal(current.supersedes.effects.length, previous.effects.length);
    assert.ok(
      current.supersedes.effects.every(
        (e) => ['confirmed', 'failed'].includes(e.status) && e.observedDigest
      )
    );
    assert.equal(current.status, 'complete');
  });
  for (const phase of [
    'snapshot-recorded',
    'active-evidence-cleared',
    'fields-cleared',
    'status-backlog',
    'owner-updated',
    'verified',
  ])
    test(`actual Shelve reconciles unknown outcome after ${phase}`, async () => {
      const h = fixture({ failAfterPhase: phase });
      assert.notEqual((await runShelveTransaction(h.args)).status, 'shelved');
      const result = await runShelveTransaction(h.args);
      assert.equal(result.status, 'shelved', result.reason ?? result.error);
      assert.equal(parseRefinementHistory(h.store.body).length, 1);
      assert.equal(readDecompositionRecords(h.store.body).publication.status, 'complete');
    });
}
