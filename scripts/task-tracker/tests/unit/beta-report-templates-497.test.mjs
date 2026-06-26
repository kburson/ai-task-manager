#!/usr/bin/env node
// @story #497
// Structural coverage for the upstream beta-report channel's GitHub surface:
// two issue-form templates and the server-side auto-label Action. These files
// are declarative YAML outside the product's runtime path, so the proof that
// the ACs hold is parsing them and asserting the contract each one encodes:
//   AC1  labels documented as a required setup step (workflow header)
//   AC2  both issue-form templates exist with default labels + CLI-mirrored fields
//   AC3  Action applies the label from title prefix OR body marker, no-op otherwise
//   AC4  Action is idempotent and needs only the repo GITHUB_TOKEN (issues: write)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// Resolve the repo root from this test file's location (…/scripts/task-tracker/
// tests/unit/ → four levels up), so the suite is cwd-independent.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const ghDir = path.join(repoRoot, '.github');

function readText(rel) {
  return readFileSync(path.join(ghDir, rel), 'utf8');
}
function readYaml(rel) {
  return yaml.load(readText(rel));
}

describe('#497 beta-report issue-form templates', () => {
  it('defect template defaults the beta-defect label and mirrors the CLI sections', () => {
    const t = readYaml('ISSUE_TEMPLATE/beta-defect.yml');
    assert.deepEqual(t.labels, ['beta-defect']);
    assert.match(t.title, /^🐞/);
    const labels = t.body
      .filter((b) => b.attributes && b.attributes.label)
      .map((b) => b.attributes.label);
    // Sections mirror the CLI defect template: What happened / Where / Environment.
    assert.ok(labels.includes('What happened'));
    assert.ok(labels.includes('Where'));
    assert.ok(labels.includes('Environment'));
  });

  it('manual bug template defaults the bug label and the 🐞 prefix (#507)', () => {
    const t = readYaml('ISSUE_TEMPLATE/bug.yml');
    assert.deepEqual(t.labels, ['bug']);
    assert.match(t.title, /^🐞/);
  });

  it('feature template defaults the beta-feature label and mirrors the CLI sections', () => {
    const t = readYaml('ISSUE_TEMPLATE/beta-feature.yml');
    assert.deepEqual(t.labels, ['beta-feature']);
    // #545 re-themed the beta-feature template title prefix ✨ → 🙏 [Feature Request].
    assert.match(t.title, /^🙏 \[Feature Request\] /);
    const labels = t.body
      .filter((b) => b.attributes && b.attributes.label)
      .map((b) => b.attributes.label);
    // Sections mirror the CLI feature template: What I want / Why it matters / Notes.
    assert.ok(labels.includes('What I want'));
    assert.ok(labels.includes('Why it matters'));
    assert.ok(labels.includes('Notes'));
  });
});

describe('#497 auto-label Action', () => {
  const wf = readYaml('workflows/label-beta-report.yml');
  const wfText = readText('workflows/label-beta-report.yml');
  // `on:` parses to the boolean key true in YAML 1.1; tolerate either spelling.
  const on = wf.on || wf[true];
  const script = wf.jobs.label.steps.find(
    (s) => s.uses && s.uses.startsWith('actions/github-script')
  ).with.script;

  it('triggers on open, edit, and label add/remove', () => {
    assert.deepEqual(on.issues.types, ['opened', 'edited', 'labeled', 'unlabeled']);
  });

  it('needs only issues: write (the repo GITHUB_TOKEN) — AC4', () => {
    assert.deepEqual(wf.permissions, { issues: 'write' });
  });

  it('derives the beta label from the durable body marker only — AC3', () => {
    // The emoji title prefix (🐞) is ambiguous across internal/external bugs,
    // so the beta label is keyed off the marker alone, never the title.
    assert.match(script, /aitm-beta-defect/);
    assert.match(script, /aitm-beta-feature/);
    assert.match(script, /body\.includes\(r\.marker\)/);
  });

  it('reconciles the 🐞 / ✨ title prefix from the labels present', () => {
    assert.match(script, /🐞/);
    assert.match(script, /✨/);
    // bug, beta-defect → ladybug; beta-feature → sparkle.
    assert.match(script, /wantLadybug/);
    assert.match(script, /wantSparkle/);
    assert.match(script, /issues\.update/);
  });

  it('strips the 🐞 only when no bug signal remains on unlabeled — AC3', () => {
    // wantEmoji collapses to '' when no bug/feature signal is present, which
    // drops the leading emoji from the reconciled title.
    assert.match(script, /wantLadybug \? LADYBUG : wantSparkle \? SPARKLE : ''/);
    assert.match(script, /title\.slice\(leading\.length\)/);
  });

  it('no-ops when there is nothing to label or reconcile — AC3', () => {
    assert.match(script, /nothing to label/i);
    assert.match(script, /nothing to reconcile/i);
  });

  it('is idempotent: skips when the label is already present — AC4', () => {
    assert.match(script, /already present/i);
    assert.match(script, /return;/);
    assert.match(script, /addLabels/);
  });

  it('documents the labels as a required one-time setup step — AC1', () => {
    assert.match(wfText, /SETUP/);
    assert.match(wfText, /gh label create beta-defect/);
    assert.match(wfText, /gh label create beta-feature/);
  });
});
