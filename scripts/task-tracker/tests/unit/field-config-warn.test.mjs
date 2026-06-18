// @story #309
// #314 — Regression tests for the silent-skip → WARN contract.
//
// Covers:
//   - warnMissingFieldId emits a single-line WARN to stderr.
//   - WARN is deduped per (process, cfgKey).
//   - selfCheckFieldConfig emits one consolidated WARN listing all missing keys.
//   - writeBlockedByField surfaces the WARN when cfg.fieldBlockedBy is absent.
//   - stampStartTime surfaces the WARN when cfg.fieldStartTime is absent.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  warnMissingFieldId,
  selfCheckFieldConfig,
  __resetFieldConfigWarnings,
  WELL_KNOWN_FIELD_KEYS,
} from '../../lib/field-config-warn.mjs';
import { writeBlockedByField } from '../../lib/blocked-by-field.mjs';
import { stampStartTime } from '../../lib/stamp-start-time.mjs';

function makeStream() {
  return {
    chunks: [],
    write(s) {
      this.chunks.push(String(s));
    },
    text() {
      return this.chunks.join('');
    },
  };
}

test('warnMissingFieldId: emits expected single-line WARN', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  const ok = warnMissingFieldId({
    cfgKey: 'fieldBlockedBy',
    context: 'board mirror skipped',
    stream,
  });
  assert.equal(ok, true);
  const out = stream.text();
  assert.match(out, /^\[task-tracker\] WARN:/);
  assert.match(out, /"Blocked By"/);
  assert.match(out, /cfg\.fieldBlockedBy/);
  assert.match(out, /board mirror skipped/);
  assert.match(out, /init-project-config\.sh/);
  // Single newline at end, no embedded newlines (single-line contract).
  assert.equal(out.endsWith('\n'), true);
  assert.equal(out.split('\n').filter(Boolean).length, 1);
});

test('warnMissingFieldId: deduped per cfgKey', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  warnMissingFieldId({ cfgKey: 'fieldBlockedBy', stream });
  warnMissingFieldId({ cfgKey: 'fieldBlockedBy', stream });
  warnMissingFieldId({ cfgKey: 'fieldBlockedBy', stream });
  const lines = stream.text().split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
});

test('warnMissingFieldId: distinct cfgKeys each warn once', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  warnMissingFieldId({ cfgKey: 'fieldBlockedBy', stream });
  warnMissingFieldId({ cfgKey: 'fieldStartTime', stream });
  warnMissingFieldId({ cfgKey: 'fieldBlockedBy', stream });
  const lines = stream.text().split('\n').filter(Boolean);
  assert.equal(lines.length, 2);
});

test('warnMissingFieldId: rejects empty cfgKey', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  const ok = warnMissingFieldId({ cfgKey: '', stream });
  assert.equal(ok, false);
  assert.equal(stream.text(), '');
});

test('selfCheckFieldConfig: emits consolidated WARN listing every missing key', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  const r = selfCheckFieldConfig({ cfg: {}, stream });
  assert.equal(r.warned, true);
  assert.deepEqual(r.missing.sort(), [...WELL_KNOWN_FIELD_KEYS].sort());
  const out = stream.text();
  assert.match(out, /^\[task-tracker\] WARN: configuration is missing/);
  for (const k of WELL_KNOWN_FIELD_KEYS) {
    assert.match(out, new RegExp(`cfg\\.${k}`));
  }
});

test('selfCheckFieldConfig: no WARN when all keys present', () => {
  __resetFieldConfigWarnings();
  const cfg = Object.fromEntries(WELL_KNOWN_FIELD_KEYS.map((k) => [k, 'PVTF_x']));
  const stream = makeStream();
  const r = selfCheckFieldConfig({ cfg, stream });
  assert.equal(r.warned, false);
  assert.equal(r.missing.length, 0);
  assert.equal(stream.text(), '');
});

test('selfCheckFieldConfig: deduped per process', () => {
  __resetFieldConfigWarnings();
  const stream = makeStream();
  selfCheckFieldConfig({ cfg: {}, stream });
  selfCheckFieldConfig({ cfg: {}, stream });
  const lines = stream.text().split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
});

test('#342 — every WELL_KNOWN_FIELD_KEY is enumerated in config.mjs DEFAULTS', async () => {
  const { DEFAULTS } = await import('../../config.mjs');
  const stripped = WELL_KNOWN_FIELD_KEYS.filter((k) => !(k in DEFAULTS));
  assert.deepEqual(
    stripped,
    [],
    `WELL_KNOWN_FIELD_KEYS contains keys not in DEFAULTS — loadConfig() will silently strip them: ${stripped.join(', ')}`
  );
});

test('#342 — fresh-init cfg fixture populates every WELL_KNOWN_FIELD_KEY via fieldIds auto-mirror', async () => {
  // Simulates the JSON shape produced by `scripts/gh/init-project-config.sh`
  // after it discovers every entry in config/project-fields.default.json.
  const projectJson = {
    repo: 'o/r',
    projectId: 'PVT_x',
    kanbanFieldId: 'PVTSSF_kanban',
    priorityFieldId: 'PVTSSF_pri',
    sizeFieldId: 'PVTSSF_sz',
    fieldEstimate: 'PVTF_est',
    fieldEngagedTime: 'PVTF_eng',
    fieldSessionTime: 'PVTF_ses',
    fieldSequence: 'PVTF_seq',
    fieldStartTime: 'PVTF_st',
    fieldBlockedBy: 'PVTF_bb',
    // reviewTime and planTime are written under fieldIds; the loader's
    // auto-mirror lifts them to top-level cfg.fieldReviewTime / fieldPlanTime.
    fieldIds: {
      reviewTime: 'PVTF_rev',
      planTime: 'PVTF_plan',
    },
  };
  const { writeFileSync } = await import('node:fs');
  const path = await import('node:path');
  const { mkdtempProjectIsolated } = await import('../../lib/scratch-dir.mjs');
  const dir = mkdtempProjectIsolated('aitm-cfg-342-', 'test');
  const projectPath = path.join(dir, 'task-tracker.json');
  writeFileSync(projectPath, JSON.stringify(projectJson));
  const { loadConfig } = await import('../../config.mjs');
  const cfg = loadConfig({ projectPath, userPath: path.join(dir, 'user.json') });
  __resetFieldConfigWarnings();
  const stream = makeStream();
  const r = selfCheckFieldConfig({ cfg, stream });
  assert.deepEqual(r.missing, [], `expected no missing keys, got: ${r.missing.join(', ')}`);
  assert.equal(r.warned, false);
  assert.equal(stream.text(), '');
});

test('writeBlockedByField: missing cfg.fieldBlockedBy → WARN to stderr', async () => {
  __resetFieldConfigWarnings();
  const captured = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => {
    captured.push(String(s));
    return true;
  };
  try {
    const r = await writeBlockedByField({
      issueNumber: 1,
      refs: [2],
      cfg: { repo: 'o/r', projectId: 'P_x', fieldBlockedBy: '' },
    });
    assert.deepEqual(r, { skipped: 'no-field-id' });
  } finally {
    process.stderr.write = origWrite;
  }
  const out = captured.join('');
  assert.match(out, /\[task-tracker\] WARN/);
  assert.match(out, /fieldBlockedBy/);
});

test('stampStartTime: missing cfg.fieldStartTime → WARN to stderr', async () => {
  __resetFieldConfigWarnings();
  const captured = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (s) => {
    captured.push(String(s));
    return true;
  };
  try {
    const r = await stampStartTime({
      cfg: { repo: 'o/r', projectId: 'P_x' },
      issueNumber: 1,
    });
    assert.equal(r.status, 'skipped');
    assert.equal(r.reason, 'no-field-configured');
  } finally {
    process.stderr.write = origWrite;
  }
  const out = captured.join('');
  assert.match(out, /\[task-tracker\] WARN/);
  assert.match(out, /fieldStartTime/);
});
