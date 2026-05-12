#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  SKILL_DETAIL_FILES,
  stampSkillVersion,
  stampAllSkillVersions,
  isDevPackage,
} from '../../../bin/lib/stamp-skill-version.mjs';

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'aitm-stamp-'));
  for (const f of SKILL_DETAIL_FILES) {
    const abs = path.join(root, f.pkgRelPath);
    mkdirSync(path.dirname(abs), { recursive: true });
    const body =
      f.id === 'pickup'
        ? `# ${f.id}\n\nhello\n`
        : `---\nname: task\ndescription: x\n---\n\n# ${f.id}\n\nhello\n`;
    writeFileSync(abs, body, 'utf8');
  }
  return root;
}

// ---- stampSkillVersion: inserts marker when absent (with frontmatter) ----
{
  const root = makeFixture();
  try {
    const abs = path.join(root, 'skill/adapters/claude/SKILL.md');
    const r = stampSkillVersion(abs, '1.2.3');
    assert.equal(r.changed, true);
    const after = readFileSync(abs, 'utf8');
    assert.match(after, /<!-- aitm-skill-version: 1\.2\.3 -->/);
    const head = after.split('\n').slice(0, 8).join('\n');
    assert.match(head, /<!-- aitm-skill-version: 1\.2\.3 -->/, 'marker near top after frontmatter');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampSkillVersion: replaces existing marker ----
{
  const root = makeFixture();
  try {
    const abs = path.join(root, 'skill/shared/SKILL.md');
    stampSkillVersion(abs, '1.0.0');
    const r = stampSkillVersion(abs, '2.0.0');
    assert.equal(r.changed, true);
    const after = readFileSync(abs, 'utf8');
    assert.match(after, /<!-- aitm-skill-version: 2\.0\.0 -->/);
    assert.doesNotMatch(after, /<!-- aitm-skill-version: 1\.0\.0 -->/);
    assert.equal((after.match(/aitm-skill-version:/g) || []).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampSkillVersion: re-stamp same version is no-op ----
{
  const root = makeFixture();
  try {
    const abs = path.join(root, 'templates/pickup-directive.md');
    stampSkillVersion(abs, '3.0.0');
    const r2 = stampSkillVersion(abs, '3.0.0');
    assert.equal(r2.changed, false, 're-stamp same version is unchanged');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampSkillVersion: works without frontmatter ----
{
  const root = makeFixture();
  try {
    const abs = path.join(root, 'templates/pickup-directive.md');
    const r = stampSkillVersion(abs, '0.4.7');
    assert.equal(r.changed, true);
    const after = readFileSync(abs, 'utf8');
    assert.match(after.split('\n')[0], /<!-- aitm-skill-version: 0\.4\.7 -->/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampSkillVersion: missing file returns reason 'missing' ----
{
  const r = stampSkillVersion('/nonexistent/path/file.md', '1.0.0');
  assert.equal(r.changed, false);
  assert.equal(r.reason, 'missing');
}

// ---- isDevPackage: detects .git directory; AITM_FORCE_STAMP overrides ----
{
  const root = mkdtempSync(path.join(tmpdir(), 'aitm-dev-'));
  try {
    delete process.env.AITM_FORCE_STAMP;
    assert.equal(isDevPackage(root), false, 'no .git → not dev');
    mkdirSync(path.join(root, '.git'));
    assert.equal(isDevPackage(root), true, '.git present → dev package');
    process.env.AITM_FORCE_STAMP = '1';
    try {
      assert.equal(isDevPackage(root), false, 'AITM_FORCE_STAMP=1 overrides');
    } finally {
      delete process.env.AITM_FORCE_STAMP;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampAllSkillVersions: stamps every detail file ----
{
  const root = makeFixture();
  try {
    const events = [];
    const result = stampAllSkillVersions({
      pkgRoot: root,
      version: '4.5.6',
      logger: (e) => events.push(e),
    });
    assert.equal(result.skipped, false);
    assert.equal(result.results.length, SKILL_DETAIL_FILES.length);
    for (const f of SKILL_DETAIL_FILES) {
      const abs = path.join(root, f.pkgRelPath);
      assert.match(readFileSync(abs, 'utf8'), /<!-- aitm-skill-version: 4\.5\.6 -->/);
    }
    assert.ok(events.every((e) => e.kind === 'stamped'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampAllSkillVersions: re-stamp with new version updates all markers ----
{
  const root = makeFixture();
  try {
    stampAllSkillVersions({ pkgRoot: root, version: '1.0.0' });
    stampAllSkillVersions({ pkgRoot: root, version: '2.0.0' });
    for (const f of SKILL_DETAIL_FILES) {
      const abs = path.join(root, f.pkgRelPath);
      const after = readFileSync(abs, 'utf8');
      assert.match(after, /<!-- aitm-skill-version: 2\.0\.0 -->/);
      assert.doesNotMatch(after, /<!-- aitm-skill-version: 1\.0\.0 -->/);
      assert.equal((after.match(/aitm-skill-version:/g) || []).length, 1);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampAllSkillVersions: skips when .git present (dev package) ----
{
  const root = makeFixture();
  mkdirSync(path.join(root, '.git'));
  try {
    delete process.env.AITM_FORCE_STAMP;
    const events = [];
    const result = stampAllSkillVersions({
      pkgRoot: root,
      version: '9.9.9',
      logger: (e) => events.push(e),
    });
    assert.equal(result.skipped, true);
    assert.equal(result.results.length, 0);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'skipped');
    for (const f of SKILL_DETAIL_FILES) {
      const abs = path.join(root, f.pkgRelPath);
      assert.doesNotMatch(readFileSync(abs, 'utf8'), /<!-- aitm-skill-version: 9\.9\.9 -->/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ---- stampAllSkillVersions: AITM_FORCE_STAMP=1 overrides dev-skip ----
{
  const root = makeFixture();
  mkdirSync(path.join(root, '.git'));
  try {
    process.env.AITM_FORCE_STAMP = '1';
    const result = stampAllSkillVersions({ pkgRoot: root, version: '7.7.7' });
    assert.equal(result.skipped, false);
    for (const f of SKILL_DETAIL_FILES) {
      const abs = path.join(root, f.pkgRelPath);
      assert.match(readFileSync(abs, 'utf8'), /<!-- aitm-skill-version: 7\.7\.7 -->/);
    }
  } finally {
    delete process.env.AITM_FORCE_STAMP;
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('install-skill-version.test.mjs: all passed');
