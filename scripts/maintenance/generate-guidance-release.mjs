#!/usr/bin/env node
// @story #1672
// Publisher-only fingerprint generation. Runtime checks this file; it never restamps it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeGuidanceSource } from '../../guidance/positions.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = 'instructions/aitm-guidance.yml';
const MANIFEST = 'instructions/aitm-guidance.release.json';

function digest(source) {
  return `sha256:${createHash('sha256').update(decodeGuidanceSource(source), 'utf8').digest('hex')}`;
}

export function expectedGuidanceRelease(packageRoot = DEFAULT_ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.name !== '@kburson/ai-task-manager' || pkg.dependencies?.['js-yaml'] !== '5.4.2') {
    throw new Error('guidance-release-package-identity-invalid');
  }
  return {
    schema: 'aitm.guidance-release/v1',
    package: pkg.name,
    packageVersion: pkg.version,
    catalogPath: CATALOG,
    catalogFileDigest: digest(readFileSync(path.join(packageRoot, CATALOG))),
    parser: { name: 'js-yaml', version: '5.4.2' },
    compiler: { name: 'aitm-guidance', version: 1, adapter: 'js-yaml-events-v1' },
  };
}

export function checkGuidanceRelease(packageRoot = DEFAULT_ROOT) {
  const expected = `${JSON.stringify(expectedGuidanceRelease(packageRoot), null, 2)}\n`;
  let actual;
  try {
    actual = readFileSync(path.join(packageRoot, MANIFEST), 'utf8');
  } catch {
    return { ok: false, code: 'guidance-release-manifest-unavailable' };
  }
  return actual === expected
    ? { ok: true, code: null }
    : { ok: false, code: 'guidance-release-manifest-disagreement' };
}

/** Detect the first consumer release without relying on a manually toggled flag. */
export function assertGuidanceConsumerRelease(packageRoot = DEFAULT_ROOT) {
  const agreement = checkGuidanceRelease(packageRoot);
  if (!agreement.ok) throw new Error(agreement.code);
  const consumers = [
    'bin/aitm.mjs',
    'bin/cli.mjs',
    'scripts/task-tracker/task-tracker.mjs',
    'bin/aitm-registry.mjs',
  ].filter((relative) => {
    const source = readFileSync(path.join(packageRoot, relative), 'utf8');
    return (
      /guidance\/(?:source|admission)\.mjs|task-tracker\/guidance\.mjs/.test(source) ||
      /['"]guidance['"]\s*:\s*(?:routableContract|contract)/.test(source)
    );
  });
  if (consumers.length > 0) {
    // #1674 must replace this refusal with an evidence-bound B2 certification
    // check after warm parser avoidance and invalidation tests exist.
    throw new Error(`guidance-b2-certification-absent: ${consumers.join(', ')}`);
  }
  return { ok: true, consumers: [] };
}

function main(argv) {
  const [mode] = argv;
  if (argv.length !== 1 || !['--write', '--check', '--assert-consumer-release'].includes(mode)) {
    process.stderr.write(
      'Usage: node scripts/maintenance/generate-guidance-release.mjs ' +
        '<--write|--check|--assert-consumer-release>\n'
    );
    return 2;
  }
  if (mode === '--write') {
    writeFileSync(
      path.join(DEFAULT_ROOT, MANIFEST),
      `${JSON.stringify(expectedGuidanceRelease(), null, 2)}\n`
    );
    process.stdout.write(`${MANIFEST} updated by explicit maintenance command\n`);
    return 0;
  }
  if (mode === '--assert-consumer-release') {
    assertGuidanceConsumerRelease();
    process.stdout.write('guidance consumer release check: no loader consumers\n');
    return 0;
  }
  const result = checkGuidanceRelease();
  if (!result.ok) throw new Error(result.code);
  process.stdout.write('guidance release manifest agrees with catalog and parser\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
