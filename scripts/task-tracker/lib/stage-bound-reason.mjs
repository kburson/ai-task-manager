// #281 — shared formatter for stage-bound refusals (Plan-artifact in Refine,
// Develop-artifact in Plan). Used by gh-edit-guard (Refine deep-dive gate) and
// verbs/check.mjs (Refine /task ensureChecked "Deep dive complete" gate). Kept pure
// so tests can pin the message shape without booting a hook.
//
// Grandfather: an issue body carrying `<!-- aitm-stage-bound-grandfather -->`
// bypasses the new gates. Scoped to AC1/AC2 only (body edits + check verb);
// AC3/AC4 (Plan file-writes, Plan git commits) are forward-looking and the
// grandfather marker does not apply there.

const GRANDFATHER_RE = /<!--\s*aitm-stage-bound-grandfather\b/i;

export function hasStageBoundGrandfather(body) {
  return GRANDFATHER_RE.test(String(body || ''));
}

export function formatStageBoundRefusal({ state, action, nextVerb, nextState, issueNumber }) {
  const verbHint =
    nextVerb && nextState ? `${nextVerb} → ${nextState}` : nextVerb || '/task promote';
  const target = issueNumber ? `#${String(issueNumber).replace(/^#/, '')}` : 'the active task';
  return [
    `stage-bound refusal: ${action} is not permitted while ${target} is in state \`${state}\`.`,
    `  To proceed: ${verbHint}, then retry.`,
    `  Bypass (legacy artifacts only): add an \`<!-- aitm-stage-bound-grandfather -->\` marker to the body.`,
  ].join('\n');
}
