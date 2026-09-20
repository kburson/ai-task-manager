// @story #1661

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lintRefusalInventory, scanRefusalSites } from '../../maintenance/lint-action-refusals.mjs';
import { GUARDS, registerGuard, runGuards } from '../../task-tracker/lib/guard-registry.mjs';

function registerFixtureGuard(guard) {
  registerGuard('done', 'entry', guard);
  return () => {
    const index = GUARDS.done.entry.findIndex(({ id }) => id === guard.id);
    if (index !== -1) GUARDS.done.entry.splice(index, 1);
  };
}

for (const fixture of [
  {
    name: 'a refusing guard cannot return an empty refusal collection',
    guardId: 'fixture-empty-refusals',
    result: { ok: false, refusals: [] },
  },
  {
    name: 'a successful guard cannot carry a refusal',
    guardId: 'fixture-success-with-refusal',
    result: {
      ok: true,
      refusals: [
        {
          code: 'migration-freeze',
          args: {},
          noAutomaticRemediation: { reason: 'result-investigation-required' },
        },
      ],
    },
  },
  {
    name: 'a successful guard cannot carry malformed refusals',
    guardId: 'fixture-success-with-malformed-refusals',
    result: { ok: true, refusals: { code: 'migration-freeze' } },
  },
  {
    name: 'a refusing guard cannot carry a sparse refusal collection',
    guardId: 'fixture-sparse-refusals',
    result: { ok: false, refusals: new Array(1) },
  },
  {
    name: 'a successful guard cannot carry a sparse warning collection',
    guardId: 'fixture-sparse-warnings',
    result: { ok: true, warnings: new Array(1) },
  },
  {
    name: 'a successful guard cannot carry a human request',
    guardId: 'fixture-success-with-request',
    result: {
      ok: true,
      requests: [
        {
          kind: 'manual-investigation',
          actor: 'human-operator',
          subject: { issue: 1661, actionId: 'promote' },
          args: { guardId: 'fixture-success-with-request', code: 'migration-freeze' },
        },
      ],
    },
  },
  {
    name: 'a guard cannot impersonate a guidance-admission warning producer',
    guardId: 'fixture-warning-producer-mismatch',
    result: {
      ok: true,
      warnings: [
        {
          code: 'guidance-source-diverged',
          args: {
            source: '.ai-task-manager/aitm-guidance.yml',
            digest: `sha256:${'d'.repeat(64)}`,
          },
        },
      ],
    },
  },
]) {
  test(fixture.name, async (t) => {
    const cleanup = registerFixtureGuard({ id: fixture.guardId, run: () => fixture.result });
    t.after(cleanup);

    const result = await runGuards('backlog', 'done', { issueNumber: 1661 });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'indeterminate');
    assert.equal(result.refusals.length, 1);
    assert.equal(result.refusals[0].guardId, fixture.guardId);
    assert.equal(result.refusals[0].code, 'guard-result-invalid');
  });
}

test('the refusal lint freezes constructor call sites inside registered guards', () => {
  const originalSource = [
    "const refuse = (code) => ({ ok: false, code, reason: 'legacy reason' });",
    "export const fixtureGuard = { id: 'fixture-guard',",
    '  run() {',
    "    return refuse('existing-diagnostic');",
    '  },',
    '};',
  ].join('\n');
  const original = scanRefusalSites({ file: 'fixture-guard.mjs', source: originalSource });
  const inventory = {
    version: 1,
    guards: { 'fixture-guard': { complete: true, sites: original } },
  };
  const addedCall = originalSource.replace(
    "return refuse('existing-diagnostic');",
    "if (Date.now()) return refuse('made-up-code');\n    return refuse('existing-diagnostic');"
  );

  assert.match(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: addedCall }],
      registeredGuardIds: ['fixture-guard'],
    }).join('\n'),
    /new unclassified refusal/
  );
});

test('the refusal lint freezes imported constructor call sites', () => {
  const originalSource = [
    "import { refuse as reject } from './refusal-helper.mjs';",
    "export const fixtureGuard = { id: 'fixture-guard',",
    '  run() {',
    "    return reject('existing-diagnostic');",
    '  },',
    '};',
  ].join('\n');
  const original = scanRefusalSites({ file: 'fixture-guard.mjs', source: originalSource });
  const inventory = {
    version: 1,
    guards: { 'fixture-guard': { complete: true, sites: original } },
  };
  const addedCall = originalSource.replace(
    "return reject('existing-diagnostic');",
    "if (Date.now()) return reject('made-up-code');\n    return reject('existing-diagnostic');"
  );

  assert.match(
    lintRefusalInventory({
      inventory,
      sources: [{ file: 'fixture-guard.mjs', source: addedCall }],
      registeredGuardIds: ['fixture-guard'],
    }).join('\n'),
    /new unclassified refusal/
  );

  const namespaceSource = [
    "import * as decisions from './refusal-helper.mjs';",
    "export const fixtureGuard = { id: 'fixture-guard',",
    "  run() { return decisions.refuse('existing-diagnostic'); },",
    '};',
  ].join('\n');
  assert.ok(
    scanRefusalSites({ file: 'fixture-guard.mjs', source: namespaceSource }).some(
      ({ kind }) => kind === 'refusal'
    )
  );
  assert.deepEqual(
    scanRefusalSites({
      file: 'fixture-guard.mjs',
      source:
        "export const fixtureGuard = { id: 'fixture-guard', run() { console.warn('x'); return { ok: true }; } };",
    }),
    []
  );
});
