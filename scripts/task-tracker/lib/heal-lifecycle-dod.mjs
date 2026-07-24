// #819 — detect + heal issues whose `### Lifecycle` section still carries the
// pre-c59461f (#809) single `Passed final human review` checkbox instead of
// the two-checkbox `Agent Review Passed` / `Final Review Passed` form. Issues
// created before #809 landed keep the old form forever — nothing in the verb
// chain (review, approve, close) rewrites it — so they never exercise the
// Agent Review Gate's objective validator, sailing through Review on the old
// subjective tick alone (or, if a gate code path assumes the new form,
// failing to close at all).
//
// This module provides:
//   - detectStaleLifecycleForm(body): whether the Lifecycle section still
//     carries the old single checkbox with no `Agent Review Passed` line.
//   - healLifecycleDod(body): rewrite that line to the two-checkbox form,
//     preserving its tick state onto `Final Review Passed` and leaving every
//     other Lifecycle item (and everything outside the Lifecycle section)
//     untouched.

import {
  locateLifecycleSection,
  LIFECYCLE_LABELS,
  LIFECYCLE_LABEL_ALIASES,
} from './lifecycle-dod.mjs';

const AGENT_REVIEW_LABEL = LIFECYCLE_LABELS['agent-review-passed'];
const FINAL_REVIEW_LABEL = LIFECYCLE_LABELS['passed-final-review'];
const OLD_LABEL = LIFECYCLE_LABEL_ALIASES['passed-final-review'][0];

const BOX_RE = /^(\s*)- \[([ x])\]\s+(.+)$/;

function stripMarker(text) {
  return String(text || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

// Scan the body's `### Lifecycle` section for the stale pre-#809 form: the
// old single `Passed final human review` line present AND no
// `Agent Review Passed` line yet. An issue already retrofitted, or authored
// post-#809, already carries the new label and is left alone — the
// idempotency guarantee. Returns `{ sectionPresent, affected, oldLineIndex,
// oldChecked }`, `oldLineIndex` relative to the section text.
export function detectStaleLifecycleForm(body) {
  const loc = locateLifecycleSection(body);
  if (!loc) {
    return { sectionPresent: false, affected: false, oldLineIndex: -1, oldChecked: false };
  }

  const lines = loc.section.split('\n');
  let oldLineIndex = -1;
  let oldChecked = false;
  let hasNewLabel = false;

  lines.forEach((line, i) => {
    const box = line.match(BOX_RE);
    if (!box) return;
    const label = stripMarker(box[3]);
    if (label === OLD_LABEL && oldLineIndex === -1) {
      oldLineIndex = i;
      oldChecked = box[2] === 'x';
    } else if (label === AGENT_REVIEW_LABEL) {
      hasNewLabel = true;
    }
  });

  return {
    sectionPresent: true,
    affected: oldLineIndex !== -1 && !hasNewLabel,
    oldLineIndex,
    oldChecked,
  };
}

// Rewrite the stale single-checkbox line to the two-checkbox form. Preserves
// the old line's tick state onto `Final Review Passed` (the relabeled
// subjective item) and inserts a fresh, unticked `Agent Review Passed` ahead
// of it — the objective gate has not yet run against this retrofitted issue.
// Every other line in the section, and everything outside the Lifecycle
// section, is untouched. Idempotent: returns `{ changed: false }` once the
// new label is present (a second pass against an already-healed body is a
// no-op).
export function healLifecycleDod(body) {
  const src = String(body || '');
  const det = detectStaleLifecycleForm(src);
  if (!det.affected) return { body: src, changed: false };

  const loc = locateLifecycleSection(src);
  const lines = loc.section.split('\n');
  const oldLine = lines[det.oldLineIndex];
  const indent = oldLine.match(BOX_RE)[1];
  const finalChar = det.oldChecked ? 'x' : ' ';
  lines.splice(
    det.oldLineIndex,
    1,
    `${indent}- [ ] ${AGENT_REVIEW_LABEL}`,
    `${indent}- [${finalChar}] ${FINAL_REVIEW_LABEL}`
  );

  const nextSection = lines.join('\n');
  const next = loc.before + nextSection + loc.after;
  return { body: next, changed: next !== src };
}
