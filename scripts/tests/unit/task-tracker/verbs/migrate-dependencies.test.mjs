// @story #1557
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyLegacyDependencyIssue,
  listLegacyDependencyIssues,
  migrateLegacyDependencyIssue,
  parseMigrationArgs,
  removeStrictVisibleMarker,
  runDependencyMigration,
} from '../../../../task-tracker/verbs/migrate-dependencies.mjs';

const marker = '<!-- aitm-blocked-by refs="#42,#48" -->';

test('issue enumeration stays below GitHub GraphQL node-cost limits', async () => {
  let source = '';
  const issues = await listLegacyDependencyIssues({
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      gql: async (query) => {
        source = query;
        return {
          repository: {
            issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        };
      },
    },
  });
  assert.deepEqual(issues, []);
  assert.match(source, /projectItems\(first:20\)/);
  assert.match(source, /fieldValues\(first:50\)/);
  assert.doesNotMatch(source, /projectItems\(first:100\)/);
});

test('classification migrates only strict open markers and ignores fenced examples', () => {
  assert.deepEqual(
    classifyLegacyDependencyIssue({ number: 41, state: 'OPEN', body: marker, labels: ['BLOCKED'] }),
    { issue: 41, kind: 'strict-open', refs: [42, 48] }
  );
  assert.equal(
    classifyLegacyDependencyIssue({ number: 41, state: 'CLOSED', body: marker }).kind,
    'closed-history'
  );
  assert.equal(
    classifyLegacyDependencyIssue({ number: 41, state: 'OPEN', body: '', labels: ['BLOCKED'] })
      .kind,
    'ambiguous-label-only'
  );
  assert.equal(
    classifyLegacyDependencyIssue({
      number: 41,
      state: 'OPEN',
      body: '<!-- aitm-blocked-by refs="#x" -->',
    }).kind,
    'malformed'
  );
  assert.equal(
    classifyLegacyDependencyIssue({
      number: 41,
      state: 'OPEN',
      body: `\`\`\`md\n${marker}\n\`\`\``,
    }).kind,
    'none'
  );
});

test('marker removal preserves fenced examples byte-for-byte', () => {
  const fenced = `\`\`\`md\n${marker}\n\`\`\``;
  const body = `${fenced}\n\n## Dependencies\n\n${marker}\n`;
  assert.equal(removeStrictVisibleMarker(body, [42, 48]), `${fenced}\n\n## Dependencies\n\n`);
});

test('argument parser requires exactly one explicit mode', () => {
  assert.deepEqual(parseMigrationArgs(['--dry-run']), { apply: false, dryRun: true });
  assert.deepEqual(parseMigrationArgs(['--apply']), { apply: true, dryRun: false });
  for (const args of [[], ['--dry-run', '--apply'], ['--wat']]) {
    assert.throws(() => parseMigrationArgs(args), /exactly one of --dry-run or --apply/);
  }
});

function candidate(overrides = {}) {
  return {
    issue: 41,
    kind: 'strict-open',
    refs: [42, 48],
    nativeBefore: [42],
    labels: ['BLOCKED'],
    body: marker,
    itemId: 'PVTI_41',
    projectionTarget: 'BLOCKED',
    ...overrides,
  };
}

function mutationHarness({ failAt = null } = {}) {
  const calls = [];
  const step = (name, result) => async () => {
    calls.push(name);
    if (failAt === name) throw new Error(`boom:${name}`);
    return result;
  };
  return {
    calls,
    deps: {
      convergeBlockedBySet: step('native-converge', {
        desired: [42, 48],
        added: [48],
        removed: [],
      }),
      readNativeDependencies: step('native-readback', {
        blockedBy: [42, 48],
        blocking: [],
      }),
      reconcileDependencyDisposition: step('projection-reconcile', {
        status: 'written',
        disposition: 'BLOCKED',
      }),
      clearLegacyField: step('legacy-field-clear', { status: 'cleared' }),
      removeLegacyLabel: step('legacy-label-remove', { status: 'removed' }),
      removeLegacyMarker: step('legacy-marker-remove', { status: 'removed' }),
    },
  };
}

test('dry-run reports deterministic actions without mutation', async () => {
  const h = mutationHarness();
  const result = await migrateLegacyDependencyIssue({
    candidate: candidate(),
    cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'FIELD' },
    apply: false,
    deps: h.deps,
  });
  assert.deepEqual(h.calls, []);
  assert.deepEqual(result.actions, [
    'add-native:#48',
    'project:BLOCKED',
    'clear-field',
    'remove-label',
    'remove-marker',
  ]);
  assert.equal(result.status, 'dry-run');
});

test('apply orders native convergence and readback before destructive legacy cleanup', async () => {
  const h = mutationHarness();
  const result = await migrateLegacyDependencyIssue({
    candidate: candidate(),
    cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'FIELD' },
    apply: true,
    deps: h.deps,
  });
  assert.deepEqual(h.calls, [
    'native-converge',
    'native-readback',
    'projection-reconcile',
    'legacy-field-clear',
    'legacy-label-remove',
    'legacy-marker-remove',
  ]);
  assert.equal(result.status, 'migrated');
});

test('every partial failure preserves the final legacy marker step for retry', async () => {
  const ordered = [
    'native-converge',
    'native-readback',
    'projection-reconcile',
    'legacy-field-clear',
    'legacy-label-remove',
  ];
  for (const failAt of ordered) {
    const h = mutationHarness({ failAt });
    await assert.rejects(
      migrateLegacyDependencyIssue({
        candidate: candidate(),
        cfg: { repo: 'o/r', projectId: 'P', fieldBlockedBy: 'FIELD' },
        apply: true,
        deps: h.deps,
      }),
      new RegExp(`boom:${failAt}`)
    );
    assert.equal(h.calls.includes('legacy-marker-remove'), false, failAt);
  }
});

test('run reports ambiguous open carriers as exit 3 only for apply', async () => {
  const issues = [
    { number: 41, state: 'OPEN', body: '', labels: ['BLOCKED'], legacyBlockedBy: '' },
  ];
  const dry = await runDependencyMigration({
    cfg: { repo: 'o/r', projectId: 'P' },
    apply: false,
    deps: { listIssues: async () => issues },
  });
  assert.equal(dry.exitCode, 0);
  const applied = await runDependencyMigration({
    cfg: { repo: 'o/r', projectId: 'P' },
    apply: true,
    deps: { listIssues: async () => issues },
  });
  assert.equal(applied.exitCode, 3);
});
