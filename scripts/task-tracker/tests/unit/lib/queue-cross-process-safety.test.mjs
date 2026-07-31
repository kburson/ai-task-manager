// @story #1049

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { drain, enqueue, peek } from '../../../queue.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

const worker = fileURLToPath(new URL('../../fixtures/queue-mutation-worker.mjs', import.meta.url));

function fixture() {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-queue-cross-process-'));
  return { dir, queuePath: path.join(dir, 'queue.json') };
}

function startWorker(operation, queuePath, readyPath, goPath, payload) {
  const child = spawn(
    process.execPath,
    [worker, operation, queuePath, readyPath, goPath, JSON.stringify(payload)],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const completed = new Promise((resolve, reject) => {
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`queue worker exited ${code}: ${stderr}`));
    });
  });
  return { child, completed };
}

async function waitForPath(filePath, child, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(filePath)) {
    if (child.exitCode !== null) {
      throw new Error(`queue worker exited before acquiring mutation lock: ${child.exitCode}`);
    }
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${filePath}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('drain final reconciliation preserves a cross-process enqueue at its boundary', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ issue: '#1049', row: 'delivered' }, queuePath);
    let interleaved = false;
    await drain(async () => {}, queuePath, {
      beforeFinalReconcile: async () => {
        interleaved = true;
        const ready = path.join(dir, 'enqueue.ready');
        const go = path.join(dir, 'enqueue.go');
        const child = startWorker('enqueue', queuePath, ready, go, { issue: '#1050', row: 'new' });
        await waitForPath(ready, child.child);
        writeFileSync(go, 'go\n');
        await child.completed;
      },
    });
    assert.equal(interleaved, true);
    assert.deepEqual(
      peek(queuePath).map((item) => item.row),
      ['new']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exact remover and enqueue serialize on one shared queue mutation lock', async () => {
  const { dir, queuePath } = fixture();
  try {
    enqueue({ issue: '#1049', row: 'delivered' }, queuePath);
    const target = peek(queuePath)[0];
    const removeReady = path.join(dir, 'remove.ready');
    const removeGo = path.join(dir, 'remove.go');
    const remover = startWorker('remove', queuePath, removeReady, removeGo, [target]);
    await waitForPath(removeReady, remover.child);

    const enqueueReady = path.join(dir, 'enqueue.ready');
    const enqueueGo = path.join(dir, 'enqueue.go');
    writeFileSync(enqueueGo, 'go\n');
    const writer = startWorker('enqueue', queuePath, enqueueReady, enqueueGo, {
      issue: '#1050',
      row: 'new',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(existsSync(enqueueReady), false, 'enqueue must wait for exact remover');
    writeFileSync(removeGo, 'go\n');
    await Promise.all([remover.completed, writer.completed]);

    assert.deepEqual(
      peek(queuePath).map((item) => item.row),
      ['new']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('two cross-process writers serialize without losing rows or sharing a temp path', async () => {
  const { dir, queuePath } = fixture();
  try {
    const firstReady = path.join(dir, 'first.ready');
    const firstGo = path.join(dir, 'first.go');
    const first = startWorker('enqueue', queuePath, firstReady, firstGo, {
      issue: '#1049',
      row: 'first',
    });
    await waitForPath(firstReady, first.child);

    const secondReady = path.join(dir, 'second.ready');
    const secondGo = path.join(dir, 'second.go');
    writeFileSync(secondGo, 'go\n');
    const second = startWorker('enqueue', queuePath, secondReady, secondGo, {
      issue: '#1050',
      row: 'second',
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(existsSync(secondReady), false, 'second writer must wait for the shared lock');
    writeFileSync(firstGo, 'go\n');
    await Promise.all([first.completed, second.completed]);

    assert.deepEqual(
      peek(queuePath)
        .map((item) => item.row)
        .sort(),
      ['first', 'second']
    );
    const source = readFileSync(new URL('../../../queue.mjs', import.meta.url), 'utf8');
    assert.match(source, /\.tmp-\$\{process\.pid\}-/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
