// @story #1770
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import prettier from 'prettier';

import {
  buildContextBudgetsArtifact,
  buildCurrentPairedComparison,
  buildGuidanceContextReport,
  buildTokenCalibration,
} from '../../../../task-tracker/measure-guidance-context.mjs';
import { buildAuthorityAfterReport } from '../../../helpers/guidance-authority-after.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const FIXTURES = 'scripts/tests/fixtures/1558/';
const read = (name) => readFileSync(path.join(ROOT, FIXTURES, name));
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

test('generates current paired artifacts while preserving the frozen comparison', async () => {
  const historicalBytes = read('context-comparison.json');
  assert.equal(
    digest(historicalBytes),
    'sha256:09a165324fda2649d2bbb99ebd0df0f486b75912d2bfeb9b83567b7c5d047894'
  );
  const captureBytes = read('actual-explain-traffic-recertification.json');
  const timingBytes = read('authority-after-timing.json');
  const lifecycle = await buildGuidanceContextReport({ captureBytes });
  const authority = await buildAuthorityAfterReport({ timingBytes });
  const budgets = buildContextBudgetsArtifact();
  const paired = buildCurrentPairedComparison({ lifecycle, authority, budgets });
  const artifacts = {
    'context-budgets.json': budgets,
    'lifecycle-transcript.json': lifecycle,
    'tokenizer-calibration.json': buildTokenCalibration({ captureBytes }),
    'authority-after.json': authority,
    'context-comparison-current-paired.json': paired,
  };
  for (const [name, value] of Object.entries(artifacts)) {
    const bytes = ['lifecycle-transcript.json', 'tokenizer-calibration.json'].includes(name)
      ? `${JSON.stringify(value, null, 2)}\n`
      : await prettier.format(JSON.stringify(value), { parser: 'json', printWidth: 100 });
    assert.equal(read(name).toString(), bytes, name);
  }
  assert.equal(paired.classification, 'pre-slim-current-paired-not-installed-release');
  assert.equal(paired.historicalComparison.sha256, digest(historicalBytes));
  assert.equal(paired.finalInstalledAdapterGate.status, 'pending');
  assert.equal(paired.adapters.claude.currentProxyTokens, 5075);
  assert.equal(paired.adapters.codex.currentProxyTokens, 5079);
});

test('public meter certifies final installed bytes and the paired report', async () => {
  const base = ['scripts/task-tracker/measure-guidance-context.mjs', '--all', '--json'];
  const normal = spawnSync(process.execPath, base, { cwd: ROOT, encoding: 'utf8' });
  assert.equal(normal.status, 0, normal.stderr);
  const report = JSON.parse(normal.stdout);
  assert.equal(report.releaseEvidence.authorityAfter.schema, 'aitm.guidance-authority-after/v1');
  assert.equal(
    report.releaseEvidence.currentPairedComparison.classification,
    'final-installed-public-cli-paired-comparison'
  );
  const finalCaptureBytes = read('actual-explain-traffic-final.json');
  const finalLifecycle = await buildGuidanceContextReport({ captureBytes: finalCaptureBytes });
  assert.equal(
    read('lifecycle-transcript-final.json').toString(),
    `${JSON.stringify(finalLifecycle, null, 2)}\n`
  );
  const finalPaired = buildCurrentPairedComparison({
    lifecycle: finalLifecycle,
    authority: report.releaseEvidence.authorityAfter,
    budgets: report.releaseEvidence.contextBudgets,
  });
  assert.deepEqual(JSON.parse(read('context-comparison-final-paired.json')), finalPaired);
  const assertion = spawnSync(process.execPath, [...base, '--assert-budgets'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(assertion.status, 0, assertion.stderr);
  assert.equal(JSON.parse(assertion.stdout).finalInstalledAdapterGate.status, 'passed');
});
