// @story #1855
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withMemoryTransportQuarantine, withMemoryStageEffectQuarantine } from '../../../../task-tracker/lib/criteria-revision/transport-quarantine.mjs';
const original = promisify(execFile);
const load = () => import('../../../../task-tracker/lib/move-state/native-command.mjs');
test('shared original move command preserves ordinary stdout stderr promise and child handle', async () => {
  const { nativeMoveExecFile } = await load();
  const receiver = { name: 'actual ordinary method receiver' };
  const args = [process.execPath, ['-e', 'process.stdout.write("OUT");process.stderr.write("ERR")'], { encoding: 'utf8', timeout: 15000 }];
  const expected = original.apply(receiver, args);
  const actual = nativeMoveExecFile.apply(receiver, args);
  assert.ok(expected.child); assert.ok(actual.child);
  assert.deepEqual(await actual, await expected);
  assert.equal(actual.child.exitCode, 0);
});
test('shared original move command preserves ordinary rejection fields and child failure', async () => {
  const { nativeMoveExecFile } = await load();
  const args = [process.execPath, ['-e', 'process.stdout.write("OUT");process.stderr.write("ERR");process.exit(7)'], { encoding: 'utf8', timeout: 15000 }];
  const expected = await original(...args).catch(error => error);
  const actual = await nativeMoveExecFile(...args).catch(error => error);
  for (const key of ['code', 'signal', 'killed', 'stdout', 'stderr', 'cmd']) assert.deepEqual(actual[key], expected[key]);
  assert.equal(actual.constructor, expected.constructor);
});
for (const [name, scope] of [['transport', withMemoryTransportQuarantine], ['stage', withMemoryStageEffectQuarantine]]) {
  test('shared move command denies ' + name + ' scope before public argument access or process creation', async () => {
    const { nativeMoveExecFile } = await load(); let gets = 0;
    const file = { toString() { gets++; return process.execPath; } };
    const args = []; Object.defineProperty(args, 0, { get() { gets++; return '-e'; } });
    let result;
    assert.throws(() => scope(() => { result = nativeMoveExecFile(file, args, { get timeout() { gets++; return 15000; } }); }), error => error.code === 'revision-authority-unavailable');
    assert.equal(result, undefined); assert.equal(gets, 0);
  });
}
