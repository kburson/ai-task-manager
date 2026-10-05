// @story #1872
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRankWaveRuntime } from '../lib/epic-rank-wave-runtime.mjs';
import { exactRankWaveKeys } from '../lib/epic-rank-wave-authority.mjs';
import {
  prepareRankWave,
  executeRankWaveWrite,
  inspectRankWavePublication,
} from '../lib/epic-rank-wave-store.mjs';

export function parseEpicWaveArgs(rest = []) {
  const [action, ...args] = rest;
  if (
    ![
      'prepare',
      'record',
      'resume',
      'refresh',
      'show',
      'revoke',
      'lock-show',
      'lock-release',
    ].includes(action)
  )
    throw new TypeError('epic-wave: action');
  let epic = null,
    inputFile = null,
    json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    if (/^#?[1-9]\d*$/.test(arg) && epic === null) epic = Number(arg.replace(/^#/, ''));
    else if (
      arg === '--input-file' &&
      inputFile === null &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    )
      inputFile = String(args[++i]);
    else if (arg === '--json' && !json) json = true;
    else throw new TypeError('epic-wave: unknown or duplicate argument');
  }
  if (!Number.isSafeInteger(epic) || (!['show', 'lock-show'].includes(action) && !inputFile))
    throw new TypeError('epic-wave: issue or input');
  return { action, epic, inputFile, json };
}
export async function runEpicWave(ctx, deps = {}) {
  const args = parseEpicWaveArgs(ctx.rest);
  const input = args.inputFile
    ? JSON.parse((deps.readFile ?? readFileSync)(args.inputFile, 'utf8'))
    : null;
  const runtime = deps.runtime ?? createRankWaveRuntime({ ...ctx, waveEpic: args.epic });
  const repository = ctx.cfg.repo,
    epic = args.epic;
  const now = (deps.now ?? (() => new Date().toISOString()))();
  if (args.action === 'lock-show') {
    if (input) throw new TypeError('epic-wave: lock-show takes no input');
    return runtime.inspectLock();
  }
  if (args.action === 'lock-release') {
    exactRankWaveKeys(input, ['schema', 'observation']);
    if (input.schema !== 'aitm.epic-admission-lock-release/v1')
      throw new TypeError('epic-wave: lock-release schema');
    await runtime.assertParent(epic);
    return runtime.releaseLock(input.observation);
  }
  if (['prepare', 'show'].includes(args.action)) {
    if (!input) throw new TypeError('epic-wave: read selector requires --input-file');
    exactRankWaveKeys(
      input,
      args.action === 'prepare' ? ['schema', 'rank', 'expiresAt'] : ['schema', 'rank']
    );
    if (
      input.schema !== 'aitm.epic-wave-selector/v1' ||
      typeof input.rank !== 'number' ||
      !Number.isFinite(input.rank) ||
      input.rank < 0
    )
      throw new TypeError('epic-wave: selector');
    return args.action === 'prepare'
      ? prepareRankWave({
          repository,
          epic,
          rank: input.rank,
          operationId: randomUUID(),
          expiresAt: input.expiresAt,
          runtime,
        })
      : inspectRankWavePublication({ repository, epic, rank: input.rank, now, runtime });
  }
  return executeRankWaveWrite({ action: args.action, repository, epic, input, now, runtime });
}
export async function verbEpicWave(ctx) {
  const result = await runEpicWave(ctx);
  console.log(JSON.stringify({ schema: 'aitm.epic-wave-result/v1', ...result }));
  if (
    !['prepared', 'recorded', 'ready', 'legacy', 'ungranted', 'released'].includes(result.status) &&
    parseEpicWaveArgs(ctx.rest).action !== 'lock-show'
  )
    process.exitCode = result.status === 'indeterminate' ? 6 : 4;
}
