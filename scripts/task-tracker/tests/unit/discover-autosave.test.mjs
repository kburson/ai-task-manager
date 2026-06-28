#!/usr/bin/env node
// @story #576 — Discover-autosave brainstorm to a tracked draft.
//
// Forward contract bound to all four #576 ACs:
//   AC1 — `/task discover` autosaves its working bucket to a tracked
//         `docs/plans/.drafts/<slug>.md` as the discovery accumulates
//         (incremental write — overwrites the same file, not a new file per
//         flush, and not only on finalize).
//   AC2 — the draft path is git-trackable (not matched by `.gitignore`), so an
//         in-progress brainstorm survives a commit/push → pull on another
//         machine.
//   AC3 — the existing finalize/save-plan flow (`docs/plans/YYYYMMDD-<slug>.md`)
//         is unchanged.
//   AC4 — the finalize-vs-draft lifecycle is decided and implemented:
//         `save-plan` clears the matching draft on finalize; clearing a missing
//         draft is a no-op.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DRAFTS_SUBDIR,
  clearDraftFile,
  draftPathFor,
  draftsDir,
  resolveDraftSlug,
  saveDraftFile,
} from '../../lib/draft-file.mjs';
import { savePlanFile } from '../../lib/plan-file.mjs';
import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..', '..', '..', '..');

function tmpProject() {
  return mkdtempProjectIsolated('discover-autosave-');
}

// ── AC1 — incremental autosave under docs/plans/.drafts/ ────────────────────
test('AC1: saveDraftFile writes the draft under docs/plans/.drafts/<slug>.md', () => {
  const projectDir = tmpProject();
  try {
    const dest = saveDraftFile({ projectDir, slug: 'My Brainstorm', content: 'first' });
    assert.equal(
      dest,
      path.join(projectDir, 'docs', 'plans', '.drafts', 'my-brainstorm.md'),
      'draft lands at docs/plans/.drafts/<slug>.md'
    );
    assert.equal(readFileSync(dest, 'utf8'), 'first');
    assert.ok(DRAFTS_SUBDIR.endsWith(path.join('docs', 'plans', '.drafts')));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('AC1: autosave is incremental — repeated flushes overwrite the SAME file', () => {
  const projectDir = tmpProject();
  try {
    saveDraftFile({ projectDir, slug: 'brainstorm', content: 'bullet 1\n' });
    saveDraftFile({ projectDir, slug: 'brainstorm', content: 'bullet 1\nbullet 2\n' });
    const finalPath = saveDraftFile({
      projectDir,
      slug: 'brainstorm',
      content: 'bullet 1\nbullet 2\nbullet 3\n',
    });
    // Exactly one draft file — no fan-out of N dated files as the discovery grows.
    const files = readdirSync(draftsDir(projectDir));
    assert.deepEqual(files, ['brainstorm.md'], 'one slug-keyed file, overwritten each flush');
    assert.equal(readFileSync(finalPath, 'utf8'), 'bullet 1\nbullet 2\nbullet 3\n');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ── AC2 — the draft path is git-trackable ───────────────────────────────────
test('AC2: docs/plans/.drafts/<slug>.md is NOT git-ignored (survives commit/push → pull)', () => {
  const sample = path.join('docs', 'plans', '.drafts', 'sample-brainstorm.md');
  let ignored = false;
  try {
    // `git check-ignore` exits 0 when the path IS ignored, 1 when it is not.
    execFileSync('git', ['-C', ROOT, 'check-ignore', '-q', sample]);
    ignored = true;
  } catch (err) {
    ignored = err.status === 0;
  }
  assert.equal(
    ignored,
    false,
    'the drafts path must be git-trackable so it survives a machine swap'
  );
});

// ── AC3 — finalize/save-plan output is unchanged ────────────────────────────
test('AC3: savePlanFile still writes the date-stamped docs/plans/YYYYMMDD-<slug>.md (untouched)', () => {
  const projectDir = tmpProject();
  try {
    const now = new Date('2026-06-27T12:00:00Z');
    const saved = savePlanFile({
      title: 'My Plan',
      content: '# My Plan\n\n## Scope\nx\n',
      projectDir,
      now,
    });
    assert.equal(
      saved,
      path.join(projectDir, 'docs', 'plans', '20260627-my-plan.md'),
      'finalized plan path format is unchanged by the draft feature'
    );
    // The finalize surface and the draft surface are distinct directories.
    assert.notEqual(path.dirname(saved), draftsDir(projectDir));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

// ── AC4 — finalize-vs-draft lifecycle: save-plan clears the matching draft ───
test('AC4: clearDraftFile removes the matching draft and is a no-op when absent', () => {
  const projectDir = tmpProject();
  try {
    const dest = saveDraftFile({ projectDir, slug: 'doomed', content: 'interim' });
    assert.ok(existsSync(dest));
    assert.equal(clearDraftFile({ projectDir, slug: 'doomed' }), true, 'removes the draft');
    assert.equal(existsSync(dest), false);
    // Second clear (now absent) is a harmless no-op.
    assert.equal(clearDraftFile({ projectDir, slug: 'doomed' }), false, 'no-op when absent');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('AC4: resolveDraftSlug agrees across save-draft and save-plan so the right draft is cleared', () => {
  // Explicit slug wins; then title; then content H1; then the discover-date fallback.
  assert.equal(resolveDraftSlug({ slug: 'Explicit Slug' }), 'explicit-slug');
  assert.equal(resolveDraftSlug({ title: 'A Title' }), 'a-title');
  assert.equal(resolveDraftSlug({ content: '# H1 Heading\n\nbody' }), 'h1-heading');
  assert.equal(resolveDraftSlug({ startedAt: '2026-06-27T19:50:05.626Z' }), 'discover-20260627');
});

// Integration: the real save-draft → save-plan flow through the verbs. A draft
// autosaved during discovery is cleared when the plan is finalized, while the
// date-stamped plan is written. Exercises the full wiring honestly, no stubs of
// the units under test.
test('AC1+AC4 integration: save-draft autosaves; save-plan finalizes and clears the draft', async () => {
  const projectDir = tmpProject();
  const statePath = path.join(projectDir, '.tmp', 'aitm', 'state', 'task-tracker-state.json');
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({
        active: 'discover',
        lastActive: null,
        discoverBucket: { startedAt: '2026-06-27T19:50:05.626Z', wordsAtStart: 0, entries: [] },
      }) + '\n'
    );

    const draftSrc = path.join(projectDir, 'brainstorm.md');
    writeFileSync(draftSrc, '# Autosave Story\n\nrough notes\n');

    const { verbSaveDraft } = await import('../../verbs/save-draft.mjs');
    await verbSaveDraft({ statePath, projectDir, rest: ['--from-file', draftSrc] });

    const draftPath = draftPathFor({ projectDir, slug: 'autosave-story' });
    assert.ok(existsSync(draftPath), 'save-draft wrote the tracked draft');

    // Bucket carries the resolved slug so finalize can find the draft.
    const afterDraft = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(afterDraft.discoverBucket.draftSlug, 'autosave-story');

    const planSrc = path.join(projectDir, 'final-plan.md');
    writeFileSync(planSrc, '# Autosave Story\n\n## Scope\nfinal scope\n');

    const { verbSavePlan } = await import('../../verbs/save-plan.mjs');
    await verbSavePlan({ statePath, projectDir, rest: ['--from-file', planSrc] });

    // Finalize wrote the date-stamped plan AND cleared the interim draft.
    const planFiles = readdirSync(path.join(projectDir, 'docs', 'plans')).filter((f) =>
      f.endsWith('.md')
    );
    assert.equal(planFiles.length, 1, 'one finalized plan written');
    assert.match(planFiles[0], /^\d{8}-autosave-story\.md$/);
    assert.equal(existsSync(draftPath), false, 'save-plan cleared the matching draft on finalize');
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
