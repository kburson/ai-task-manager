// @story #1857
// Bind captured implementation and installed guidance to both live and committed source.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { capturedCommitBytes } from './captured-commit-bytes.mjs';
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
export function assertCapturedCommitSources(
  capture,
  sourceCommit,
  projectRoot,
  { requireLive = false } = {}
) {
  if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? ''))
    throw new Error('current guidance: invalid source commit');
  const records = [
    ...capture.identity.implementationFiles,
    ...Object.values(capture.measurement.installedStatic).flatMap(({ files }) =>
      files.map(({ sourcePath, sha256 }) => ({ path: sourcePath, sha256 }))
    ),
    ...capture.identity.productionPackage.files,
  ];
  for (const file of records) {
    if (
      (requireLive && digest(readFileSync(path.join(projectRoot, file.path))) !== file.sha256) ||
      digest(capturedCommitBytes(projectRoot, sourceCommit, file.path)) !== file.sha256
    ) {
      throw new Error(`current guidance: uncommitted captured source ${file.path}`);
    }
  }
  return sourceCommit;
}

export function assertCurrentCaptureSources(capture, sourceCommit, projectRoot) {
  return assertCapturedCommitSources(capture, sourceCommit, projectRoot, { requireLive: true });
}

// Retain the original archive identity while regenerating it from a published,
// byte-equivalent squash commit. Every captured input must match before use.
export function publishedCaptureSource(capture, sourceCommit, projectRoot) {
  const published =
    sourceCommit === 'e545522e467e484bd96db3b327fc8ccd0047c086'
      ? '171c7d93866f67b58effa635be5ae737f54ef9eb'
      : sourceCommit;
  assertCapturedCommitSources(capture, published, projectRoot);
  return published;
}
