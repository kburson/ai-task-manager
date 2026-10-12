// @story #1915
// Observe genuine reports and final policy calls; no minted execution authority.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import {
  assertResumeResult,
  unverifiedPartial,
  expectedCompleted16Tail,
  resumedStageOperations,
} from './native-stage-completed16-resume-controls.mjs';

export const completed16ReportAuditTrace = Object.freeze([
  ...Array(3).fill('authority-read'),
  'page-read',
  'native-history-readback',
  'native-proof-record-readback',
  'authority-read',
  'native-history-readback',
  ...Array(13).fill('authority-read'),
  'native-stage-existing-transition-read',
  ...resumedStageOperations,
  'authority-read',
  'page-read',
  'native-history-readback',
  ...Array(496).fill('authority-read'),
  'native-proof-record-readback',
  ...Array(2).fill('authority-read'),
  'native-history-readback',
  ...Array(418).fill('authority-read'),
  'page-read',
  'native-history-readback',
  ...Array(496).fill('authority-read'),
  'native-proof-record-readback',
  'authority-read',
  'native-history-readback',
  ...Array(413).fill('authority-read'),
]);

export function verifiedCompleted16Partial(selected) {
  const journal = selected.nativeStageRecords.at(-1);
  assert.equal(journal.steps.length, 16);
  assert.ok(journal.steps.every((step) => step.readback !== null));
  return {
    itemId: journal.header.intent.itemId,
    boardMoved: true,
    sentinelPresent: true,
    transitionCommitPresent: true,
    transitionCommitId: journal.steps[15].intent.commentId,
    progressVerified: true,
  };
}
function finalPolicySiteLine(kind = 'check') {
  const source = readFileSync(
    new URL('../../task-tracker/lib/criteria-revision/policy.mjs', import.meta.url),
    'utf8'
  );
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const root = ast.body.find(
    (node) =>
      node.type === 'ExportNamedDeclaration' &&
      node.declaration?.id?.name === 'tryNativeStageOriginalEntry'
  ).declaration;
  const calls = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression') calls.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object' && value.type) visit(value);
    }
  }
  visit(root);
  const evaluate = calls.find(
    (node) =>
      node.callee.type === 'MemberExpression' &&
      node.callee.object.name === 'core' &&
      node.callee.property.name === 'evaluateOriginalNativeStageRestart'
  );
  assert.ok(evaluate);
  const check = calls
    .filter((node) => {
      if (node.start <= evaluate.end) return false;
      if (kind === 'source')
        return (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.name === 'core' &&
          node.callee.property.name === 'assertOriginalNativeStageEntrySources'
        );
      return (
        node.callee.type === 'Identifier' &&
        node.callee.name === (kind === 'history' ? 'readMemoryNativeHistory' : 'check')
      );
    })
    .sort((a, b) => a.start - b.start)[0];
  assert.ok(check);
  return check.loc.start.line;
}

export async function qualifyCompleted16Reporting(options) {
  const { t, originalContext, snapshots, captureFiles } = options;
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16),
    expected = await expectedCompleted16Tail(selected);
  await t.test('clean original completed18 returns currently verified prior16 facts', async () => {
    const backend = createRevisionMemory(selected),
      files = captureFiles();
    const result = await moveState({ ...originalContext, revisionBackend: backend });
    assertResumeResult(result, verifiedCompleted16Partial(selected));
    assert.deepEqual(backend.snapshot, expected);
    assert.deepEqual(
      backend.effects.filter((name) => resumedStageOperations.includes(name)),
      resumedStageOperations
    );
    assert.deepEqual(captureFiles(), files);
    assert.deepEqual(
      backend.effects,
      completed16ReportAuditTrace,
      'complete current-report/final-policy audit trace'
    );
    t.diagnostic('completed16 verified report full trace: ' + JSON.stringify(backend.effects));
  });
  await t.test('post-evaluate policy refusal discards an actual verified report', async () => {
    const backend = createRevisionMemory(selected),
      files = captureFiles(),
      line = finalPolicySiteLine();
    const originalFreeze = Object.freeze,
      originalDescriptors = Object.getOwnPropertyDescriptors;
    let partial,
      fired = 0,
      effects,
      changed;
    Object.freeze = (value) => {
      const fields = originalDescriptors(value),
        stack = new Error().stack;
      if (
        !partial &&
        fields.progressVerified?.value === true &&
        fields.transitionCommitPresent?.value === true &&
        stack.includes('readMemoryNativeStagePartialFacts')
      )
        partial = value;
      return originalFreeze(value);
    };
    Object.getOwnPropertyDescriptors = (value) => {
      const fields = originalDescriptors(value),
        stack = new Error().stack;
      if (
        partial &&
        !fired &&
        fields.revisionBackend?.value === backend &&
        stack.includes('/criteria-revision/policy.mjs:' + line + ':')
      ) {
        fired++;
        changed = structuredClone(expected);
        changed.observation.executor.sessionId += '-final-policy-drift';
        effects = backend.effects;
        backend.replaceAuthority(changed.observation);
      }
      return fields;
    };
    let result;
    try {
      result = await moveState({ ...originalContext, revisionBackend: backend });
    } finally {
      Object.freeze = originalFreeze;
      Object.getOwnPropertyDescriptors = originalDescriptors;
    }
    assert.ok(
      partial,
      'genuine getter-free verified partial was produced before final policy control'
    );
    assert.equal(fired, 1, 'exact post-evaluate policy boundary observed after report');
    assertResumeResult(result, unverifiedPartial());
    assert.deepEqual(backend.snapshot, changed);
    assert.deepEqual(
      backend.effects,
      effects,
      'already refused final custody permits no subsequent audit'
    );
    assert.deepEqual(captureFiles(), files);
  });
}

export async function qualifyCompleted16LateReports(options) {
  const { t, originalContext, snapshots, captureFiles } = options;
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16),
    expected = await expectedCompleted16Tail(selected);
  for (const kind of ['request', 'raw-response', 'parsed-response', 'cache-read']) {
    await t.test(
      `retained ${kind} accessor after leaf cleanup prevents reporting audits`,
      async () => {
        const backend = createRevisionMemory(selected),
          files = captureFiles(),
          original = Object.getOwnPropertyDescriptors,
          originalDescriptor = Object.getOwnPropertyDescriptor,
          originalStackLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = 40;
        let fired = 0,
          gets = 0,
          effects;
        Object.getOwnPropertyDescriptors = (value) => {
          const fields = original(value),
            stack = new Error().stack;
          if (!fired && stack.includes('readCompleted16ResumePartial')) {
            let key;
            if (
              kind === 'request' &&
              stack.includes('assertNativeTransitionRequestUnchanged') &&
              fields.file?.value === 'gh'
            )
              key = 'args';
            if (
              kind === 'raw-response' &&
              stack.includes('assertMemoryExistingNativeStageTransitionResponse') &&
              fields.stdout &&
              fields.exitCode?.value === 0
            )
              key = 'stdout';
            if (
              kind === 'parsed-response' &&
              stack.includes('assertExistingNativeTransitionResult') &&
              fields.node_id &&
              fields.body
            )
              key = 'body';
            if (
              kind === 'cache-read' &&
              stack.includes('assertOriginalNativeCacheRead') &&
              fields.issue?.value === '#124'
            )
              key = 'issue';
            if (key && Object.hasOwn(fields[key], 'value')) {
              fired++;
              effects = backend.effects;
              Object.defineProperty(value, key, {
                enumerable: true,
                configurable: true,
                get() {
                  gets++;
                  return fields[key].value;
                },
              });
              return original(value);
            }
          }
          return fields;
        };
        Object.getOwnPropertyDescriptor = (value, key) => {
          const descriptor = originalDescriptor(value, key),
            stack = new Error().stack;
          if (
            kind === 'cache-read' &&
            !fired &&
            key === 'issue' &&
            descriptor?.value === '#124' &&
            stack.includes('assertOriginalNativeCacheRead') &&
            stack.includes('readCompleted16ResumePartial')
          ) {
            fired++;
            effects = backend.effects;
            Object.defineProperty(value, key, {
              enumerable: true,
              configurable: true,
              get() {
                gets++;
                return descriptor.value;
              },
            });
            return originalDescriptor(value, key);
          }
          return descriptor;
        };
        let result;
        try {
          result = await moveState({ ...originalContext, revisionBackend: backend });
        } finally {
          Object.getOwnPropertyDescriptors = original;
          Object.getOwnPropertyDescriptor = originalDescriptor;
          Error.stackTraceLimit = originalStackLimit;
        }
        assert.equal(
          fired,
          1,
          'actual retained return comparison reached reporting boundary after leaf cleanup'
        );
        assert.equal(gets, 0);
        assertResumeResult(result, unverifiedPartial());
        assert.deepEqual(backend.snapshot, expected);
        assert.deepEqual(
          backend.effects,
          effects,
          'no reporting/final audit after retained DATA custody refuses'
        );
        assert.deepEqual(captureFiles(), files);
      }
    );
  }
}

export async function qualifyCompleted16FinalSites(options) {
  const { t, originalContext, snapshots, captureFiles } = options;
  const { moveState } = await import('../../task-tracker/lib/move-state/move-state-core.mjs');
  const { createRevisionMemory } =
    await import('../../task-tracker/lib/criteria-revision/store.mjs');
  const selected = snapshots.get(16),
    expected = await expectedCompleted16Tail(selected);
  for (const kind of ['history', 'source']) {
    await t.test(`final ${kind} comparison discards a genuine verified report`, async () => {
      const backend = createRevisionMemory(selected),
        files = captureFiles(),
        line = finalPolicySiteLine(kind);
      const originalFreeze = Object.freeze,
        originalDescriptors = Object.getOwnPropertyDescriptors,
        originalClone = globalThis.structuredClone;
      const config = path.join(
        selected.observation.executor.worktree,
        '.ai-task-manager',
        'task-tracker.json'
      );
      const configBytes = readFileSync(config);
      let partial,
        fired = 0,
        effects;
      Object.freeze = (value) => {
        const fields = originalDescriptors(value);
        if (
          !partial &&
          fields.progressVerified?.value === true &&
          fields.transitionCommitPresent?.value === true &&
          new Error().stack.includes('readMemoryNativeStagePartialFacts')
        )
          partial = value;
        return originalFreeze(value);
      };
      globalThis.structuredClone = (value, ...args) => {
        const copy = originalClone(value, ...args),
          stack = new Error().stack;
        if (
          kind === 'history' &&
          partial &&
          !fired &&
          copy?.stages?.at(-1)?.steps.length === 18 &&
          stack.includes('readMemoryNativeHistory') &&
          stack.includes('/criteria-revision/policy.mjs:' + line + ':')
        ) {
          fired++;
          effects = backend.effects;
          copy.stages.at(-1).steps[17].readback = null;
        }
        return copy;
      };
      Object.getOwnPropertyDescriptors = (value) => {
        const fields = originalDescriptors(value),
          stack = new Error().stack;
        if (
          kind === 'source' &&
          partial &&
          !fired &&
          fields.revisionBackend?.value === backend &&
          stack.includes('assertOriginalNativeStageEntrySources') &&
          stack.includes('/criteria-revision/policy.mjs:' + line + ':')
        ) {
          fired++;
          effects = backend.effects;
          writeFileSync(config, Buffer.concat([configBytes, Buffer.from('\n')]));
        }
        return fields;
      };
      let result;
      try {
        result = await moveState({ ...originalContext, revisionBackend: backend });
      } finally {
        Object.freeze = originalFreeze;
        Object.getOwnPropertyDescriptors = originalDescriptors;
        globalThis.structuredClone = originalClone;
        writeFileSync(config, configBytes);
      }
      assert.ok(partial, 'actual verified Store report produced before final site');
      assert.equal(fired, 1, 'exact final site reached without an earlier refusal');
      assertResumeResult(result, unverifiedPartial());
      assert.deepEqual(
        backend.snapshot,
        expected,
        'final history DATA substitution does not mutate actual backend'
      );
      if (kind === 'source')
        assert.deepEqual(backend.effects, effects, 'final source refusal performs no later audit');
      t.diagnostic(`completed16 final ${kind} full trace: ` + JSON.stringify(backend.effects));
      assert.deepEqual(captureFiles(), files);
    });
  }
}
