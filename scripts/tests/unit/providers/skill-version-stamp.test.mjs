#!/usr/bin/env node
// @story #454
// Verifies that SKILL_DETAIL_FILES includes the Codex adapter, and that
// stampSkillVersion writes the version marker correctly.

import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { mkdtempOutsideRepo } from '../../../task-tracker/lib/scratch-dir.mjs';
import { getProvider } from '../../../providers/index.mjs';
import {
  SKILL_DETAIL_FILES,
  stampAllSkillVersions,
  stampSkillVersion,
} from '../../../../bin/lib/stamp-skill-version.mjs';

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

// ---- SKILL_DETAIL_FILES structure ----

test('SKILL_DETAIL_FILES includes codex-adapter entry', () => {
  const entry = SKILL_DETAIL_FILES.find((f) => f.id === 'codex-adapter');
  assert.ok(entry, 'codex-adapter entry missing from SKILL_DETAIL_FILES');
  assert.strictEqual(
    entry.pkgRelPath,
    getProvider('codex').skillAdapterPath,
    'codex-adapter pkgRelPath must equal codex provider skillAdapterPath'
  );
});

test('SKILL_DETAIL_FILES includes grok-adapter entry', () => {
  const entry = SKILL_DETAIL_FILES.find((f) => f.id === 'grok-adapter');
  assert.ok(entry, 'grok-adapter entry missing from SKILL_DETAIL_FILES');
  assert.strictEqual(entry.pkgRelPath, getProvider('grok').skillAdapterPath);
});

test('SKILL_DETAIL_FILES has 5 entries', () => {
  assert.strictEqual(
    SKILL_DETAIL_FILES.length,
    5,
    `expected 5 entries, got ${SKILL_DETAIL_FILES.length}`
  );
});

test('#939: deliver JIT rule carries its exact load sentinel', () => {
  const root = join(dirname(new URL(import.meta.url).pathname), '../../../..');
  const rule = readFileSync(join(root, 'skill/shared/rules/deliver.md'), 'utf8');
  assert.match(rule, /aitm-skill-loaded:rules\/deliver:1\.0\.0/);
});

test('#1381: incident-ledger JIT rule carries its exact load sentinel', () => {
  const root = join(dirname(new URL(import.meta.url).pathname), '../../../..');
  const rule = readFileSync(join(root, 'skill/shared/rules/incident-ledger.md'), 'utf8');
  assert.match(rule, /aitm-skill-loaded:rules\/incident-ledger:1\.0\.0/);
});

test('SKILL_DETAIL_FILES entry ids are unique', () => {
  const ids = SKILL_DETAIL_FILES.map((f) => f.id);
  const unique = new Set(ids);
  assert.strictEqual(unique.size, ids.length, `duplicate ids in SKILL_DETAIL_FILES: ${ids}`);
});

test('SKILL_DETAIL_FILES includes adapter entry for claude', () => {
  const entry = SKILL_DETAIL_FILES.find((f) => f.id === 'adapter');
  assert.ok(entry, 'adapter entry missing from SKILL_DETAIL_FILES');
  assert.strictEqual(entry.pkgRelPath, getProvider('claude').skillAdapterPath);
});

// ---- stampSkillVersion behavior ----

test('stampSkillVersion inserts marker into file without one', () => {
  const dir = mkdtempOutsideRepo('aitm-stamp-test-');
  try {
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '# My Skill\n\nSome content.\n', 'utf8');
    const r = stampSkillVersion(file, '1.2.3');
    assert.strictEqual(r.changed, true);
    assert.strictEqual(r.reason, 'stamped');
    const contents = readFileSync(file, 'utf8');
    assert.ok(
      contents.includes('<!-- aitm-skill-version: 1.2.3 -->'),
      'version marker not found after stamping'
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stampSkillVersion replaces existing marker', () => {
  const dir = mkdtempOutsideRepo('aitm-stamp-test-');
  try {
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '<!-- aitm-skill-version: 0.0.0 -->\n# My Skill\n', 'utf8');
    const r = stampSkillVersion(file, '2.0.0');
    assert.strictEqual(r.changed, true);
    const contents = readFileSync(file, 'utf8');
    assert.ok(contents.includes('<!-- aitm-skill-version: 2.0.0 -->'));
    assert.ok(!contents.includes('0.0.0'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stampSkillVersion is no-op when version unchanged', () => {
  const dir = mkdtempOutsideRepo('aitm-stamp-test-');
  try {
    const file = join(dir, 'SKILL.md');
    writeFileSync(file, '<!-- aitm-skill-version: 1.2.3 -->\n# Skill\n', 'utf8');
    const r = stampSkillVersion(file, '1.2.3');
    assert.strictEqual(r.changed, false);
    assert.strictEqual(r.reason, 'unchanged');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stampSkillVersion returns missing when file absent', () => {
  const r = stampSkillVersion('/tmp/__nonexistent_aitm_test_file__.md', '1.0.0');
  assert.strictEqual(r.changed, false);
  assert.strictEqual(r.reason, 'missing');
});

test('stampAllSkillVersions stamps the installed Grok adapter', () => {
  const dir = mkdtempOutsideRepo('aitm-stamp-all-grok-test-');
  const priorForceStamp = process.env.AITM_FORCE_STAMP;
  try {
    for (const entry of SKILL_DETAIL_FILES) {
      const file = join(dir, entry.pkgRelPath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `# ${entry.id}\n`, 'utf8');
    }
    process.env.AITM_FORCE_STAMP = '1';
    const result = stampAllSkillVersions({ pkgRoot: dir, version: '1.2.3' });
    const grok = result.results.find((entry) => entry.id === 'grok-adapter');
    assert.equal(grok?.reason, 'stamped');
    assert.match(
      readFileSync(join(dir, getProvider('grok').skillAdapterPath), 'utf8'),
      /<!-- aitm-skill-version: 1\.2\.3 -->/
    );
  } finally {
    if (priorForceStamp === undefined) delete process.env.AITM_FORCE_STAMP;
    else process.env.AITM_FORCE_STAMP = priorForceStamp;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Run ----

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`  ok  ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${t.name}`);
    console.log(err.stack || err.message);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${tests.length} skill-version-stamp test(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} skill-version-stamp tests passed.`);
