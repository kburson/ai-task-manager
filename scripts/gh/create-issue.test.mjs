import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShapeFlags, createGovernedInternalIssue } from './create-issue.mjs';

// #687 — `buildShapeFlags` is the pure seam that assembles the argv forwarded to
// `preflight-issue.mjs`. These tests pin the `--kind` forwarding contract without
// spawning preflight/gh.

test('buildShapeFlags forwards --kind when args.kind is a non-empty string', () => {
  const flags = buildShapeFlags({ shape: 'stub', title: 'x', kind: 'spike' });
  const i = flags.indexOf('--kind');
  assert.notEqual(i, -1, '--kind must be present');
  assert.equal(flags[i + 1], 'spike', '--kind value must be forwarded verbatim');
});

test('buildShapeFlags omits --kind entirely when kind is absent (AC3)', () => {
  const flags = buildShapeFlags({ shape: 'stub', title: 'x' });
  assert.equal(flags.includes('--kind'), false, 'no --kind flag when kind unset');
});

test('buildShapeFlags omits --kind when kind is an empty string', () => {
  const flags = buildShapeFlags({ shape: 'stub', title: 'x', kind: '' });
  assert.equal(flags.includes('--kind'), false, 'empty kind is treated as unset');
});

test('buildShapeFlags omits --kind when kind is a non-string', () => {
  const flags = buildShapeFlags({ shape: 'stub', title: 'x', kind: true });
  assert.equal(flags.includes('--kind'), false, 'non-string kind is ignored');
});

test('buildShapeFlags still forwards --shape and seed fields alongside --kind', () => {
  const flags = buildShapeFlags({
    shape: 'stub',
    title: 'x',
    priority: 'p2',
    size: 'S',
    estimate: '3',
    kind: 'research',
  });
  assert.equal(flags[0], '--shape');
  assert.equal(flags[1], 'stub');
  const pi = flags.indexOf('--priority');
  assert.equal(flags[pi + 1], 'p2');
  const ki = flags.indexOf('--kind');
  assert.equal(flags[ki + 1], 'research');
});

test('buildShapeFlags forwards section files for non-stub shapes without --kind by default', () => {
  const flags = buildShapeFlags({
    shape: 'full',
    title: 'x',
    'scope-file': 's.md',
    'ac-file': 'a.md',
    'plan-metadata-file': 'p.md',
  });
  assert.equal(flags.includes('--scope-file'), true);
  assert.equal(flags.includes('--kind'), false);
});

for (const failure of [
  {
    name: 'generic create failure',
    outcome: { status: 1, stdout: '', stderr: 'network failed' },
    exitCode: 1,
    partialIssueNumber: undefined,
  },
  {
    name: 'partial-success create failure',
    outcome: {
      status: 1,
      stdout: 'https://github.com/test/repo/issues/777\n',
      stderr: 'response lost',
    },
    exitCode: 6,
    partialIssueNumber: 777,
  },
]) {
  test(`governed ${failure.name} unwinds controller finalizers before rejection`, async () => {
    const events = [];
    const withGovernedEffect = async (_options, callback) => {
      events.push('root');
      try {
        return await callback({
          reverify: async () => events.push('reverify'),
        });
      } finally {
        events.push('finalizer');
      }
    };
    await assert.rejects(
      createGovernedInternalIssue({
        title: 'Wave: test',
        bodyContent: 'body',
        cfg: { repo: 'test/repo', projectId: 'PVT_test' },
        withGovernedEffect,
        authorityIssueId: 900,
        reconcile: false,
        deps: {
          createOutcome: () => {
            events.push('create');
            return failure.outcome;
          },
        },
      }),
      (error) => {
        assert.equal(error.exitCode, failure.exitCode);
        assert.equal(error.partialIssueNumber, failure.partialIssueNumber);
        return true;
      }
    );
    assert.deepEqual(events, ['root', 'create', 'finalizer']);
  });
}
