// @story #1086
// cspell:ignore KZGQBSQGV ZSFTHVMJNS

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adoptionSnapshotDivergent,
  adoptIssueRecords,
  parseAdoptionArgs,
} from '../../../../task-tracker/verbs/adopt-github-records.mjs';

const repository = 'kburson/ai-task-manager';
const issueNumber = 1086;
const recordId = '01KZGQBSQGV1ZSFTHVMJNS06D5';
const grantId = '01KZGQBSQGV1ZSFTHVMJNS06D6';
const singletonRecordId = '01KZGQBSQGV1ZSFTHVMJNS06D8';
const legacyBody = `## User Story

As a maintainer
I want adoption
So that records are durable

## Acceptance Criteria

- [x] Dry run is exact. <!-- vc-list="vc:1" -->

## Verification Commands

- [x] \`node --test adoption.test.mjs\` <!-- id=1 -->

## Definition of Done

### Functional (verified at Test)

- [x] All automated tests pass <!-- dod:functional:tests -->
`;

const authority = { actor: 'codex/story-1086', epoch: 4, grantId };

function input(overrides = {}) {
  return {
    repository,
    issueNumber,
    issueBody: legacyBody,
    issueNodeId: 'I_kwDOadoptionIssue',
    authority,
    contractRecordId: recordId,
    ...overrides,
  };
}

test('dry run reports exact legacy-to-contract parity with no write dependencies', async () => {
  const result = await adoptIssueRecords(input({ dryRun: true, deps: {} }));

  assert.equal(result.status, 'dry-run');
  assert.equal(result.parity.exact, true);
  assert.deepEqual(result.parity.counts, {
    acceptanceCriteria: 1,
    definitionOfDone: 1,
    verificationCommands: 1,
  });
  assert.match(result.parity.definitionHash, /^sha256:/);
});

test('apply prepares singletons, seals and projects the contract, then publishes the directory last', async () => {
  const calls = [];
  let proposed;
  let preparedDirectory;
  const result = await adoptIssueRecords(
    input({
      dryRun: false,
      deps: {
        async prepareIssueSingletons() {
          calls.push('prepare');
          preparedDirectory = {
            singletons: {
              'delivery-contract': 'IC_delivery',
              coordination: 'IC_coordination',
              'evidence-projection': 'IC_evidence',
              timing: 'IC_timing',
            },
          };
          return {
            directory: preparedDirectory,
            singletons: [
              {
                commentNodeId: 'IC_delivery',
                envelope: {
                  recordId: singletonRecordId,
                  payload: { kind: 'delivery-contract', schema: 'aitm.singleton/v1' },
                },
              },
            ],
          };
        },
        async appendContractSeal({ contract }) {
          calls.push('append-seal');
          proposed = contract;
          assert.equal(contract.recordId, singletonRecordId);
          return { recordId: '01KZGQBSQGV1ZSFTHVMJNS06D7' };
        },
        async updateContractProjection({ commentNodeId, contract }) {
          calls.push(`project:${commentNodeId}`);
          assert.equal(contract, proposed);
        },
        async publishIssueDirectory() {
          calls.push('publish');
          return { repaired: true, directory: preparedDirectory };
        },
        async readBackAdoption() {
          calls.push('read-back');
          return {
            sourceKind: 'github-records/v1',
            contract: proposed,
          };
        },
      },
    })
  );

  assert.deepEqual(calls, [
    'prepare',
    'append-seal',
    'project:IC_delivery',
    'publish',
    'read-back',
  ]);
  assert.equal(result.status, 'adopted');
  assert.equal(result.parity.exact, true);
  assert.equal(result.sealRecordId, '01KZGQBSQGV1ZSFTHVMJNS06D7');
});

test('parity mismatch refuses adoption before the first write', async () => {
  const writes = [];
  await assert.rejects(
    adoptIssueRecords(
      input({
        deps: {
          async initializeIssueDirectory() {
            writes.push('initialize');
          },
        },
        parityOverride(contract) {
          return { ...contract, acceptanceCriteria: [] };
        },
      })
    ),
    /adopt-github-records:parity/
  );
  assert.deepEqual(writes, []);
});

test('rollback is allowed only for the unchanged adoption snapshot', async () => {
  const removed = [];
  const clean = await adoptIssueRecords(
    input({
      action: 'rollback',
      deps: {
        async inspectAdoption() {
          return { adopted: true, divergent: false, reason: null };
        },
        async removeDirectoryProjection() {
          removed.push(issueNumber);
        },
      },
    })
  );
  assert.equal(clean.status, 'rolled-back');
  assert.deepEqual(removed, [issueNumber]);

  await assert.rejects(
    adoptIssueRecords(
      input({
        action: 'rollback',
        deps: {
          async inspectAdoption() {
            return { adopted: true, divergent: true, reason: 'lifecycle-transition' };
          },
          async removeDirectoryProjection() {
            throw new Error('must not write');
          },
        },
      })
    ),
    /adopt-github-records:divergent/
  );
});

test('rollback snapshot inspection detects singleton projection drift as well as capsule drift', () => {
  const contract = {
    schema: 'aitm.delivery-contract/v1',
    revision: 1,
    contractEpoch: 1,
    status: 'sealed',
    acceptedRecordIds: [],
  };
  const directory = {
    singletons: {
      'delivery-contract': 'IC_delivery',
      coordination: 'IC_coordination',
      'evidence-projection': 'IC_evidence',
      timing: 'IC_timing',
    },
  };
  const records = [
    { commentNodeId: 'IC_delivery', envelope: { payload: contract } },
    ...['coordination', 'evidence-projection', 'timing'].map((kind) => ({
      commentNodeId: directory.singletons[kind],
      envelope: { payload: { schema: 'aitm.singleton/v1', kind, logicalId: `logical:${kind}` } },
    })),
  ];
  const capsules = [{ envelope: { recordType: 'contract-sealed', payload: contract } }];

  assert.equal(adoptionSnapshotDivergent({ directory, records, capsules }), false);
  assert.equal(
    adoptionSnapshotDivergent({
      directory,
      records: records.map((record) =>
        record.commentNodeId === 'IC_timing'
          ? { ...record, envelope: { payload: { schema: 'aitm.timing-projection/v1' } } }
          : record
      ),
      capsules,
    }),
    true
  );
});

test('repair delegates to validated discovery and never guesses a missing singleton', async () => {
  const repaired = await adoptIssueRecords(
    input({
      action: 'repair',
      deps: {
        async repairIssueDirectory() {
          return { repaired: true, directory: { schema: 'aitm.directory/v1' } };
        },
      },
    })
  );
  assert.equal(repaired.status, 'repaired');

  await assert.rejects(
    adoptIssueRecords(
      input({
        action: 'repair',
        deps: {
          async repairIssueDirectory() {
            throw new TypeError('singleton-initializer:missing');
          },
        },
      })
    ),
    /singleton-initializer:missing/
  );
});

test('CLI is dry-run first and exposes no database or hosted-service configuration', () => {
  assert.deepEqual(parseAdoptionArgs(['1086']), { action: 'audit', issueNumber: 1086 });
  assert.deepEqual(parseAdoptionArgs(['1086', '--apply']), { action: 'apply', issueNumber: 1086 });
  assert.deepEqual(parseAdoptionArgs(['1086', '--rollback']), {
    action: 'rollback',
    issueNumber: 1086,
  });
  assert.deepEqual(parseAdoptionArgs(['1086', '--repair']), {
    action: 'repair',
    issueNumber: 1086,
  });
  assert.throws(() => parseAdoptionArgs(['1086', '--database-url']), /unknown/);
});
