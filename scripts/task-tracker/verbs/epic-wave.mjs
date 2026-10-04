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
  if (!['prepare', 'record', 'resume', 'refresh', 'show', 'revoke'].includes(action))
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
  if (!Number.isSafeInteger(epic) || (action !== 'show' && !inputFile))
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
  if (!['prepared', 'recorded', 'ready', 'legacy', 'ungranted'].includes(result.status))
    process.exitCode = result.status === 'indeterminate' ? 6 : 4;
}
