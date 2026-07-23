#!/usr/bin/env node
// @story #499
// Structural coverage for the server-side `{discuss}` auto-label Action. The
// workflow is declarative YAML outside the product's runtime path, so the proof
// that the ACs hold is parsing it and asserting the contract it encodes:
//   AC1  applies the `Discuss` label on issue open/edit when a bare `{discuss}`
//        token line is present
//   AC2  no-op when the token is absent, idempotent, and respects the
//        `aitm-discussed` marker (does not fight client-side reconcileDiscuss)
//   AC3  needs no permissions beyond the repo GITHUB_TOKEN (issues: write)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Resolve the repo root from this test file's location (…/scripts/task-tracker/
// tests/unit/ → four levels up), so the suite is cwd-independent.
const here = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const wfPath = path.join(repoRoot, '.github', 'workflows', 'label-discuss.yml');

const wfText = readFileSync(wfPath, 'utf8');
const wf = yaml.load(wfText);
// `on:` parses to the boolean key true in YAML 1.1; tolerate either spelling.
const on = wf.on || wf[true];
const script = wf.jobs.label.steps.find((s) => s.uses && s.uses.startsWith('actions/github-script'))
  .with.script;

describe('#499 {discuss} auto-label Action', () => {
  it('triggers on issue open and edit — AC1', () => {
    assert.deepEqual(on.issues.types, ['opened', 'edited']);
  });

  it('applies the Discuss label from a bare {discuss} token line — AC1', () => {
    assert.match(script, /\{discuss\}/);
    // Bare-line detection: trimmed content equals the token exactly.
    assert.match(script, /\.trim\(\) === DISCUSS_TOKEN/);
    assert.match(script, /addLabels/);
    assert.match(script, /Discuss/);
  });

  it('no-ops when the token is absent — AC2', () => {
    assert.match(script, /if \(!pending\)/);
    assert.match(script, /nothing to label/i);
  });

  it('respects the aitm-discussed marker so it does not fight reconcileDiscuss — AC2', () => {
    assert.match(script, /aitm-discussed/);
    assert.match(script, /discussion resolved/i);
  });

  it('is idempotent: skips when the label is already present — AC2', () => {
    assert.match(script, /already present/i);
    assert.match(script, /return;/);
  });

  it('needs only issues: write (the repo GITHUB_TOKEN) — AC3', () => {
    assert.deepEqual(wf.permissions, { issues: 'write' });
  });

  it('documents the label as a required one-time setup step', () => {
    assert.match(wfText, /SETUP/);
    assert.match(wfText, /gh label create Discuss/);
  });
});
