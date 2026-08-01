#!/usr/bin/env node
// @story #1090
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { projectScratchDir } from '../task-tracker/lib/scratch-dir.mjs';

const HELP = `compare-test-fixtures — compare a test cluster between two git refs

Usage:
  node scripts/benchmarks/compare-test-fixtures.mjs \\
    --baseline-ref <ref> --candidate-ref <ref> \\
    --file <path> [--file <path> ...] [--samples 5] [--output <json>]

Use --baseline-file and --candidate-file when the compositions have different paths.
Each cycle runs the first invocation as cold and an immediate repeat as warm; ref order alternates.
`;

function takeValue(args, index, flag) {
  const value = args[index + 1];
  if (value == null || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseBenchmarkArgs(args = []) {
  const parsed = {
    baselineRef: null,
    candidateRef: null,
    files: [],
    baselineFiles: [],
    candidateFiles: [],
    samples: 5,
    output: '.tmp/benchmark/test-fixtures.json',
    help: false,
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg === '--baseline-ref') parsed.baselineRef = takeValue(args, i++, arg);
    else if (arg.startsWith('--baseline-ref=')) parsed.baselineRef = arg.slice(15);
    else if (arg === '--candidate-ref') parsed.candidateRef = takeValue(args, i++, arg);
    else if (arg.startsWith('--candidate-ref=')) parsed.candidateRef = arg.slice(16);
    else if (arg === '--file') parsed.files.push(takeValue(args, i++, arg));
    else if (arg.startsWith('--file=')) parsed.files.push(arg.slice(7));
    else if (arg === '--baseline-file') parsed.baselineFiles.push(takeValue(args, i++, arg));
    else if (arg.startsWith('--baseline-file=')) parsed.baselineFiles.push(arg.slice(16));
    else if (arg === '--candidate-file') parsed.candidateFiles.push(takeValue(args, i++, arg));
    else if (arg.startsWith('--candidate-file=')) parsed.candidateFiles.push(arg.slice(17));
    else if (arg === '--samples') parsed.samples = Number(takeValue(args, i++, arg));
    else if (arg.startsWith('--samples=')) parsed.samples = Number(arg.slice(10));
    else if (arg === '--output') parsed.output = takeValue(args, i++, arg);
    else if (arg.startsWith('--output=')) parsed.output = arg.slice(9);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (parsed.help) return parsed;
  if (!parsed.baselineRef || !parsed.candidateRef) {
    throw new Error('--baseline-ref and --candidate-ref are required');
  }
  if (!Number.isInteger(parsed.samples) || parsed.samples < 1) {
    throw new Error('--samples must be a positive integer');
  }
  if (parsed.baselineFiles.length === 0) parsed.baselineFiles = parsed.files.slice();
  if (parsed.candidateFiles.length === 0) parsed.candidateFiles = parsed.files.slice();
  if (parsed.baselineFiles.length === 0 || parsed.candidateFiles.length === 0) {
    throw new Error('at least one --file or ref-specific file is required for each ref');
  }
  return parsed;
}

export function buildSampleSchedule(samples = 5) {
  const schedule = [];
  for (let cycle = 1; cycle <= samples; cycle += 1) {
    const order = cycle % 2 === 1 ? ['baseline', 'candidate'] : ['candidate', 'baseline'];
    for (const ref of order) {
      schedule.push({ cycle, ref, mode: 'cold' }, { cycle, ref, mode: 'warm' });
    }
  }
  return schedule;
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarizeDurations(values) {
  const durations = Array.isArray(values) ? values : [];
  for (let i = 0; i < durations.length; i += 1) {
    if (!Number.isFinite(durations[i]) || durations[i] < 0) {
      throw new Error(`failed or invalid sample at index ${i}`);
    }
  }
  if (durations.length === 0) throw new Error('at least one duration sample is required');
  const sorted = durations.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { samples: durations, medianMs, p80Ms: percentile(sorted, 0.8) };
}

function improvement(baseline, candidate) {
  return baseline > 0 ? Math.round(((baseline - candidate) / baseline) * 10000) / 100 : 0;
}

export function compareTestClusterMeasurements({ baseline, candidate, threshold = 0.25 }) {
  const medianImprovementPct = improvement(baseline.medianMs, candidate.medianMs);
  const p80ImprovementPct = improvement(baseline.p80Ms, candidate.p80Ms);
  const requiredPct = threshold * 100;
  return {
    thresholdPct: requiredPct,
    medianImprovementPct,
    p80ImprovementPct,
    passesThreshold: medianImprovementPct >= requiredPct && p80ImprovementPct >= requiredPct,
  };
}

function runSample(worktree, files) {
  const started = process.hrtime.bigint();
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: worktree,
    env: { ...process.env, TT_SKIP_NETWORK: '1' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '')
      .trim()
      .slice(-4000);
    throw new Error(`benchmark sample failed in ${worktree} (exit ${result.status}):\n${detail}`);
  }
  return Math.round(durationMs * 100) / 100;
}

function addSeededWorktree(projectDir, ref, target) {
  execFileSync('git', ['worktree', 'add', '--detach', target, ref], {
    cwd: projectDir,
    stdio: 'pipe',
  });
  execFileSync('bash', ['scripts/dev-env/setup-local-worktree.sh'], {
    cwd: target,
    stdio: 'pipe',
    env: process.env,
  });
}

function removeWorktree(projectDir, target) {
  execFileSync('git', ['worktree', 'remove', '--force', target], {
    cwd: projectDir,
    stdio: 'pipe',
  });
}

export function runBenchmark(options, deps = {}) {
  const projectDir = deps.projectDir || process.cwd();
  const root = mkdtempSync(path.join(projectScratchDir('benchmark', projectDir), 'fixtures-'));
  const paths = { baseline: path.join(root, 'baseline'), candidate: path.join(root, 'candidate') };
  const add = deps.addWorktree || addSeededWorktree;
  const remove = deps.removeWorktree || removeWorktree;
  const measure = deps.measure || runSample;
  const durations = {
    baseline: { cold: [], warm: [] },
    candidate: { cold: [], warm: [] },
  };
  const cleanup = { baseline: false, candidate: false, root: false };
  let thrown;
  try {
    add(projectDir, options.baselineRef, paths.baseline);
    add(projectDir, options.candidateRef, paths.candidate);
    for (const sample of buildSampleSchedule(options.samples)) {
      const files = sample.ref === 'baseline' ? options.baselineFiles : options.candidateFiles;
      durations[sample.ref][sample.mode].push(
        measure(paths[sample.ref], files, { ...sample, refName: options[`${sample.ref}Ref`] })
      );
    }
  } catch (error) {
    thrown = error;
  } finally {
    for (const name of ['baseline', 'candidate']) {
      try {
        remove(projectDir, paths[name]);
        cleanup[name] = true;
      } catch {
        cleanup[name] = false;
      }
    }
    rmSync(root, { recursive: true, force: true });
    cleanup.root = true;
  }
  if (thrown) throw thrown;
  const summaries = {};
  for (const name of ['baseline', 'candidate']) {
    const fileCount = (name === 'baseline' ? options.baselineFiles : options.candidateFiles).length;
    const invocationCount = options.samples * 2;
    summaries[name] = {
      cold: summarizeDurations(durations[name].cold),
      warm: summarizeDurations(durations[name].warm),
      combined: summarizeDurations([...durations[name].cold, ...durations[name].warm]),
      fileCount,
      invocationCount,
      // Node's test runner creates one worker process per input test file. This
      // excludes child processes intentionally spawned by individual tests.
      testFileWorkerProcessCount: fileCount * invocationCount,
    };
  }
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model || null,
    },
    refs: { baseline: options.baselineRef, candidate: options.candidateRef },
    files: { baseline: options.baselineFiles, candidate: options.candidateFiles },
    samplesPerMode: options.samples,
    measurements: summaries,
    comparison: {
      cold: compareTestClusterMeasurements({
        baseline: summaries.baseline.cold,
        candidate: summaries.candidate.cold,
      }),
      warm: compareTestClusterMeasurements({
        baseline: summaries.baseline.warm,
        candidate: summaries.candidate.warm,
      }),
      combined: compareTestClusterMeasurements({
        baseline: summaries.baseline.combined,
        candidate: summaries.candidate.combined,
      }),
    },
    failures: [],
    cleanup,
  };
}

function main() {
  let options;
  try {
    options = parseBenchmarkArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`compare-test-fixtures: ${error.message}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(HELP);
    return;
  }
  const result = runBenchmark(options);
  const output = path.resolve(process.cwd(), options.output);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`benchmark written: ${output}`);
  console.log(JSON.stringify(result.comparison, null, 2));
  if (!result.comparison.combined.passesThreshold) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
