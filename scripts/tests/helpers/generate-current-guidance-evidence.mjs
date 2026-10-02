#!/usr/bin/env node
// @story #1857
// Publish new fixture evidence only from actual installed CLI capture at a committed source.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { captureGuidanceLifecycle } from './capture-guidance-release.mjs';
import { capturedCommitBytes } from './captured-commit-bytes.mjs';
import { CURRENT_FINAL_CAPTURE, CURRENT_FINAL_MANIFEST } from './guidance-paired-context.mjs';
import {
  buildGuidanceContextReport,
  buildContextBudgetsArtifact,
  buildCurrentPairedComparison,
} from '../../task-tracker/measure-guidance-context.mjs';
import { buildAuthorityAfterReport } from './guidance-authority-after.mjs';
const root = path.resolve(import.meta.dirname, '../../..');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export function currentCaptureManifest(capture, captureBytes, sourceCommit) {
  return {
    schema: 'aitm.guidance-final-capture-manifest/v1',
    capturePath: CURRENT_FINAL_CAPTURE,
    captureSha256: digest(captureBytes),
    scenarioManifestSha256: capture.identity.scenarioManifestSha256,
    sourceInputsSha256: capture.identity.sourceInputsSha256,
    sourceCommit,
    productionPackage: capture.identity.productionPackage,
    eventNames: capture.events.map(({ name }) => name),
    trafficCategories: capture.measurement.traffic.categories,
    heavyCase: {
      declaredInputs: capture.heavyCase.declaredInputs,
      observedStatus: capture.heavyCase.observedStatus,
      stdoutSha256: digest(capture.heavyCase.event.stdout),
      traffic: capture.heavyCase.traffic,
    },
    installedStatic: capture.measurement.installedStatic,
  };
}
export async function generateCurrentGuidanceEvidence() {
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const capture = captureGuidanceLifecycle({ mode: 'final' });
  for (const file of capture.identity.implementationFiles) {
    if (digest(capturedCommitBytes(root, sourceCommit, file.path)) !== file.sha256) {
      throw new Error(`current guidance: uncommitted captured source ${file.path}`);
    }
  }
  const captureBytes = Buffer.from(`${JSON.stringify(capture, null, 2)}\n`);
  const manifest = currentCaptureManifest(capture, captureBytes, sourceCommit);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const lifecycle = await buildGuidanceContextReport({
    captureBytes,
    capturePath: CURRENT_FINAL_CAPTURE,
    manifestBytes,
  });
  const directory = path.join(root, path.dirname(CURRENT_FINAL_CAPTURE));
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(root, CURRENT_FINAL_CAPTURE), captureBytes);
  writeFileSync(path.join(root, CURRENT_FINAL_MANIFEST), manifestBytes);
  writeFileSync(
    path.join(directory, 'lifecycle-transcript-final.json'),
    `${JSON.stringify(lifecycle, null, 2)}\n`
  );
  const budgets = buildContextBudgetsArtifact({ final: true });
  writeFileSync(
    path.join(directory, 'context-budgets-final.json'),
    await prettier.format(JSON.stringify(budgets), { parser: 'json', printWidth: 100 })
  );
  const authority = await buildAuthorityAfterReport({
    timingBytes: readFileSync(
      path.join(root, 'scripts/tests/fixtures/1558/authority-after-timing.json')
    ),
  });
  const paired = buildCurrentPairedComparison({ lifecycle, authority, budgets });
  writeFileSync(
    path.join(directory, 'context-comparison-final-paired.json'),
    await prettier.format(JSON.stringify(paired), { parser: 'json', printWidth: 100 })
  );
  return { sourceCommit, captureSha256: manifest.captureSha256 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--write')
    throw new Error('usage: generate-current-guidance-evidence.mjs --write');
  console.log(JSON.stringify(await generateCurrentGuidanceEvidence()));
}
