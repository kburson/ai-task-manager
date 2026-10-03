// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';

test('batched cwd observations keep missing and duplicate process evidence unavailable', async () => {
  const { parseRuntimeProcessCwds } =
    await import('../../../../task-tracker/lib/runtime-process-census.mjs');
  const result = parseRuntimeProcessCwds('p12\nfcwd\nn/repo with spaces\np13\nfcwd\nn/linked\n');
  assert.equal(result.get(12), '/repo with spaces');
  assert.equal(result.get(13), '/linked');
  assert.equal(result.has(14), false);
  assert.throws(() => parseRuntimeProcessCwds('n/unowned'));
  assert.throws(() => parseRuntimeProcessCwds('p12\nn/one\nn/two'));
});

test('process observation preserves executable paths containing spaces without parsing argv as executable identity', async () => {
  const { parseRuntimeProcessSnapshot } =
    await import('../../../../task-tracker/lib/runtime-process-census.mjs');
  const rows = parseRuntimeProcessSnapshot(
    ' 12 1 /Applications/Node Runtime/bin/node\n13 1 /bin/zsh\n'
  );
  assert.deepEqual(rows, [
    { pid: 12, ppid: 1, executable: '/Applications/Node Runtime/bin/node', args: [] },
    { pid: 13, ppid: 1, executable: '/bin/zsh', args: [] },
  ]);
  assert.throws(() => parseRuntimeProcessSnapshot('12 ? node'));
});

test('process census separates actual current/registered router ancestry from uncooperative or unknown writers', async () => {
  const { observeRuntimeProcesses } =
    await import('../../../../task-tracker/lib/runtime-process-census.mjs');
  const snapshot = [
    {
      pid: 1,
      ppid: 9,
      executable: '/usr/bin/node',
      args: ['/usr/bin/node', '/package/bin/aitm.mjs', 'migrate-runtime', 'plan'],
    },
    {
      pid: 2,
      ppid: 1,
      executable: '/usr/bin/node',
      args: [
        '/usr/bin/node',
        '/package/scripts/task-tracker/task-tracker.mjs',
        'migrate-runtime',
        'plan',
      ],
    },
    {
      pid: 3,
      ppid: 9,
      executable: '/usr/bin/node',
      args: ['/usr/bin/node', '/repo/old-writer.mjs'],
    },
    { pid: 4, ppid: 9, executable: '/usr/bin/node', args: ['/usr/bin/node', '/other/server.mjs'] },
  ];
  const input = {
    roots: ['/repo', '/linked'],
    currentPid: 2,
    parentPid: 1,
    registeredRouter: '/package/bin/aitm.mjs',
    adapters: {
      readSnapshot: () => snapshot,
      readCwd: (pid) => (pid === 3 ? '/repo/subdir' : '/other'),
      physical: (value) => value,
    },
  };
  const result = observeRuntimeProcesses(input);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.processes.map((entry) => entry.pid),
    [3]
  );
  assert.equal(result.processes[0].projectRoot, '/repo');
  const unknown = observeRuntimeProcesses({
    ...input,
    adapters: {
      ...input.adapters,
      readCwd: () => {
        throw new Error('unavailable');
      },
    },
  });
  assert.equal(unknown.complete, false);
  assert.ok(unknown.unknown.some((entry) => entry.pid === 3));
  const impostor = observeRuntimeProcesses({
    ...input,
    adapters: {
      ...input.adapters,
      readSnapshot: () =>
        snapshot.map((entry) =>
          entry.pid === 1
            ? { ...entry, args: ['/usr/bin/node', '/copy/bin/aitm.mjs', 'migrate-runtime', 'plan'] }
            : entry
        ),
      readCwd: () => '/repo',
    },
  });
  assert.ok(impostor.processes.some((entry) => entry.pid === 1));
  let calls = 0;
  const changing = observeRuntimeProcesses({
    ...input,
    adapters: {
      ...input.adapters,
      readSnapshot: () => (++calls === 1 ? snapshot : snapshot.filter((entry) => entry.pid !== 4)),
    },
  });
  assert.equal(changing.complete, false);
});
