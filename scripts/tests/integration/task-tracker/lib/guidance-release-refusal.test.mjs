// @story #1672
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import {
  assertGuidanceConsumerRelease,
  checkGuidanceRelease,
  expectedGuidanceRelease,
} from '../../../../maintenance/generate-guidance-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const files = [
  'package.json',
  'instructions/aitm-guidance.yml',
  'instructions/aitm-guidance.release.json',
  'bin/aitm.mjs',
  'bin/cli.mjs',
  'bin/aitm-registry.mjs',
  'scripts/task-tracker/task-tracker.mjs',
];

function fixture({ withoutDirectConsumers = false } = {}) {
  const dir = mkdtempProjectIsolated('guidance-release-');
  mkdirSync(path.join(dir, 'guidance'), { recursive: true });
  for (const file of files) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    copyFileSync(path.join(root, file), path.join(dir, file));
  }
  if (withoutDirectConsumers) {
    for (const file of ['bin/aitm.mjs', 'bin/cli.mjs', 'scripts/task-tracker/task-tracker.mjs']) {
      const target = path.join(dir, file);
      writeFileSync(
        target,
        readFileSync(target, 'utf8').replace(
          /^import .*guidance\/(?:admission|annotation)\.mjs';\n/gm,
          ''
        )
      );
    }
  }
  return dir;
}

test('checked-in release identity agrees with raw catalog and separate parser metadata', () => {
  const expected = expectedGuidanceRelease(root);
  assert.match(expected.catalogFileDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(expected.parser, { name: 'js-yaml', version: '5.4.2' });
  assert.equal(expected.compiler.adapter, 'js-yaml-events-v1');
  assert.deepEqual(checkGuidanceRelease(root), { ok: true, code: null });
});

test('read-only CI agreement rejects catalog change rather than restamping', () => {
  const dir = fixture();
  try {
    const catalog = path.join(dir, 'instructions/aitm-guidance.yml');
    writeFileSync(catalog, `${readFileSync(catalog, 'utf8')}\n# changed\n`);
    assert.deepEqual(checkGuidanceRelease(dir), {
      ok: false,
      code: 'guidance-release-manifest-disagreement',
    });
    assert.equal(
      readFileSync(path.join(dir, 'instructions/aitm-guidance.release.json'), 'utf8'),
      readFileSync(path.join(root, 'instructions/aitm-guidance.release.json'), 'utf8')
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('first operational loader consumer is refused until B2 certification exists', () => {
  const dir = fixture();
  try {
    assert.throws(() => assertGuidanceConsumerRelease(dir), /guidance-b2-certification-absent/);
    // A caller-provided certification file is not an escape hatch in B1.
    writeFileSync(
      path.join(dir, 'instructions/aitm-guidance.b2-certification.json'),
      '{"certified":true}\n'
    );
    assert.throws(() => assertGuidanceConsumerRelease(dir), /guidance-b2-certification-absent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('indirect loader import in another shipped module cannot bypass release refusal', () => {
  const dir = fixture({ withoutDirectConsumers: true });
  try {
    const adapter = path.join(dir, 'scripts/task-tracker/lib/indirect-guidance.mjs');
    mkdirSync(path.dirname(adapter), { recursive: true });
    writeFileSync(adapter, "import '../../../guidance/admission.mjs';\n");
    const entrypoint = path.join(dir, 'bin/aitm.mjs');
    writeFileSync(
      entrypoint,
      `${readFileSync(entrypoint, 'utf8')}\nimport '../scripts/task-tracker/lib/indirect-guidance.mjs';\n`
    );
    assert.throws(() => assertGuidanceConsumerRelease(dir), /guidance-b2-certification-absent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('direct cache loader import cannot bypass B2 release refusal', () => {
  const dir = fixture({ withoutDirectConsumers: true });
  try {
    const adapter = path.join(dir, 'scripts/task-tracker/lib/cache-consumer.mjs');
    mkdirSync(path.dirname(adapter), { recursive: true });
    writeFileSync(adapter, "import '../../../guidance/cache.mjs';\n");
    assert.throws(() => assertGuidanceConsumerRelease(dir), /guidance-b2-certification-absent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('computed guidance import cannot evade the B2 release refusal', () => {
  const dir = fixture({ withoutDirectConsumers: true });
  try {
    const adapter = path.join(dir, 'scripts/task-tracker/lib/computed-guidance.mjs');
    mkdirSync(path.dirname(adapter), { recursive: true });
    writeFileSync(
      adapter,
      "const target = '../../../guidance/' + 'admission.mjs';\nawait import(target);\n"
    );
    assert.throws(() => assertGuidanceConsumerRelease(dir), /guidance-b2-certification-absent/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('publication command proves B2 consumer certification on the package under test', () => {
  const result = spawnSync('npm', ['run', 'lint:guidance-release-consumer'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /guidance consumer release certified/);
});
