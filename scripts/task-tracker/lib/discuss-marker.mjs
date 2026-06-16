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

// True iff a visible `{discuss}` token is present anywhere in the body.
export function hasDiscussMarker(body) {
  return String(body || '').includes(DISCUSS_TOKEN);
}

// Strip every visible `{discuss}` token and append an `aitm-discussed` audit
// marker iff one is not already present. Idempotent: a second call is a no-op.
export function markDiscussed(body, { ts } = {}) {
  const src = String(body || '');
  // Remove the bare token. Collapse a token left alone on its own line so we
  // don't leave a stray blank line behind.
  let next = src
    .split('\n')
    .map((line) => (line.trim() === DISCUSS_TOKEN ? null : line.split(DISCUSS_TOKEN).join('')))
    .filter((line) => line !== null)
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
