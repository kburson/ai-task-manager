// @story #1910
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { parse } from 'acorn';
import { fixture, approvedFixture } from '../../../helpers/criteria-revision-consumers.mjs';
import { GUARDS, runGuards } from '../../../../task-tracker/lib/guard-registry.mjs';
import '../../../../task-tracker/lib/guard-bootstrap.mjs';
import { criteriaRevisionAdmissionGuard } from '../../../../task-tracker/lib/criteria-revision-admission-guard.mjs';
import { evaluateCompleteGuards } from '../../../../task-tracker/lib/action-decision/evaluate.mjs';

const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const budget = 600_000;
const authorityReadEffects = new Set([
  'authority-read',
  'page-read',
  'native-history-readback',
  'native-proof-record-readback',
]);
function assertNoMutationEffects(effects) {
  assert.ok(effects.includes('authority-read'), 'Each evaluation observes current authority');
  assert.deepEqual(
    effects.filter((effect) => !authorityReadEffects.has(effect)),
    [],
    'Only fresh read operations are permitted'
  );
}
const stateDirectory = path.join(root, 'scripts/task-tracker/states');
const discoveredStates = fs
  .readdirSync(stateDirectory)
  .filter((file) => file.endsWith('.mjs'))
  .flatMap((file) => {
    const ast = parse(fs.readFileSync(path.join(stateDirectory, file), 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    return ast.body.some(
      (node) =>
        node.type === 'ImportDeclaration' &&
        node.source.value === '../lib/criteria-revision-admission-guard.mjs'
    )
      ? [file.slice(0, -4)]
      : [];
  });
assert.equal(discoveredStates.length, 8, 'All original eight state containers participate');

for (const state of discoveredStates) {
  for (const authority of [
    'pending',
    'stale',
    'malformed',
    'unavailable',
    'baseline',
    'approved',
  ]) {
    test(`actual ${state} registration preserves ${authority} current revision authority`, async () => {
      const f = authority === 'approved' ? await approvedFixture() : await fixture(authority);
      if (authority === 'malformed')
        f.backend.addComment({
          id: 'bad',
          body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
        });
      const guard = GUARDS[state].entry.find(
        (value) => value.id === criteriaRevisionAdmissionGuard.id
      );
      assert.equal(
        guard,
        criteriaRevisionAdmissionGuard,
        'Source discovery resolves the actual shared producer'
      );
      const before = f.backend.effects.length;
      const result = await guard.run({
        cfg: { repo: f.context.repository },
        issueNumber: f.context.issue,
        deps: { revisionBackend: f.backend },
      });
      if (['baseline', 'approved'].includes(authority)) assert.deepEqual(result, { ok: true });
      else {
        assert.equal(result.ok, false);
        assert.equal(
          result.code,
          authority === 'pending'
            ? 'revision-pending'
            : authority === 'stale'
              ? 'revision-approval-stale'
              : 'revision-authority-unavailable'
        );
        assert.deepEqual(result.noAutomaticRemediation, {
          reason: 'authority-investigation-required',
        });
      }
      assertNoMutationEffects(f.backend.effects.slice(before));
    });
  }
}

for (const authority of ['pending', 'stale', 'malformed', 'unavailable']) {
  test(`actual complete guard evaluator cannot translate ${authority} authority into Explain readiness`, async () => {
    const f = await fixture(authority);
    if (authority === 'malformed')
      f.backend.addComment({
        id: 'bad',
        body: '<!-- aitm.criteria-revision-event/v1 {broken} -->',
      });
    const before = f.backend.effects.length;
    const result = await evaluateCompleteGuards({
      fromState: '',
      toState: 'done',
      context: {
        body: f.backend.observation.body.bytes,
        cfg: { repo: f.context.repository },
        issueNumber: f.context.issue,
        deps: { revisionBackend: f.backend },
      },
      runGuards,
      loadPolicy: async () => {
        throw new Error('No revision authority from a workflow waiver');
      },
    });
    assert.notEqual(result.guardResult.status, 'ready');
    const refusal = result.guardResult.refusals.find(
      (value) => value.id === criteriaRevisionAdmissionGuard.id
    );
    assert.ok(refusal, JSON.stringify(result.guardResult));
    assert.equal(
      refusal.code,
      authority === 'pending'
        ? 'revision-pending'
        : authority === 'stale'
          ? 'revision-approval-stale'
          : 'revision-authority-unavailable'
    );
    assertNoMutationEffects(f.backend.effects.slice(before));
  });
}

function sourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(path.join(directory, entry.name))
        : entry.isFile() && entry.name.endsWith('.mjs')
          ? [path.join(directory, entry.name)]
          : []
    );
}

test('independent imports and actual calls discover the current evidence reader frontier', (t) => {
  const readers = new Set([
    'currentRevisionEvidenceBinding',
    'matchesCurrentRevisionEvidence',
    'currentRevisionDefinitions',
    'acceptsIndividualRevisionProof',
  ]);
  const discovered = [];
  for (const file of sourceFiles(path.join(root, 'scripts/task-tracker/lib'))) {
    const ast = parse(fs.readFileSync(file, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    });
    const imports = new Set(
      ast.body
        .filter(
          (node) =>
            node.type === 'ImportDeclaration' &&
            path.resolve(path.dirname(file), node.source.value) ===
              path.join(root, 'scripts/task-tracker/lib/criteria-revision/policy.mjs')
        )
        .flatMap((node) =>
          node.specifiers
            .filter((value) => readers.has(value.imported?.name))
            .map((value) => value.local.name)
        )
    );
    if (!imports.size) continue;
    const calls = new Set();
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        imports.has(node.callee.name)
      )
        calls.add(node.callee.name);
      for (const value of Object.values(node))
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
    }
    walk(ast);
    assert.equal(
      calls.size,
      imports.size,
      'An imported reader cannot be counted without an executable call'
    );
    discovered.push(path.relative(root, file));
  }
  assert.deepEqual(
    discovered.sort(),
    [
      'scripts/task-tracker/lib/ac-evidence.mjs',
      'scripts/task-tracker/lib/functional-dod-evidence.mjs',
      'scripts/task-tracker/lib/verification-receipt.mjs',
      'scripts/task-tracker/lib/evidence-v2/eligibility.mjs',
      'scripts/task-tracker/lib/evidence-v2/subject-inputs.mjs',
    ].sort()
  );
  t.diagnostic(JSON.stringify({ readers: discovered, states: discoveredStates }));
});

async function qualify(files, minimumTests, t) {
  const paths = files.map((file) => path.join(root, file));
  for (const file of paths)
    assert.ok(fs.statSync(file).isFile(), `Missing complete verifier: ${file}`);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) =>
    execFile(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...paths],
      { cwd: root, env, encoding: 'utf8', timeout: budget },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    )
  );
  if (result.error) t.diagnostic(result.stdout + result.stderr);
  assert.ifError(result.error);
  const count = Number(result.stdout.match(new RegExp('^# tests (\\d+)\\s*$', 'm'))?.[1]);
  assert.ok(count >= minimumTests, `Empty/partial original selection: ${count}`);
  for (const field of ['fail', 'cancelled', 'skipped'])
    assert.match(result.stdout, new RegExp(`^# ${field} 0\\s*$`, 'm'));
  t.diagnostic(`Complete original profile: ${count} cases`);
}

test(
  'complete current proof and native execution profiles retain original fixtures and budgets',
  { timeout: budget, concurrency: true },
  async (t) => {
    await Promise.all([
      t.test('actual evidence, lifecycle and Explain algorithms', { timeout: budget }, (child) =>
        qualify(
          [
            'scripts/tests/unit/task-tracker/lib/criteria-revision/policy-evidence-activity.test.mjs',
            'scripts/tests/integration/task-tracker/lib/criteria-revision-consumers.test.mjs',
            'scripts/tests/unit/task-tracker/lib/story-approval-binding-guard.test.mjs',
            'scripts/tests/unit/task-tracker/lib/verification-receipt-retirement.test.mjs',
            'scripts/tests/unit/task-tracker/lib/evidence-v2/eligibility.test.mjs',
            'scripts/tests/integration/task-tracker/lib/action-evaluator.test.mjs',
          ],
          133,
          child
        )
      ),
      ...[
        ['native-proof-execution', 29],
        ['native-proof-execution-authority', 10],
        ['native-proof-execution-drift', 24],
        ['native-proof-execution-abort', 3],
      ].map(([name, minimum]) =>
        t.test(name, { timeout: budget }, (child) =>
          qualify([`scripts/tests/integration/task-tracker/lib/${name}.test.mjs`], minimum, child)
        )
      ),
    ]);
  }
);

test('the actual lifecycle reader rereads the same backend after a current approval becomes malformed', async () => {
  const f = await approvedFixture();
  const context = {
    cfg: { repo: f.context.repository },
    issueNumber: f.context.issue,
    deps: { revisionBackend: f.backend },
  };
  assert.deepEqual(await criteriaRevisionAdmissionGuard.run(context), { ok: true });
  f.backend.addComment({ id: 'bad', body: '<!-- aitm.criteria-revision-event/v1 {broken} -->' });
  const before = f.backend.effects.length;
  const result = await criteriaRevisionAdmissionGuard.run(context);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'revision-authority-unavailable');
  assertNoMutationEffects(f.backend.effects.slice(before));
});
