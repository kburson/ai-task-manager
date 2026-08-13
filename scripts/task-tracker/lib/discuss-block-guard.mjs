// Discuss-directive blocking exit guard (#473).
//
// #405 shipped the `{discuss}` token convention (`lib/discuss-marker.mjs`):
// an author writes the visible token into an issue body to signal "talk to a
// human before driving this story." But #405 only surfaced a NON-BLOCKING
// advisory banner at bind/switch — nothing in the promotion path consulted it,
// so under full-auto (`TT_FULL_AUTO=1`) a discuss-tagged story was driven
// Refine → Plan → Develop with the requirement never surfaced (observed #461).
//
// This guard makes the existing token ENFORCE a blocking promotion gate. It is
// registered on the `backlog` state exit guards, so it fires on
// the first forward promotion out of Backlog and (because the
// resolution strips the token) fires at most once.
//
// Full-auto-proof by construction: `runGuards(from, to, ctx)` executes
// identically on the forward-promote path and the underlying state-mutator
// path, and is NEVER exempted under `TT_FULL_AUTO` — full-auto only
// short-circuits the human approval verbs (plan-approve, review-approve),
// never the guard registry. An exit guard therefore cannot be bypassed by
// full-auto.
//
// Resolution: `/task ensureChecked "discussion complete"` calls `markDiscussed`, which
// strips the token AND the durable `aitm-discuss-requested` marker and stamps
// the non-invariant `aitm-discussed` marker. Once the discussion is complete
// `isDiscussPending` is false and this guard passes.
//
// #486 — the guard keys on `isDiscussPending`, NOT the raw `{discuss}` token.
// `convergeDiscuss` (run at bind) strips the visible token but leaves the hidden
// `aitm-discuss-requested` marker, so keying on the token alone would silently
// disable this blocking gate the moment an issue was bound. `isDiscussPending`
// survives convergence (token OR request marker, not-yet-discussed), keeping the
// gate live across the token→marker transition.
//
// Context contract: { body?: string }. Fail-open when ctx or body is missing —
// parity with sibling adapters; lets non-promote runGuards callers no-op.

import { hasDiscussMarker, isDiscussPending } from './discuss-marker.mjs';

export const GUARD_ID = 'discuss-unresolved';

const DISCUSS_TOKEN = '{discuss}';
const MAX_CONTEXT_LINES = 4;

// Collect up to MAX_CONTEXT_LINES body lines that contain the token, trimmed,
// so the refusal tells the operator WHAT the author wants discussed.
function collectContext(body) {
  const hits = [];
  for (const line of String(body).split('\n')) {
    if (line.includes(DISCUSS_TOKEN)) {
      const trimmed = line.trim();
      if (trimmed) hits.push(trimmed);
      if (hits.length >= MAX_CONTEXT_LINES) break;
    }
  }
  return hits;
}

export const discussBlockGuard = {
  id: GUARD_ID,
  async run(ctx) {
    if (!ctx) return { ok: true };
    const body = typeof ctx.body === 'string' ? ctx.body : '';
    if (!isDiscussPending(body)) return { ok: true };

    const context = collectContext(body);
    // When the visible token has already converged to the hidden request marker
    // there are no token lines to quote; fall back to a marker-present note.
    const contextLines = context.length
      ? context.map((l) => `    > ${l}`).join('\n')
      : hasDiscussMarker(body)
        ? '    > (token present in body)'
        : '    > (aitm-discuss-requested marker present — discussion not yet completed)';
    const reason =
      'unresolved {discuss} directive — the author asked for a human discussion before this ' +
      'story is driven forward. Full-auto cannot bypass this. Discuss it, then run ' +
      '`/task ensureChecked "discussion complete"` to strip the token and resume promotion.\n' +
      contextLines;
    return {
      ok: false,
      reason,
      blockers: [reason],
    };
  },
};
