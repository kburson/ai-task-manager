// @story #2073 — external driver shared by retained and optimized source roots.
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempProjectIsolated } from '../../task-tracker/lib/scratch-dir.mjs';
import { makeTrafficFixture } from './refinement-traffic-cases.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
export function runSourceBoundary({ sourceRoot, fixtureId, boundary, reportPath }) {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.url),
      '--source-root',
      sourceRoot,
      '--fixture',
      fixtureId,
      '--boundary',
      boundary,
      ...(reportPath ? ['--report', reportPath] : []),
    ],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, AITM_GRAPHQL_USAGE: '0' },
    }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (key) => process.argv[process.argv.indexOf(key) + 1];
  const sourceRoot = path.resolve(arg('--source-root'));
  const reportPath = process.argv.includes('--report') ? path.resolve(arg('--report')) : null;
  const root = mkdtempProjectIsolated('2073-traffic-');
  let fixture;
  try {
    fixture = await makeTrafficFixture({
      sourceRoot,
      fixtureId: arg('--fixture'),
      projectDir: root,
    });
    const outcome = await fixture.invoke(arg('--boundary'));
    const files = [
      'scripts/task-tracker/lib/decomposition-field-writer.mjs',
      'scripts/task-tracker/lib/decomposition-kind.mjs',
      'scripts/task-tracker/lib/decomposition-target-observation.mjs',
      'scripts/task-tracker/lib/decomposition-hook-authority.mjs',
      'scripts/task-tracker/lib/estimate-writer-publication.mjs',
      'scripts/task-tracker/lib/decomposition-publication.mjs',
      'scripts/task-tracker/lib/decomposition-projection.mjs',
      'scripts/task-tracker/lib/decomposition-authority.mjs',
    ];
    const sourceManifest = Object.fromEntries(
      files.map((file) => [
        file,
        existsSync(path.join(sourceRoot, file))
          ? hash(readFileSync(path.join(sourceRoot, file)))
          : null,
      ])
    );
    const fixtureFiles = [
      'refinement-traffic-cases.mjs',
      'refinement-hook-population.mjs',
      'refinement-target-shapes.mjs',
      'refinement-target-fixture.mjs',
      'estimation-publication.mjs',
      'refinement-traffic-shapes.mjs',
      'refinement-traffic-runner.mjs',
      '../helpers/refinement-traffic-provider.mjs',
      '../helpers/refinement-query-selection.mjs',
    ];
    const fixtureManifest = Object.fromEntries(
      fixtureFiles.map((file) => [file, hash(readFileSync(new URL(file, import.meta.url)))])
    );
    const result = {
      outcome,
      snapshot: await fixture.snapshot(),
      ledger: fixture.provider.ledger,
      sourceManifest,
      sourceHash: hash(JSON.stringify(sourceManifest)),
      fixtureManifest,
      fixtureHash: hash(JSON.stringify(fixtureManifest)),
      configurationHash: hash(JSON.stringify(fixture.cfg)),
    };
    if (reportPath)
      writeFileSync(
        reportPath,
        '# Offline traffic evidence\n\n```json\n' + JSON.stringify(result, null, 2) + '\n```\n'
      );
    fixture.provider.assertNoEscapes();
    process.stdout.write(JSON.stringify(result));
  } finally {
    try {
      fixture?.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
