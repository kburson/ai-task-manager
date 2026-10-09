// @story #1855 #1913
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  withMemoryTransportQuarantine,
  withMemoryStageEffectQuarantine,
} from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
const original = promisify(execFile);
const load = () => import('../../../../task-tracker/lib/move-state/native-command.mjs');
test('shared original move command preserves ordinary stdout stderr promise and child handle', async () => {
  const { nativeMoveExecFile } = await load();
  const receiver = { name: 'actual ordinary method receiver' };
  const args = [
    process.execPath,
    ['-e', 'process.stdout.write("OUT");process.stderr.write("ERR")'],
    { encoding: 'utf8', timeout: 15000 },
  ];
  const expected = original.apply(receiver, args);
  const actual = nativeMoveExecFile.apply(receiver, args);
  assert.ok(expected.child);
  assert.ok(actual.child);
  assert.deepEqual(await actual, await expected);
  assert.equal(actual.child.exitCode, 0);
});
test('shared original move command preserves ordinary rejection fields and child failure', async () => {
  const { nativeMoveExecFile } = await load();
  const args = [
    process.execPath,
    ['-e', 'process.stdout.write("OUT");process.stderr.write("ERR");process.exit(7)'],
    { encoding: 'utf8', timeout: 15000 },
  ];
  const expected = await original(...args).catch((error) => error);
  const actual = await nativeMoveExecFile(...args).catch((error) => error);
  for (const key of ['code', 'signal', 'killed', 'stdout', 'stderr', 'cmd'])
    assert.deepEqual(actual[key], expected[key]);
  assert.equal(actual.constructor, expected.constructor);
});
for (const [name, scope] of [
  ['transport', withMemoryTransportQuarantine],
  ['stage', withMemoryStageEffectQuarantine],
]) {
  test(
    'shared move command denies ' +
      name +
      ' scope before public argument access or process creation',
    async () => {
      const { nativeMoveExecFile } = await load();
      let gets = 0;
      const file = {
        toString() {
          gets++;
          return process.execPath;
        },
      };
      const args = [];
      Object.defineProperty(args, 0, {
        get() {
          gets++;
          return '-e';
        },
      });
      let result;
      assert.throws(
        () =>
          scope(() => {
            result = nativeMoveExecFile(file, args, {
              get timeout() {
                gets++;
                return 15000;
              },
            });
          }),
        (error) => error.code === 'revision-authority-unavailable'
      );
      assert.equal(result, undefined);
      assert.equal(gets, 0);
    }
  );
}

// #1913 complete original cache effect/current input profiles, independently selected.
import {
  budget,
  discoverOriginalCases,
  qualifyOriginalCases,
  qualify,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';
const allCache = discoverOriginalCases().filter(({ mode }) => mode.startsWith('tail-cache'));
const effects = allCache.filter(
  ({ mode, fault }) =>
    mode !== 'tail-cache' || !fault || ['effect-write', 'effect-readback'].includes(fault.suffix)
);
test('complete cache descriptor partition retains positive all eight faults and two late sources', () => {
  assert.equal(allCache.length, 11);
  assert.equal(effects.length, 7);
  assert.deepEqual(
    allCache
      .filter(({ fault }) => fault)
      .map(({ fault }) => fault.when + ':' + fault.suffix)
      .sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'].map(
          (suffix) => when + ':' + suffix
        )
      )
      .sort()
  );
  assert.deepEqual(
    allCache
      .filter(({ mode }) => mode !== 'tail-cache')
      .map(({ mode }) => mode)
      .sort(),
    ['tail-cache-late-config', 'tail-cache-late-read']
  );
});
test('complete original cache public boundary profiles', { timeout: budget }, (t) =>
  qualify(
    ['scripts/tests/unit/task-tracker/lib/criteria-revision/native-stage-cache-boundary.test.mjs'],
    11,
    t
  )
);
test(
  'actual cache effects and current-source cases preserve full original predecessor and resources',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(effects, t)
);
