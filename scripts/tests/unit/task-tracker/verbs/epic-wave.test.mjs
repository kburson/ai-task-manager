// @story #1872
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEpicWaveArgs, runEpicWave } from '../../../../task-tracker/verbs/epic-wave.mjs';
import { COMMAND_CATALOG } from '../../../../task-tracker/lib/command-surface/catalog.mjs';

test('closed command arguments accept every registered operation and reject unknown or duplicate inputs', () => {
  for (const action of ['prepare', 'record', 'resume', 'refresh', 'show', 'revoke']) {
    assert.equal(
      parseEpicWaveArgs([action, '107', '--input-file', '.scratch/gh/wave.json', '--json']).action,
      action
    );
  }
  for (const args of [
    ['record', '107', '--bypass'],
    ['show', '0'],
    ['prepare', '107', '108'],
    ['record', '107', '--input-file'],
  ]) {
    assert.throws(() => parseEpicWaveArgs(args));
  }
});

test('show is read-only, all mutations require parent authority and common admission locking', async () => {
  let effects = 0;
  const ctx = { rest: ['show', '107', '--input-file', 'scope.json'], cfg: { repo: 'o/r' } };
  const runtime = {
    async readSnapshot() {
      return { body: '', children: [] };
    },
    async listRecords() {
      return [];
    },
    async assertParent() {
      throw new Error('foreign parent');
    },
    async withLock(fn) {
      effects++;
      return fn();
    },
  };
  const source = { schema: 'aitm.epic-wave-selector/v1', rank: 2 };
  const read = () => JSON.stringify(source);
  await runEpicWave(ctx, { runtime, readFile: read });
  assert.equal(effects, 0);
  ctx.rest = ['prepare', '107', '--input-file', 'scope.json'];
  source.expiresAt = null;
  assert.equal((await runEpicWave(ctx, { runtime, readFile: read })).status, 'blocked');
});

test('operator catalog exposes scoped authority, recovery and no lifecycle mutation', () => {
  const help = COMMAND_CATALOG.find((command) => command.name === 'epic-wave');
  assert.match(JSON.stringify(help), /resume/);
  assert.match(JSON.stringify(help), /immutable/);
});
