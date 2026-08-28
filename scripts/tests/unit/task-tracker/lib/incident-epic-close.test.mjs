// @story #1381
// cspell:ignore NDEKTSV RRFFQ
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeIncidentEpicClose,
  parseCloseOfAssertion,
} from '../../../../task-tracker/lib/incident-epic-close.mjs';

const repository = 'kburson/ai-task-manager';
const ledgerId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const digest = `sha256:${'b'.repeat(64)}`;
const approvalRecordId = '01ARZ3NDEKTSV4RRFFQ69G5FAB';
const ownerRecordId = '01ARZ3NDEKTSV4RRFFQ69G5FAC';
const required = [1380, 1382, 1383, 1384];

function owner(overrides = {}) {
  return {
    id: 'owner-comment',
    envelope: {
      recordId: ownerRecordId,
      recordType: 'delivery-incident-ledger-owner',
      repository,
      issue: 939,
      supersedes: null,
      payload: {
        schema: 'aitm.delivery-incident-ledger-owner/v1',
        repository,
        incidentIssue: 939,
        convergenceIssue: 1381,
        ledgerId,
        ledgerDigest: digest,
        approvalRecordId,
        ...overrides,
      },
    },
  };
}

function projection() {
  return {
    approvedLedgerIncorporated: required.map((issueNumber) => ({
      envelope: { payload: { issueNumber } },
    })),
  };
}

function authority() {
  return {
    repository,
    incidentIssue: 939,
    convergenceIssue: 1381,
    ledgerId,
    ledgerDigest: digest,
    approvalRecordId,
    ownerRecordId,
    ledgerPayload: {
      rows: required.map((issueNumber) => ({ issueNumber, intendedOutcome: 'incorporated' })),
    },
    projection: projection(),
  };
}

function live(overrides = {}) {
  return Object.fromEntries(
    required.map((issueNumber) => [
      issueNumber,
      {
        issueState: 'CLOSED',
        issueStateReason: 'COMPLETED',
        boardState: 'Done',
        disposition: 'Incorporated',
      },
    ])
  );
}

function authorize(overrides = {}) {
  return authorizeIncidentEpicClose({
    repository,
    incidentIssue: 939,
    explicitConvergenceIssue: null,
    ownerRecords: [owner()],
    records: [],
    liveOutcomes: live(),
    deps: { resolveApprovedIncidentLedger: () => authority() },
    ...overrides,
  });
}

test('ordinary #939 close discovers the exact owner and requires all four terminal rows', () => {
  const result = authorize();
  assert.equal(result.convergenceIssue, 1381);
  assert.deepEqual(result.requiredIssues, required);
  assert.equal(Object.isFrozen(result), true);
});

test('an explicit --of must exactly match the discovered owner', () => {
  assert.equal(authorize({ explicitConvergenceIssue: 1381 }).convergenceIssue, 1381);
  assert.throws(
    () => authorize({ explicitConvergenceIssue: 1382 }),
    /incident-epic-close:owner-mismatch/
  );
});

test('each incident child independently blocks #939 before mutation', () => {
  for (const issueNumber of required) {
    const outcomes = live();
    outcomes[issueNumber] = { issueState: 'OPEN', boardState: 'Review', disposition: '' };
    assert.throws(
      () => authorize({ liveOutcomes: outcomes }),
      new RegExp(`incident-epic-close:pending.*${issueNumber}`)
    );
  }
});

test('terminal state must agree with the approved Incorporated outcome', () => {
  const outcomes = live();
  outcomes[1384] = { issueState: 'CLOSED', boardState: 'Done', disposition: 'Delivered' };
  assert.throws(
    () => authorize({ liveOutcomes: outcomes }),
    /incident-epic-close:contradictory.*1384/
  );
});

test('terminal state must use GitHub completed semantics', () => {
  const outcomes = live();
  outcomes[1384] = { ...outcomes[1384], issueStateReason: 'NOT_PLANNED' };
  assert.throws(
    () => authorize({ liveOutcomes: outcomes }),
    /incident-epic-close:contradictory.*1384/
  );
});

test('missing, forked, or byte-conflicting owner authority refuses', () => {
  assert.throws(() => authorize({ ownerRecords: [] }), /incident-epic-close:missing-owner/);
  assert.throws(
    () => authorize({ ownerRecords: [owner(), { ...owner(), id: 'fork' }] }),
    /incident-epic-close:ambiguous-owner/
  );
  assert.throws(
    () => authorize({ ownerRecords: [owner({ ledgerDigest: `sha256:${'c'.repeat(64)}` })] }),
    /incident-epic-close:owner-authority-mismatch/
  );
});

test('approved ledger must contain matching Incorporated records for every required row', () => {
  const incomplete = authority();
  incomplete.projection = {
    approvedLedgerIncorporated: projection().approvedLedgerIncorporated.slice(1),
  };
  assert.throws(
    () =>
      authorize({
        deps: { resolveApprovedIncidentLedger: () => incomplete },
      }),
    /incident-epic-close:missing-incorporated.*1380/
  );
});

test('close --of parser normalizes one assertion and rejects repeats or missing values', () => {
  assert.equal(parseCloseOfAssertion(['#939']), null);
  assert.equal(parseCloseOfAssertion(['#939', '--of', '1381']), 1381);
  assert.throws(() => parseCloseOfAssertion(['#939', '--of']), /incident-epic-close:invalid-of/);
  assert.throws(
    () => parseCloseOfAssertion(['#939', '--of', '1381', '--of', '1381']),
    /incident-epic-close:invalid-of/
  );
});
