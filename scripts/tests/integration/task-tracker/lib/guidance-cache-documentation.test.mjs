// @story #2084
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

const repository = fileURLToPath(new URL('../../../../../', import.meta.url));

function fixture() {
  const root = mkdtempProjectIsolated('aitm-2084-cache-documentation-');
  // Copy semantic modules and published data, never the production cache.
  for (const relative of ['guidance', 'package.json', 'instructions', 'docs/guides']) {
    const destination = path.join(root, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.join(repository, relative), destination, { recursive: true });
  }
  // Registry requirements use scripts read-only; the copied resolver is independent.
  symlinkSync(path.join(repository, 'scripts'), path.join(root, 'scripts'), 'dir');
  return root;
}

function load(root, { oldResolver = false } = {}) {
  const args = [];
  if (oldResolver) {
    const hook = path.join(root, 'old-documentation-hook.mjs');
    writeFileSync(
      hook,
      `import { registerHooks } from 'node:module';
       registerHooks({ load(url, context, nextLoad) {
         if (url === ${JSON.stringify(pathToFileURL(path.join(root, 'guidance/documentation.mjs')).href)}) {
           return { format: 'module', shortCircuit: true,
             source: 'export function resolveDocumentationReference() { return { ok: false, code: "documentation-path-missing" }; }' };
         }
         return nextLoad(url, context);
       }});`
    );
    args.push('--import', hook);
  }
  const cache = pathToFileURL(path.join(root, 'guidance/cache.mjs')).href;
  const script = `import { loadGuidance } from ${JSON.stringify(cache)};
    const result = loadGuidance({ projectRoot: process.cwd(), need: 'diagnostics' });
    process.stdout.write(JSON.stringify({ valid: result.valid, errors: result.errors ?? [],
      runtime: process.version, execPath: process.execPath }));`;
  return JSON.parse(
    execFileSync(process.execPath, [...args, '--input-type=module', '-e', script], {
      cwd: root,
      encoding: 'utf8',
    })
  );
}

function manifestPath(root) {
  return path.join(root, '.tmp/aitm/guidance-cache/manifest.v1.json');
}

function readManifest(root) {
  return JSON.parse(readFileSync(manifestPath(root), 'utf8'));
}

function seedInvalid(root) {
  // This test-only loader models the old resolver's coherent cold failure.
  const result = load(root, { oldResolver: true });
  assert.equal(result.valid, false);
  assert.equal(result.runtime, process.version);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.every((error) => error.code === 'documentation-path-missing'));
  assert.equal(readManifest(root).valid, false);
  return readManifest(root);
}

test('a legacy invalid cache rebuilds when documentation resolver identity is introduced', () => {
  const root = fixture();
  try {
    const legacy = seedInvalid(root);
    // Model the legacy shape by removing only the newly introduced runtime field.
    delete legacy.identity.runtime.documentationResolverDigest;
    writeFileSync(manifestPath(root), JSON.stringify(legacy));
    const result = load(root);
    assert.equal(result.valid, true, JSON.stringify(result));
    const rebuilt = readManifest(root);
    assert.equal(rebuilt.valid, true);
    assert.match(rebuilt.identity.runtime.documentationResolverDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(rebuilt.identity.runtime.packageVersion, legacy.identity.runtime.packageVersion);
    assert.equal(
      rebuilt.identity.runtime.publishedCatalogFileDigest,
      legacy.identity.runtime.publishedCatalogFileDigest
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('changed documentation resolver bytes invalidate an otherwise identical invalid cache', () => {
  const root = fixture();
  try {
    const before = seedInvalid(root);
    appendFileSync(
      path.join(root, 'guidance/documentation.mjs'),
      '\n// Fixture resolver revision.\n'
    );
    const result = load(root);
    assert.equal(result.valid, true, JSON.stringify(result));
    const after = readManifest(root);
    assert.notEqual(
      after.identity.runtime.documentationResolverDigest,
      before.identity.runtime.documentationResolverDigest
    );
    assert.equal(after.identity.runtime.packageVersion, before.identity.runtime.packageVersion);
    assert.equal(
      after.identity.runtime.publishedCatalogFileDigest,
      before.identity.runtime.publishedCatalogFileDigest
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
