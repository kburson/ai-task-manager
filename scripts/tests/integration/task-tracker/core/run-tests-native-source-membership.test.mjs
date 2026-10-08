// @story #1855
// Source/discovery audit only: never imports or executes the native fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { laneFiles } from '../../../../run-tests-lanes.mjs';
import { planShards, validateShardReceipts } from '../../../../run-tests-shards.mjs';
import { planSerialSections } from '../../../../run-tests-schedule.mjs';
import { loadSerialSectionMetadata } from '../../../../run-tests-native-sections.mjs';
import { NATIVE_SERIAL_MEMBERS } from '../../../../run-tests-native-members.mjs';
const root = fileURLToPath(new URL('../../../../../', import.meta.url));
const modes = {
  'sentinel-late-persist-token-accessor': 'sentinel/persist-token',
  'sentinel-late-persist-token-identity': 'sentinel/persist-token',
  'sentinel-late-persist-invocation-accessor': 'sentinel/persist-invocation',
  'sentinel-late-persist-invocation-identity': 'sentinel/persist-invocation',
  'sentinel-late-persist-step-accessor': 'sentinel/persist-step',
  'sentinel-late-persist-step-identity': 'sentinel/persist-step',
  'sentinel-late-effect-token-accessor': 'sentinel/effect-authority',
  'sentinel-late-effect-token-identity': 'sentinel/effect-authority',
  'sentinel-late-context-issue-accessor': 'sentinel/context-continuity',
  'sentinel-late-context-executor-accessor': 'sentinel/context-continuity',
  'sentinel-late-context-identity': 'sentinel/context-continuity',
  false: 'captured-stage-authority',
  true: 'whole-transition',
  vertical: 'whole-transition',
  preparation: 'captured-stage-authority',
  historical: 'captured-stage-authority',
  intent: 'header-actor-journal',
  'actor-journal': 'header-actor-journal',
  'actor-publication': 'actor-timing-baseline',
  'actor-publication-existing': 'actor-timing-baseline',
  'actor-cursor': 'actor-cursor-baseline',
  'actor-cursor-legacy': 'actor-cursor-baseline',
  'actor-cursor-absent': 'actor-cursor-baseline',
  'actor-checkpoint': 'checkpoint-baseline',
  'actor-checkpoint-host': 'checkpoint-baseline',
  'actor-remove': 'actor-removal-baseline',
  'actor-final': 'actor-final-baseline',
  board: 'board-status-baseline',
  'sentinel-data': 'sentinel-data',
  'sentinel-history': 'sentinel-history',
  'sentinel-intent': 'sentinel-intent',
  'sentinel-complete': 'sentinel-complete',
  'board-exception': 'board-exception',
  'entry-body': 'entry-body-baseline',
  'entry-adversarial': 'entry-body-baseline',
  'entry-intent': 'entry-body-baseline',
  'phase-pair': 'phase-baseline',
  'phase-adversarial': 'phase-baseline',
  'transition-native': 'original-entry-scope',
  'transition-override': 'original-entry-scope',
  'actor-override': 'original-entry-scope',
  'entry-helper-override': 'original-entry-scope',
  'late-sources': 'stage-current-source',
  'status-source-unreleased': 'stage-current-source',
  'status-source-read': 'stage-current-source',
  'status-source-custody-input': 'board-status-source/custody',
  'status-source-custody-output': 'board-status-source/custody',
  'status-source-custody-error': 'board-status-source/custody',
  'status-source-late-config': 'board-status-source/current',
  'status-source-late-vector': 'board-status-source/current',
  'status-source-close': 'board-status-source/errors',
  'status-source-parse': 'board-status-source/errors',
  'status-source-parser': 'board-status-source/errors',
  'status-source-values': 'board-status-source/values',
  'status-source-unused': 'board-status-source/values',
  'status-source-exhausted': 'board-status-source/values',
  'root-adapter': 'stage-current-source',
};
const prefixModes = new Set([
  'sentinel-prefix',
  'board-exception-prefix',
  'status-source-prefix',
  'board-prefix',
  'entry-body-prefix',
  'actor-checkpoint-actor-prefix',
  'actor-checkpoint-session-prefix',
  'actor-checkpoint-tracker-prefix',
  'actor-cursor-prefix',
  'actor-final-actor-prefix',
  'actor-final-session-prefix',
  'actor-final-tracker-prefix',
  'actor-journal-prefix',
  'actor-publication-prefix',
  'intent-prefix',
  'phase-11-prefix',
  'phase-12-prefix',
]);

test('canonical source registrations independently agree with exact semantic membership and complete three-shard union', () => {
  const inventory = laneFiles('integration', { projectRoot: root });
  const native = inventory.filter((file) => path.basename(file).startsWith('native-'));
  assert.deepEqual(Object.keys(NATIVE_SERIAL_MEMBERS).sort(), [...native].sort());
  const entries = loadSerialSectionMetadata(
    inventory.map((label) => ({ label, full: path.join(root, label) }))
  );
  const byFile = new Map(entries.map((entry) => [entry.label, entry]));
  for (const file of native) {
    const source = readFileSync(path.join(root, file), 'utf8');
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const registrations = ast.body.filter(
      (n) =>
        n.type === 'ExpressionStatement' &&
        n.expression.type === 'CallExpression' &&
        n.expression.callee.name === 'registerNativeStageCase'
    );
    const actual = byFile.get(file).nativeMetadata;
    if (actual === null) {
      assert.equal(registrations.length, 0, file);
      continue;
    }
    assert.equal(registrations.length, 1, file);
    const call = registrations[0].expression;
    assert.equal(call.arguments[0].type, 'Literal', file);
    assert.equal(call.arguments[0].value, actual.mode, file);
    assert.equal(ast.body.length, 2, file);
    assert.equal(ast.body[0].type, 'ImportDeclaration', file);
    assert.equal(ast.body[0].source.value, './native-stage-continuation-fixture.mjs', file);
    assert.equal(ast.body[0].specifiers.length, 1, file);
    assert.equal(ast.body[0].specifiers[0].imported.name, 'registerNativeStageCase', file);
    assert.equal(ast.body[0].specifiers[0].local.name, 'registerNativeStageCase', file);
    let expected;
    if (call.arguments.length === 3) {
      assert.ok(prefixModes.has(actual.mode), file);
      const properties = call.arguments[2].properties;
      assert.equal(properties.length, 2, file);
      const fault = Object.fromEntries(
        properties.map((p) => [p.key.name ?? p.key.value, p.value.value])
      );
      assert.deepEqual(fault, { when: actual.when, suffix: actual.suffix }, file);
      assert.ok(['failBefore', 'failAfter'].includes(fault.when), file);
      const allowed =
        actual.mode === 'board-exception-prefix'
          ? ['write', 'readback', 'outcome-write', 'outcome-readback']
          : ['intent-prefix', 'status-source-prefix'].includes(actual.mode)
            ? ['write', 'readback']
            : actual.mode === 'actor-journal-prefix'
              ? ['effect-write', 'effect-readback']
              : ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'];
      assert.ok(allowed.includes(fault.suffix), file);
      expected =
        actual.mode === 'status-source-prefix'
          ? 'board-status-source/record'
          : actual.mode === 'board-exception-prefix'
            ? 'board-exception/' +
              (['outcome-write', 'outcome-readback'].includes(fault.suffix) ? 'outcome' : 'record')
            : actual.mode.slice(0, -7) +
              '/' +
              (['effect-write', 'effect-readback'].includes(fault.suffix) ? 'effect' : 'intent');
    } else {
      assert.equal(call.arguments.length, 2, file);
      assert.equal(actual.when, null, file);
      assert.equal(actual.suffix, null, file);
      expected = modes[actual.mode];
      assert.ok(expected, file);
    }
    assert.equal(NATIVE_SERIAL_MEMBERS[file].section, 'native/' + expected, file);
  }
  const sections = planSerialSections(entries);
  assert.deepEqual(
    sections.flatMap((section) => section.entries.map((e) => e.label)).sort(),
    [...inventory].sort()
  );
  assert.equal(new Set(sections.map((section) => section.name)).size, sections.length);
  for (const section of sections.filter((s) => s.entries[0]?.nativeMetadata?.when))
    assert.equal(section.entries.length, 4, section.name);
  const shards = planShards(inventory, 3);
  assert.deepEqual(shards.flat().sort(), [...inventory].sort());
  for (const shard of shards) {
    const selected = entries.filter((e) => shard.includes(e.label));
    assert.deepEqual(
      planSerialSections(selected)
        .flatMap((s) => s.entries.map((e) => e.label))
        .sort(),
      [...shard].sort()
    );
  }
});

test('real native source plan validates complete receipts and rejects reordered groups and saved pass', () => {
  const native = Object.keys(NATIVE_SERIAL_MEMBERS)
    .filter((file) =>
      ['native/phase-12/intent', 'native/phase-12/effect'].includes(
        NATIVE_SERIAL_MEMBERS[file].section
      )
    )
    .sort();
  assert.equal(native.length, 8);
  const entries = loadSerialSectionMetadata(
    native.map((label) => ({ label, full: path.join(root, label) }))
  );
  const sections = planSerialSections(entries).map((section) => ({
    name: section.name,
    files: section.entries.map((e) => e.label),
    elapsedMs: 500000,
  }));
  const commit = 'a'.repeat(40);
  const receipt = {
    exitCode: 0,
    timing: {
      schema: 6,
      lane: 'integration',
      commit,
      generatedAt: '2026-10-07T00:00:00Z',
      runnerProfile: { platform: 'linux', nodeVersion: '24.0.0' },
      count: native.length,
      discoveryInventory: native,
      files: Object.fromEntries(native.map((file) => [file, { status: 0, wallMs: 125000 }])),
      executionSections: sections,
    },
  };
  const validate = (value) =>
    validateShardReceipts([value], { inventory: native, lane: 'integration', commit, total: 1 });
  assert.equal(validate(receipt).count, 8); // aggregate >600s is observational; each actual section bounded.
  for (const change of [
    (r) => r.timing.executionSections.reverse(),
    (r) => {
      r.timing.executionSections[0].elapsedMs = 600001;
    },
    (r) => {
      r.timing.executionSections[0].files.reverse();
    },
    (r) => {
      r.timing.executionSections[0].passed = true;
    },
    (r) => {
      r.timing.schema = 5;
    },
  ]) {
    const changed = structuredClone(receipt);
    change(changed);
    assert.throws(() => validate(changed), /section|schema/);
  }
});
