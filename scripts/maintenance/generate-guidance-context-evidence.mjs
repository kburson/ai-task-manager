#!/usr/bin/env node
// @story #1770
// Deterministic pre-slim evidence generation from frozen capture and timing inputs.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';

import {
  buildContextBudgetsArtifact,
  buildCurrentPairedComparison,
  buildGuidanceContextReport,
  buildTokenCalibration,
} from '../task-tracker/measure-guidance-context.mjs';
import { buildAuthorityAfterReport } from '../tests/helpers/guidance-authority-after.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FIXTURES = path.join(ROOT, 'scripts/tests/fixtures/1558');
const at = (name) => path.join(FIXTURES, name);
const read = (name) => readFileSync(at(name));

export async function generateGuidanceContextEvidence() {
  const captureBytes = read('actual-explain-traffic-recertification.json');
  const timingBytes = read('authority-after-timing.json');
  const lifecycle = await buildGuidanceContextReport({ captureBytes });
  const authority = await buildAuthorityAfterReport({ timingBytes });
  const budgets = buildContextBudgetsArtifact();
  return {
    'context-budgets.json': budgets,
    'lifecycle-transcript.json': lifecycle,
    'tokenizer-calibration.json': buildTokenCalibration({ captureBytes }),
    'authority-after.json': authority,
  };
}

async function main() {
  const mode = process.argv[2];
  if (!['--write', '--check'].includes(mode) || process.argv.length !== 3) {
    throw new Error('usage: generate-guidance-context-evidence.mjs --write|--check');
  }
  const artifacts = await generateGuidanceContextEvidence();
  for (const [name, value] of Object.entries(artifacts)) {
    const bytes = ['lifecycle-transcript.json', 'tokenizer-calibration.json'].includes(name)
      ? `${JSON.stringify(value, null, 2)}\n`
      : await prettier.format(JSON.stringify(value), { parser: 'json', printWidth: 100 });
    if (mode === '--write') writeFileSync(at(name), bytes);
    else if (read(name).toString() !== bytes) throw new Error(`stale context evidence: ${name}`);
  }
  const paired = buildCurrentPairedComparison({
    lifecycle: artifacts['lifecycle-transcript.json'],
    authority: artifacts['authority-after.json'],
    budgets: artifacts['context-budgets.json'],
  });
  const pairedName = 'context-comparison-current-paired.json';
  const pairedBytes = await prettier.format(JSON.stringify(paired), {
    parser: 'json',
    printWidth: 100,
  });
  if (mode === '--write') writeFileSync(at(pairedName), pairedBytes);
  else if (read(pairedName).toString() !== pairedBytes)
    throw new Error(`stale context evidence: ${pairedName}`);
  process.stdout.write(
    `guidance context evidence ${mode.slice(2)}: ${[...Object.keys(artifacts), pairedName].join(', ')}\n`
  );
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
