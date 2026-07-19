// @story #886
// Epic AC evidence by commit citation (#886, parent epic #883).
//
// A container epic's Acceptance Criteria are delegations: "child #872 delivered
// X". There is nothing to *run* for such an AC, so before this the only honest
// option was to tag every one `invalid — non-demonstrable` — which leaves the
// epic with no independent acceptance at all, the exact shape in which
// integration bugs hide. Epic design decision 2 (settled 2026-07-18) says an
// epic AC is satisfied by the child commits that delivered it.
//
// The citation rides the existing `aitm-verified` marker as a `commits="…"`
// attribute alongside `cmd` / `vc-list`, so `parseProofMarker` already parses it
// and `stripMarkers` already hides it from the visible label:
//
//   - [ ] Child #872 landed X <!-- aitm-verified commits="d9d614f d645e3d" -->
//
// Shas, not `#N` child ids: an AC delegates to a *deliverable*, and #884 made
// "which commit, reachable from the epic HEAD" the answerable question. Citing
// `#N` would only restate the AC<->child bijection that #889 checks.
//
// IMPORTANT — a citation proves the work HAPPENED, not that it WORKS. What
// backstops it is the aggregate `npm run test:all` / `npm run lint` /
// `npm run format:check` run over the merged union at the epic branch. The two
// are sound together and unsound separately. Nothing here reads or relaxes the
// Definition of Done, and nothing here is a reason to.

import { parseIssueIds } from './commit-attribution-format.mjs';
import { parseProofMarker } from './proof-marker.mjs';

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

// Parse a checkbox line's `commits="…"` citation. Returns the cited shas, or
// null when the line carries no citation (so callers fall through to the
// command-declaration path unchanged). A `commits` attribute containing no
// well-formed sha returns null rather than an empty array: an unparseable
// value is not a citation, and treating it as one would silently satisfy the
// demonstrable gate with nothing behind it.
export function parseAcCommitCitation(text) {
  const props = parseProofMarker(String(text || ''));
  if (!props || typeof props.commits !== 'string') return null;
  const shas = props.commits
    .trim()
    .split(/\s+/)
    .filter((t) => SHA_RE.test(t));
  return shas.length ? shas : null;
}

// Every citation-bearing AC in the body's `## Acceptance Criteria` section, in
// body order. Section location mirrors `body-invariants.mjs` deliberately —
// same heading grammar, same `###`-terminates-the-section trap.
export function findAcCommitCitations(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const out = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    const shas = parseAcCommitCitation(box[4]);
    if (!shas) continue;
    out.push({
      lineIndex: i,
      label: String(box[4])
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      shas,
    });
  }
  return out;
}

function childNumbers(children) {
  const out = new Set();
  for (const child of children || []) {
    const raw = child && typeof child === 'object' ? (child.number ?? child.issue) : child;
    const n = Number(String(raw ?? '').replace(/^#/, ''));
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return out;
}

// Verify every citation in the body against the epic HEAD's commits.
//
// Two distinct refusals:
//   - unresolvable — the cited sha matches no commit in `commits`. Note the
//     scoping consequence, which is deliberate: `commits` is the HEAD-scoped log
//     (`epicTrailLogArgs`), so a sha that exists in the repo but is unreachable
//     from the epic HEAD IS unresolvable for this epic. That is the same
//     stricter question `epic-derived-commit-trail.mjs` asks — "is it in the
//     thing I am about to close?" — not #727's `--all` "does this work exist?".
//   - unattributed — the sha resolves, but its subject carries no `[#N]` token
//     for any child of this epic. Citing an unrelated commit is not evidence.
//
// Returns an array of refusal strings (empty means clean) and collects EVERY
// offender rather than stopping at the first, matching
// `UnreachableChildrenError`'s one-pass-fix behaviour.
export function verifyAcCommitCitations({ epicNumber, children = [], commits = [], body } = {}) {
  const citations = findAcCommitCitations(body);
  if (!citations.length) return [];

  const byPrefix = commits.map((c) => ({
    sha: String(c.sha || ''),
    ids: parseIssueIds(c.subject || '').map(Number),
  }));
  const childSet = childNumbers(children);
  const reasons = [];

  for (const citation of citations) {
    for (const sha of citation.shas) {
      // Abbreviated citations are legitimate, so match by prefix in either
      // direction — the log yields full shas, the body usually carries short.
      const hit = byPrefix.find((c) => c.sha.startsWith(sha) || sha.startsWith(c.sha));
      if (!hit) {
        reasons.push(
          `epic #${epicNumber}: AC "${citation.label}" cites commit ${sha}, which is not reachable from the epic HEAD`
        );
        continue;
      }
      const owning = hit.ids.filter((id) => childSet.has(id));
      if (owning.length === 0) {
        const carried = hit.ids.length ? hit.ids.map((id) => `#${id}`).join(', ') : 'no [#N] token';
        reasons.push(
          `epic #${epicNumber}: AC "${citation.label}" cites commit ${sha}, which is not attributable to any child of this epic (carries ${carried})`
        );
      }
    }
  }
  return reasons;
}
