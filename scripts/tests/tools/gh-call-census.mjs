// @story #1410
import { spawn } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';

const VALID_LANES = new Set(['unit', 'integration', 'slow']);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RUNNER = path.join(ROOT, 'scripts/run-tests.mjs');
const PRELOAD = path.join(ROOT, 'scripts/tests/fixtures/gh-census-preload.mjs');

export function parseLanes(argv) {
  const lanes = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    let lane;
    if (arg === '--lane') lane = argv[++index];
    else if (arg.startsWith('--lane=')) lane = arg.slice('--lane='.length);
    else throw new Error(`gh-call-census: unknown argument: ${arg}`);
    if (!VALID_LANES.has(lane)) {
      throw new Error(`gh-call-census: --lane must be unit|integration|slow (got: ${lane})`);
    }
    lanes.push(lane);
  }
  if (lanes.length === 0) throw new Error('gh-call-census: provide at least one --lane');
  return lanes;
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

async function runCanonicalLane({ lane, env, outputPath }) {
  return new Promise((resolve, reject) => {
    const output = openSync(outputPath, 'w');
    const child = spawn(process.execPath, [RUNNER, '--lane', lane], {
      cwd: ROOT,
      env,
      stdio: ['ignore', output, output],
    });
    child.on('error', (error) => {
      closeSync(output);
      reject(error);
    });
    child.on('close', (code) => {
      closeSync(output);
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

export async function runLaneCensus(lane, { runLane = runCanonicalLane } = {}) {
  if (!VALID_LANES.has(lane)) throw new Error(`gh-call-census: invalid lane: ${lane}`);
  const scratchDir = mkdtempSync(path.join(projectScratchDir('test'), `gh-census-${lane}-`));
  const logPath = path.join(scratchDir, 'calls.log');
  const outputPath = path.join(scratchDir, 'lane.log');
  const executable = path.join(scratchDir, 'gh');
  writeFileSync(logPath, '');
  writeFileSync(
    executable,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> ${shellSingleQuote(logPath)}`,
      `printf 'gh-call-census: refused real gh: %s\\n' "$*" >&2`,
      'exit 86',
      '',
    ].join('\n')
  );
  chmodSync(executable, 0o755);

  let exitCode = 1;
  let calls = [];
  let laneOutput = [];
  try {
    const env = {
      ...process.env,
      AITM_GH_CENSUS_BIN: scratchDir,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--import=${pathToFileURL(PRELOAD).href}`]
        .filter(Boolean)
        .join(' '),
      PATH: `${scratchDir}${path.delimiter}${process.env.PATH ?? ''}`,
    };
    exitCode = await runLane({ lane, env, outputPath });
    calls = existsSync(logPath)
      ? readFileSync(logPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((args) => `gh ${args}`)
          .sort()
      : [];
    if (exitCode !== 0 && existsSync(outputPath)) {
      laneOutput = readFileSync(outputPath, 'utf8').trimEnd().split('\n').slice(-40);
    }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
  return { lane, exitCode, calls, laneOutput, scratchDir };
}

export function censusPassed(results) {
  return results.every(({ exitCode, calls }) => exitCode === 0 && calls.length === 0);
}

export function formatCensus(results) {
  const lines = [];
  for (const { lane, exitCode, calls, laneOutput = [] } of results) {
    lines.push(
      `gh-call-census: ${lane}: ${calls.length} real gh invocation(s); lane exit ${exitCode}`
    );
    for (const call of calls) lines.push(`  ${call}`);
    for (const line of laneOutput) lines.push(`  lane: ${line}`);
  }
  lines.push(`gh-call-census: ${censusPassed(results) ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

async function main() {
  const lanes = parseLanes(process.argv.slice(2));
  const results = [];
  for (const lane of lanes) results.push(await runLaneCensus(lane));
  process.stdout.write(`${formatCensus(results)}\n`);
  if (!censusPassed(results)) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
