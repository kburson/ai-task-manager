// `{discuss}` marker convention (#405).
//
// A user files a sparse GitHub issue whose body carries the visible token
// `{discuss}`. At pickup (bind, `verbSwitch`) AITM detects the token, surfaces a
// `DISCUSS REQUESTED` banner, and `rules/bind.md` directs the agent to run a
// brainstorming dialog BEFORE any deep-dive or refine step. Resolving the
// dialog rewrites the issue's Scope (and may seed preliminary ACs), strips the
// token, and stamps a hidden `<!-- aitm-discussed ts="…" -->` audit marker so
// the dialog does not re-fire on subsequent binds.
//
// Detection keys on the VISIBLE TOKEN only — the hidden `aitm-discussed` marker
// is audit / idempotency, never a detection input. Re-adding `{discuss}` after a
// prior discussion deliberately re-triggers the banner.
//
// `aitm-discussed` is NOT in the invariant-marker set (`body-invariants.mjs`),
// so stripping the token and adding the marker never trips `MarkerLossError`;
// `finalizeDiscussion` needs no `allowMarkerLoss`.

import { serializeMarker } from './marker-grammar.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';

const DISCUSS_TOKEN = '{discuss}';
const DISCUSSED_MARKER_RE = /^<!--\s*aitm-discussed(\s|-->)/;
// #486 — hidden, durable "pending discussion" carrier. Distinct from
// `aitm-discussed` (which records that the discussion is DONE): the two regexes
// are disjoint because `aitm-discuss-requested` continues with `-requested`
// where `aitm-discussed` continues with `ed`. Like `aitm-discussed`, this
// marker is deliberately NOT in `body-invariants.mjs`, so `convergeDiscuss` and
// `markDiscussed` may strip/stamp it freely without tripping `MarkerLossError`.
export const DISCUSS_REQUEST_MARKER = 'discuss-requested';
const DISCUSS_REQUEST_MARKER_RE = /^<!--\s*aitm-discuss-requested(\s|-->)/;

// True iff some line of the body is a *bare* `{discuss}` marker — a line whose
// trimmed content is exactly the token and nothing else. Detection is purely
// per-line (newline-delimited); there is no code-fence awareness. Inline prose,
// backticked spans, and prefixed/quoted forms (`- {discuss}`, `> {discuss}`,
// `key: {discuss}`) are deliberately NOT detected, so an issue that merely
// mentions the token in its text does not trip the discussion guard.
export function hasDiscussMarker(body) {
  return String(body || '')
    .split('\n')
    .some((line) => line.trim() === DISCUSS_TOKEN);
}

// True iff some line is a hidden `aitm-discuss-requested` marker (#486). This is
// the durable, invisible mirror of the "Discuss" project label.
export function hasDiscussRequest(body) {
  return String(body || '')
    .split('\n')
    .some((line) => DISCUSS_REQUEST_MARKER_RE.test(line.trim()));
}

// True iff the discussion has already been completed (an `aitm-discussed` audit
// marker is present). Used to short-circuit re-detection / re-convergence.
export function hasDiscussedMarker(body) {
  return String(body || '')
    .split('\n')
    .some((line) => DISCUSSED_MARKER_RE.test(line.trim()));
}

// #486 — the single detection predicate every touchpoint keys on. A discussion
// is PENDING when it has not yet been completed AND at least one entry signal is
// live: the visible `{discuss}` token OR the durable request marker. Surviving
// token-convergence (which strips the token but leaves the marker) is the whole
// point — the bind banner and `discussBlockGuard` both consult this so that
// stripping the visible token never silently disables the #473 blocking gate.
export function isDiscussPending(body) {
  if (hasDiscussedMarker(body)) return false;
  return hasDiscussMarker(body) || hasDiscussRequest(body);
}

// #486 — converge any entry affordance to the canonical resting state: hidden
// `aitm-discuss-requested` marker present, visible `{discuss}` token stripped.
// Pure and idempotent.
//   - Already discussed (`aitm-discussed` present) → returned unchanged, so a
//     completed issue never re-acquires a request marker.
//   - No token and no request marker → unchanged (nothing to converge).
//   - Otherwise → strip every bare token line AND every existing request marker,
//     then append exactly one fresh request marker. Strip-all-then-append-one
//     guarantees a single marker and a byte-stable fixed point on re-runs.
export function convergeDiscuss(body, { ts } = {}) {
  const src = String(body || '');
  if (hasDiscussedMarker(src)) return src;
  if (!hasDiscussMarker(src) && !hasDiscussRequest(src)) return src;
  const stripped = src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t === DISCUSS_TOKEN) return false;
      if (DISCUSS_REQUEST_MARKER_RE.test(t)) return false;
      return true;
    })
    .join('\n');
  const marker = serializeMarker(DISCUSS_REQUEST_MARKER, ts ? { ts } : {});
  return `${stripped.replace(/\s+$/, '')}\n\n${marker}`;
}

// Strip the bare line-alone `{discuss}` marker(s) AND any hidden
// `aitm-discuss-requested` request marker (#486), then append an
// `aitm-discussed` audit marker iff one is not already present. Only lines whose
// trimmed content equals exactly the token are removed (matching
// `hasDiscussMarker`); inline / prose / backticked mentions are left
// byte-for-byte intact. Idempotent: a second call is a no-op.
export function markDiscussed(body, { ts } = {}) {
  const src = String(body || '');
  // Drop only the line-alone token marker(s) and the durable request marker;
  // removing the whole line avoids leaving a stray blank line behind. Lines that
  // merely contain the token inline are preserved untouched.
  let next = src
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t === DISCUSS_TOKEN) return false;
      if (DISCUSS_REQUEST_MARKER_RE.test(t)) return false;
      return true;
    })
    .join('\n');

  const alreadyStamped = next.split('\n').some((l) => DISCUSSED_MARKER_RE.test(l.trim()));
  if (!alreadyStamped) {
    const marker = serializeMarker('discussed', ts ? { ts } : {});
    next = `${next.replace(/\s+$/, '')}\n\n${marker}`;
  }
  return next;
}

// Replace the body of a `## Scope` section with `scope`, preserving the heading
// and everything before/after the section. If no `## Scope` heading exists, a
// new section is appended before the first hidden trailing marker block.
function replaceScope(body, scope) {
  const lines = body.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+Scope\s*$/.test(l));
  const newScopeLines = ['## Scope', '', String(scope).replace(/\s+$/, '')];
  if (headingIdx === -1) {
    throw new Error('replaceScope: no `## Scope` heading found in body');
  }
  // Find the next H2 heading after Scope (section boundary), else end of body.
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const before = lines.slice(0, headingIdx);
  const after = lines.slice(endIdx);
  return [...before, ...newScopeLines, '', ...after].join('\n');
}

// Replace the body of a `## Acceptance Criteria` section with `- [ ]` lines
// derived from `acs`. No-op when `acs` is empty/absent. Throws if the section
// is missing (the brainstorming dialog seeds ACs into an existing section).
function replaceAcceptanceCriteria(body, acs) {
  if (!Array.isArray(acs) || acs.length === 0) return body;
  const lines = body.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+Acceptance Criteria\s*$/.test(l));
  if (headingIdx === -1) {
    throw new Error('replaceAcceptanceCriteria: no `## Acceptance Criteria` heading found');
  }
  let endIdx = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  const acLines = acs.map((a) => `- [ ] ${String(a).trim()}`);
  const before = lines.slice(0, headingIdx);
  const after = lines.slice(endIdx);
  return [...before, '## Acceptance Criteria', '', ...acLines, '', ...after].join('\n');
}

// Resolve a brainstorming discussion in a single `mutateIssueBody` transaction:
// rewrite `## Scope`, optionally rewrite `## Acceptance Criteria` from `acs`,
// then consume the `{discuss}` token and stamp the `aitm-discussed` marker.
export async function finalizeDiscussion({ issueNumber, repo, scope, acs, ts, deps } = {}) {
  if (!scope || !String(scope).trim()) {
    throw new Error('finalizeDiscussion: `scope` is required');
  }
  return mutateIssueBody({
    issueNumber,
    repo,
    deps,
    mutate: (base) => {
      let next = replaceScope(base, scope);
      next = replaceAcceptanceCriteria(next, acs);
      next = markDiscussed(next, { ts });
      return next;
    },
  });
}
