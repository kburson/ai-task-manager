// @story #1857
// Bind captured implementation and installed guidance to both live and committed source.
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { capturedCommitBytes } from './captured-commit-bytes.mjs';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
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

// Negative capture controls must reach their capture guard using the original
// obligation map. The live map still refuses obsolete certification separately.
export function archivedObligationMapRoot(projectRoot) {
  const relativePath = 'scripts/tests/fixtures/1558/rule-guidance-map.json';
  const bytes = capturedCommitBytes(
    projectRoot,
    '171c7d93866f67b58effa635be5ae737f54ef9eb',
    relativePath
  );
  const root = mkdtempSync(path.join(projectScratchDir('test', projectRoot), 'archived-map-'));
  const parts = relativePath.split('/');
  let relative = '';
  for (const next of parts) {
    mkdirSync(path.join(root, relative), { recursive: true });
    for (const entry of readdirSync(path.join(projectRoot, relative))) {
      if (entry === next) continue;
      symlinkSync(path.join(projectRoot, relative, entry), path.join(root, relative, entry));
    }
    relative = path.join(relative, next);
  }
  writeFileSync(path.join(root, relativePath), bytes);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
