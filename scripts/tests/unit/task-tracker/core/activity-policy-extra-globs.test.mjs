// @story #661
//
// Covers the additive `*Extra` glob merge in `loadPolicy` and the recognition
// of `.ai-task-manager/activity-policy.json` itself as a config glob.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  loadPolicy,
  classifyEdit,
  DEFAULT_POLICY,
} from '../../../../task-tracker/activity-policy.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

// Write a `.ai-task-manager/activity-policy.json` under a fresh temp dir and
// return its path. Caller is responsible for cleanup via the returned dir.
function seedPolicy(policyObj) {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-policy-'));
  mkdirSync(path.join(dir, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(dir, '.ai-task-manager', 'activity-policy.json'),
    JSON.stringify(policyObj),
    'utf8'
  );
  return dir;
}

// ---------------------------------------------------------------------------
// `.ai-task-manager/activity-policy.json` is a recognized config file
// ---------------------------------------------------------------------------
test('the activity-policy file itself classifies as WRITE_CODE (config)', () => {
  assert.ok(
    DEFAULT_POLICY.configGlobs.includes('.ai-task-manager/activity-policy.json'),
    'policy path must be in DEFAULT_POLICY.configGlobs'
  );
  assert.equal(classifyEdit('.ai-task-manager/activity-policy.json'), 'WRITE_CODE');
});

// ---------------------------------------------------------------------------
// `*Extra` keys append onto the in-effect base list
// ---------------------------------------------------------------------------
test('codeGlobsExtra keeps every default codeGlob plus the additions', () => {
  const dir = seedPolicy({ codeGlobsExtra: ['e2e/**', 'public/**', 'index.html'] });
  try {
    const policy = loadPolicy(dir);
    for (const g of DEFAULT_POLICY.codeGlobs) assert.ok(policy.codeGlobs.includes(g));
    assert.ok(policy.codeGlobs.includes('e2e/**'));
    assert.ok(policy.codeGlobs.includes('public/**'));
    // The additions are live: a file under the extra glob classifies as code.
    assert.equal(classifyEdit('e2e/login.spec.ts', policy), 'WRITE_CODE');
    assert.equal(classifyEdit('public/favicon.svg', policy), 'WRITE_CODE');
    // And a default code glob still resolves.
    assert.equal(classifyEdit('src/app.js', policy), 'WRITE_CODE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('configGlobsExtra adds vite/playwright configs without restating defaults', () => {
  const dir = seedPolicy({
    configGlobsExtra: ['vite.config.*', 'vitest.config.*', 'playwright.config.*'],
  });
  try {
    const policy = loadPolicy(dir);
    // No default config glob is lost (the footgun this fixes).
    assert.ok(policy.configGlobs.includes('package.json'));
    assert.ok(policy.configGlobs.includes('tsconfig.json'));
    assert.equal(classifyEdit('vite.config.ts', policy), 'WRITE_CODE');
    assert.equal(classifyEdit('playwright.config.js', policy), 'WRITE_CODE');
    assert.equal(classifyEdit('package.json', policy), 'WRITE_CODE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('deployGlobsExtra keeps every default deployGlob plus the additions', () => {
  const dir = seedPolicy({ deployGlobsExtra: ['fly.toml', 'Procfile'] });
  try {
    const policy = loadPolicy(dir);
    for (const g of DEFAULT_POLICY.deployGlobs) assert.ok(policy.deployGlobs.includes(g));
    assert.ok(policy.deployGlobs.includes('fly.toml'));
    assert.ok(policy.deployGlobs.includes('Procfile'));
    // The additions are live: a file under the extra glob classifies as code.
    assert.equal(classifyEdit('fly.toml', policy), 'WRITE_CODE');
    assert.equal(classifyEdit('Procfile', policy), 'WRITE_CODE');
    // And a default deploy glob still resolves.
    assert.equal(classifyEdit('Dockerfile', policy), 'WRITE_CODE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('docGlobsExtra appends onto the default docGlobs', () => {
  const dir = seedPolicy({ docGlobsExtra: ['handbook/**'] });
  try {
    const policy = loadPolicy(dir);
    for (const g of DEFAULT_POLICY.docGlobs) assert.ok(policy.docGlobs.includes(g));
    assert.equal(classifyEdit('handbook/intro.txt', policy), 'WRITE_DOCS');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// base-key override still replaces, with `*Extra` appended onto the replacement
// ---------------------------------------------------------------------------
test('a base configGlobs override replaces defaults, then configGlobsExtra appends', () => {
  const dir = seedPolicy({
    configGlobs: ['only.config'],
    configGlobsExtra: ['extra.config'],
  });
  try {
    const policy = loadPolicy(dir);
    assert.deepEqual(policy.configGlobs, ['only.config', 'extra.config']);
    // A default that was NOT restated is genuinely gone (replace semantics).
    assert.equal(classifyEdit('package.json', policy), 'WRITE_OTHER');
    assert.equal(classifyEdit('only.config', policy), 'WRITE_CODE');
    assert.equal(classifyEdit('extra.config', policy), 'WRITE_CODE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// defensive: non-array `*Extra` is ignored; absent `*Extra` leaves base intact
// ---------------------------------------------------------------------------
test('non-array *Extra values are ignored', () => {
  const dir = seedPolicy({ codeGlobsExtra: 'not-an-array', configGlobsExtra: { nope: true } });
  try {
    const policy = loadPolicy(dir);
    assert.deepEqual(policy.codeGlobs, DEFAULT_POLICY.codeGlobs);
    assert.deepEqual(policy.configGlobs, DEFAULT_POLICY.configGlobs);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no policy file → DEFAULT_POLICY unchanged', () => {
  const dir = mkdtempSync(path.join(projectScratchDir('test'), 'aitm-no-policy-'));
  try {
    assert.equal(loadPolicy(dir), DEFAULT_POLICY);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
