// @story #1592
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { kind } from '../../../../bin/aitm-registry.mjs';
import { commandByName } from '../../../task-tracker/lib/command-surface/catalog.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const archiveManifest = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'scripts/tests/fixtures/legacy-review-archive-sha256.json'),
    'utf8'
  )
);

function filesBelow(relativeRoot) {
  const absoluteRoot = path.join(repoRoot, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  const result = [];
  const visit = (absolute) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const target = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile())
        result.push(path.relative(repoRoot, target).replaceAll(path.sep, '/'));
    }
  };
  visit(absoluteRoot);
  return result.sort();
}

function readFiles(paths) {
  return paths.map((relative) => [relative, readFileSync(path.join(repoRoot, relative), 'utf8')]);
}

test('legacy runtime and superseded AITM test assets are physically absent', () => {
  assert.equal(existsSync(path.join(repoRoot, 'scripts/review')), false);
  assert.deepEqual(
    filesBelow('scripts/tests').filter((relative) => /(?:^|\/)co-review[^/]*\.mjs$/.test(relative)),
    []
  );
});

test('AITM exposes neither legacy review command nor a package wrapper', () => {
  for (const command of ['co-review', 'reconcile-legacy-index', 'peer-review']) {
    assert.equal(commandByName(command), null, command);
    assert.equal(kind(command), null, command);
  }

  const aitm = path.join(repoRoot, 'bin/aitm.mjs');
  const retired = spawnSync(process.execPath, [aitm, 'co-review', '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(retired.status, 2, retired.stderr);
  assert.match(retired.stderr, /aitm: unknown command "co-review"/);
});

test('task CLI starts when the extracted review package cannot be imported', () => {
  const tracker = path.join(repoRoot, 'scripts/task-tracker/task-tracker.mjs');
  const supported = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { registerHooks } from 'node:module';
    import { pathToFileURL } from 'node:url';
    registerHooks({ resolve(specifier, context, nextResolve) {
      if (specifier === 'ai-peer-review' || specifier.startsWith('ai-peer-review/')) {
        throw new Error('Extracted review package must not be loaded by AITM');
      }
      return nextResolve(specifier, context);
    }});
    process.argv = [process.execPath, ${JSON.stringify(tracker)}, '--help'];
    await import(pathToFileURL(${JSON.stringify(tracker)}));
  `,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );
  assert.equal(supported.status, 0, supported.stderr);
  assert.match(supported.stdout, /Usage:|Commands:|\/task/);
});

test('published dependency graph and production sources are independent of the extracted package', () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    assert.equal(manifest[field]?.['ai-peer-review'], undefined, field);
  }
  assert.ok(!Object.keys(lock.packages).some((key) => /(?:^|\/)ai-peer-review(?:\/|$)/.test(key)));
  assert.equal(
    existsSync(path.join(repoRoot, 'scripts/task-tracker/lib/peer-review-adapter.mjs')),
    false
  );
  for (const [relative, source] of readFiles(
    [...filesBelow('bin'), ...filesBelow('scripts')].filter(
      (relative) => !relative.startsWith('scripts/tests/') && /\.(?:mjs|json)$/.test(relative)
    )
  )) {
    assert.doesNotMatch(
      source,
      /ai-peer-review|peer-review-adapter|cachePeerReviewStatus/,
      relative
    );
  }
});

test('production source contains no legacy runtime path or owned protocol schema', () => {
  const sourceFiles = [
    ...filesBelow('bin'),
    ...filesBelow('scripts/lib'),
    ...filesBelow('scripts/task-tracker'),
    ...filesBelow('skill/shared/rules'),
  ].filter((relative) => /\.(?:mjs|json|md)$/.test(relative));

  for (const [relative, source] of readFiles(sourceFiles)) {
    assert.doesNotMatch(source, /scripts\/review|\bco-review\b|aitm\.co-review\//i, relative);
  }
});

test('current operator documentation leaves artifact review independent of AITM', () => {
  const currentDocs = [
    'README.md',
    'docs/DESIGN.md',
    'docs/guides/github-native-coordination.md',
    'docs/guides/grok-provider.md',
    'docs/guides/settings-guide.md',
    'docs/guides/workflow.md',
    'skill/shared/rules/review.md',
    'skill/shared/rules/incident-ledger.md',
  ];
  for (const [relative, source] of readFiles(currentDocs)) {
    assert.doesNotMatch(source, /\bco-review\b|npx aitm peer-review/i, relative);
    assert.doesNotMatch(
      source,
      /ai-peer-review|installed `peer-review`|sole supported artifact-review command/i,
      relative
    );
  }
  assert.match(
    readFileSync(path.join(repoRoot, 'skill/shared/rules/review.md'), 'utf8'),
    /Artifact review is independent of AITM/
  );
});

test('every pre-migration review archive remains byte-identical', () => {
  assert.equal(archiveManifest.schema, 'aitm.legacy-review-archive-digests/v1');
  assert.equal(archiveManifest.sourceCommit, '0988881f5796d19c270e4121a851143bb5046a6f');
  assert.equal(archiveManifest.files.length, 137);
  for (const entry of archiveManifest.files) {
    const bytes = readFileSync(path.join(repoRoot, entry.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
  }
});
