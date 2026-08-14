// @story #762
// #762 — write-side `vc:<n>` citation authoring. Proves that `citeCommands`
// emits citations, that `buildEvidenceBackfill` authors AC verifiers as
// citations by default (appending to `## Verification Commands` only when the
// command is new), that the resulting citations round-trip through the read
// side and remain demonstrable to the Refine→Plan gate, and that the legacy
// embedded form still authors/reads unchanged.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { citeCommands, resolveVcRefCommands } from '../../../../task-tracker/lib/vc-ref.mjs';
import {
  buildEvidenceBackfill,
  parseEvidenceChecklist,
} from '../../../../task-tracker/lib/evidence-markers.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';
import { findAcsWithoutVerifierOrInvalidTag } from '../../../../task-tracker/lib/body-invariants.mjs';
import { autoTickVerified } from '../../../../task-tracker/lib/auto-tick-verified.mjs';
import { serializeProofMarker } from '../../../../task-tracker/lib/proof-marker.mjs';

const NOW = '2026-07-09T00:00:00.000Z';

// ---------------------------------------------------------------------------
// citeCommands — the pure emitter
// ---------------------------------------------------------------------------

test('citeCommands: reuses an existing VC entry position, no append (AC1)', () => {
  const vc = [{ command: 'node --test a.test.mjs' }, { command: 'node --test b.test.mjs' }];
  assert.deepEqual(citeCommands(['node --test b.test.mjs'], vc), {
    cmd: 'vc:2',
    appended: [],
  });
});

test('citeCommands: appends an absent command and cites its new 1-based position (AC2)', () => {
  const vc = [{ command: 'node --test a.test.mjs' }];
  assert.deepEqual(citeCommands(['node --test new.test.mjs'], vc), {
    cmd: 'vc:2',
    appended: ['node --test new.test.mjs'],
  });
});

test('citeCommands: multi-command mixes reuse + append into a citation run (AC4)', () => {
  const vc = [{ command: 'node --test a.test.mjs' }];
  assert.deepEqual(citeCommands(['node --test a.test.mjs', 'node --test b.test.mjs'], vc), {
    cmd: 'vc:1 vc:2',
    appended: ['node --test b.test.mjs'],
  });
});

test('citeCommands: a command cited twice appends once and cites one position', () => {
  assert.deepEqual(citeCommands(['dup', 'dup'], []), { cmd: 'vc:1 vc:1', appended: ['dup'] });
});

// ---------------------------------------------------------------------------
// buildEvidenceBackfill — authoring path emits citations by default
// ---------------------------------------------------------------------------

const BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] First criterion',
  '- [ ] Second criterion',
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test existing.test.mjs`',
  '',
].join('\n');

const MAPPINGS = {
  'First criterion': ['node --test existing.test.mjs'], // already in VC list → cite, no append
  'Second criterion': ['node --test new.test.mjs'], // absent → append + cite
};

test('buildEvidenceBackfill: cites an existing VC command without re-listing it (AC1)', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  assert.equal(r.ok, true);
  const lines = r.body.split('\n');
  const ac1 = lines.find((l) => l.startsWith('- [ ] First criterion'));
  // #928 — a pure `vc:<n>` citation run serializes into the canonical
  // `vc-list` attribute, never the deprecated ordinal `cmd` attribute.
  assert.match(ac1, /aitm-verified vc-list="vc:1"/);
  assert.doesNotMatch(ac1, /cmd="vc:1"/);
  // AC1's own command was already present, so it is NOT re-appended to the list.
  assert.equal(r.addedVerificationCommands.includes('node --test existing.test.mjs'), false);
});

test('buildEvidenceBackfill: appends an absent command and cites its new position (AC2)', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  const lines = r.body.split('\n');
  const ac2 = lines.find((l) => l.startsWith('- [ ] Second criterion'));
  // #928 — canonical `vc-list` attribute, not the deprecated ordinal `cmd`.
  assert.match(ac2, /aitm-verified vc-list="vc:2"/);
  assert.doesNotMatch(ac2, /cmd="vc:2"/);
  assert.deepEqual(r.addedVerificationCommands, ['node --test new.test.mjs']);
  // The new command is now bullet #2 in the VC list.
  const vc = parseVerificationCommands(r.body);
  assert.equal(vc.length, 2);
  assert.equal(vc[1].command, 'node --test new.test.mjs');
});

test('buildEvidenceBackfill: no raw command is embedded in the AC markers', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  const acSection = r.body.split('## Verification Commands')[0];
  assert.doesNotMatch(acSection, /aitm-verified cmd="`/); // citations only, never embedded
});

test('buildEvidenceBackfill: cited positions round-trip through the read-side resolver', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  const vc = parseVerificationCommands(r.body);
  assert.deepEqual(resolveVcRefCommands('vc:1', vc), ['node --test existing.test.mjs']);
  assert.deepEqual(resolveVcRefCommands('vc:2', vc), ['node --test new.test.mjs']);
});

test('buildEvidenceBackfill: citation-authored ACs pass the Refine→Plan demonstrability gate', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(r.body), []);
});

test('buildEvidenceBackfill: parseEvidenceChecklist resolves the cited commands back to literals', () => {
  const r = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  const parsed = parseEvidenceChecklist(r.body);
  // `parseEvidenceChecklist` leaves the appended marker on the label text, so
  // match by prefix rather than exact label.
  const first = parsed.acceptanceCriteria.find((a) => a.label.startsWith('First criterion'));
  const second = parsed.acceptanceCriteria.find((a) => a.label.startsWith('Second criterion'));
  assert.deepEqual(first.evidenceCommands, ['node --test existing.test.mjs']);
  assert.deepEqual(second.evidenceCommands, ['node --test new.test.mjs']);
});

test('buildEvidenceBackfill: second pass is a no-op (idempotent)', () => {
  const first = buildEvidenceBackfill(BODY, { mappings: MAPPINGS });
  const second = buildEvidenceBackfill(first.body, { mappings: MAPPINGS });
  assert.equal(second.ok, true);
  assert.deepEqual(second.addedEvidenceLabels, []); // nothing left missing evidence
  assert.deepEqual(second.addedVerificationCommands, []);
  assert.equal(second.body, first.body); // body byte-identical
});

// ---------------------------------------------------------------------------
// AC4 — multi-command citation auto-ticks only under AND-fan-in
// ---------------------------------------------------------------------------

const FANIN_BODY = [
  '## Acceptance Criteria',
  '',
  `- [ ] Combo criterion ${serializeProofMarker({ 'vc-list': 'vc:1 vc:2' })}`,
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test a.test.mjs`',
  '- [ ] `node --test b.test.mjs`',
  '',
].join('\n');

test('multi-command citation ticks only when every cited command passes (AC4)', () => {
  const { body } = autoTickVerified(
    FANIN_BODY,
    [
      { command: 'node --test a.test.mjs', passed: true, exit: 0 },
      { command: 'node --test b.test.mjs', passed: true, exit: 0 },
    ],
    NOW
  );
  const combo = body.split('\n').find((l) => l.includes('Combo criterion'));
  assert.match(combo, /^- \[x\] Combo criterion/);
});

test('multi-command citation stays unticked when one cited command fails (AC4)', () => {
  const { body } = autoTickVerified(
    FANIN_BODY,
    [
      { command: 'node --test a.test.mjs', passed: true, exit: 0 },
      { command: 'node --test b.test.mjs', passed: false, exit: 1 },
    ],
    NOW
  );
  const combo = body.split('\n').find((l) => l.includes('Combo criterion'));
  assert.match(combo, /^- \[ \] Combo criterion/);
});

// ---------------------------------------------------------------------------
// AC5 — legacy embedded-command ACs still author, read, and tick unchanged
// ---------------------------------------------------------------------------

const LEGACY_BODY = [
  '## Acceptance Criteria',
  '',
  `- [ ] Legacy criterion ${serializeProofMarker({ cmd: '`node --test legacy.test.mjs`' })}`,
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test legacy.test.mjs`',
  '',
].join('\n');

test('legacy embedded command still resolves as evidence (AC5)', () => {
  const parsed = parseEvidenceChecklist(LEGACY_BODY);
  const ac = parsed.acceptanceCriteria.find((a) => a.label.startsWith('Legacy criterion'));
  assert.deepEqual(ac.evidenceCommands, ['node --test legacy.test.mjs']);
});

test('legacy embedded command remains demonstrable to the gate (AC5)', () => {
  assert.deepEqual(findAcsWithoutVerifierOrInvalidTag(LEGACY_BODY), []);
});

test('legacy embedded command still auto-ticks on green (AC5)', () => {
  const { body } = autoTickVerified(
    LEGACY_BODY,
    [{ command: 'node --test legacy.test.mjs', passed: true, exit: 0 }],
    NOW
  );
  const line = body.split('\n').find((l) => l.includes('Legacy criterion'));
  assert.match(line, /^- \[x\] Legacy criterion/);
});
