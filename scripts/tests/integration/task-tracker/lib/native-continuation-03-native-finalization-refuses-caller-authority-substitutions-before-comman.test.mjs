// @story #1855
import { assert, currentSessionId, nativeFinalFixture, parseVerificationCommands, path, runDevelopVerification, setActiveTask, test, withRevisionConsumer, writeFileSync } from './native-continuation-fixtures.mjs';

test('native finalization refuses caller authority substitutions before command execution', async (t) => {
  const f = await nativeFinalFixture();
  try {
    const originalConfig = JSON.stringify({ repo: f.context.repository });
    const configFile = path.join(f.projectDir, '.ai-task-manager', 'task-tracker.json');
    const timed = { issue: `#${f.context.issue}`, entryStartTs: new Date().toISOString(), worktreePath: f.projectDir, worktreeBranch: 'trunk' };
    const cases = [
      ...['runCommand', 'getHeadSha', 'isClean', 'buildFingerprint', 'createReceipt', 'resolveProvider', 'now'].map(key => [key, (input, calls) => { input.deps = { [key]: () => { calls.push(key); return true; } }; }]),
      ['different VC set', input => { input.verificationCommands = []; }],
      ['weaker caller provider', input => { input.verificationProvider = { id: 'project', develop: { iterationSteps: [],
        finalSteps: [{ classification: 'weak-check', kind: 'test', command: 'node supported-hook.test.mjs' }] },
        test: { setup: 'npm-ci', steps: [{ classification: 'weak-test', kind: 'test', command: 'node supported-hook.test.mjs' }] } }; }],
      ['different caller develop config', input => { input.developVerification = { changed: true }; }],
      ['malformed selected config', () => writeFileSync(configFile, '{broken')],
      ['foreign selected repository', () => writeFileSync(configFile, JSON.stringify({ repo: 'foreign/repository' }))],
      ['paused timing', () => setActiveTask(currentSessionId(), { ...timed, paused: true }, f.projectDir)],
    ];
    for (const [name, alter] of cases) await t.test(name, async () => {
      writeFileSync(configFile, originalConfig);
      setActiveTask(currentSessionId(), timed, f.projectDir);
      const calls = [];
      const input = { projectDir: f.projectDir, issueNumber: f.context.issue, mode: 'final',
        verificationCommands: parseVerificationCommands(f.backend.observation.body.bytes) };
      alter(input, calls);
      const result = await withRevisionConsumer({ repository: f.context.repository, issue: f.context.issue,
        backend: f.backend, activity: 'stage-write' }, () => runDevelopVerification(input));
      assert.equal(result.ok, false);
      assert.equal(result.reasons[0].code, 'native-final-authority');
      assert.deepEqual(result.commands, []);
      assert.equal(result.nativeExecutionToken, undefined);
      assert.deepEqual(calls, []);
      assert.equal(f.backend.snapshot.nativeProofRecords?.length ?? 0, 0);
      assert.deepEqual(f.effects, []);
    });
  } finally { f.dispose(); }
});
