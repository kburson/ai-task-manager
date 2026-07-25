// #944 — sanctioned writer for the "no new tests — guarded by a pre-existing
// test" escape declaration.
//
// A code-kind bug fix whose entire deliverable greens an already-committed test
// authors no new `*.test.mjs` content, so the New-Automated-Tests auto-poster stays
// silent and the Agent Review V2 gate (`required-comments.mjs`) would object with no
// honest path forward. `hasNoNewTestsDeclaration` (issue-kind.mjs) reads the marker
// this module writes and skips the NAT required-comment for a valid, fail-closed
// declaration.
//
// The reader is the trust boundary (it enforces the non-empty `reason`); this writer
// refuses to author a marker without one, so a body can never carry an escape marker
// that the reader would reject as invalid. The write is routed through
// `mutateIssueBody` — never `gh issue edit --body` — so the live body is fetched in
// the same transaction as the write and every invariant marker is preserved.

import { mutateIssueBody } from './issue-body-mutate.mjs';
import { serializeMarker } from './marker-grammar.mjs';

// Strip form: also swallows a single trailing newline + leading inline whitespace so
// the idempotent upsert leaves no blank-line residue.
const NO_NEW_TESTS_STRIP_RE =
  /[ \t]*<!--\s*aitm-no-new-tests(?:\s+[a-zA-Z0-9_-]+="(?:[^"]|&quot;)*")*\s*-->\n?/gi;
const PROGRESS_MARKERS_HEADING_RE = /^##[ \t]+AITM Progress Markers[ \t]*$(?:\n)?/im;
const ROOT_HEADING_RE = /^##\s+/m;

function splitProgressMarkers(body) {
  const source = String(body || '');
  const match = PROGRESS_MARKERS_HEADING_RE.exec(source);
  if (!match) return { found: false, source, before: source, heading: '', section: '', after: '' };
  const sectionStart = match.index + match[0].length;
  const rest = source.slice(sectionStart);
  const nextHeading = rest.search(ROOT_HEADING_RE);
  const sectionEnd = nextHeading === -1 ? source.length : sectionStart + nextHeading;
  return {
    found: true,
    source,
    before: source.slice(0, match.index),
    heading: match[0],
    section: source.slice(sectionStart, sectionEnd),
    after: source.slice(sectionEnd),
  };
}

function replaceProgressMarkersSection(body, mutateSection) {
  const split = splitProgressMarkers(body);
  if (split.found) {
    return `${split.before}${split.heading}\n${mutateSection(split.section)}${split.after}`;
  }
  const source = String(body || '').replace(/\s*$/, '');
  return `${source}\n\n## AITM Progress Markers\n\n${mutateSection('')}`;
}

function trimSectionStart(section) {
  return String(section || '').replace(/^\s+/, '');
}

/**
 * Pure, idempotent upsert of the escape marker into a body string.
 *
 * Placement mirrors `setIssueKindMarker`: under `## AITM Progress Markers` when that
 * block exists, else appended at the end. Any pre-existing escape marker is replaced,
 * so repeated calls converge. Throws when `reason` is empty — the writer never
 * authors a marker the reader would reject.
 */
export function upsertNoNewTestsMarker(body, { reason, guardedBy } = {}) {
  const r = String(reason == null ? '' : reason).trim();
  if (!r) {
    throw new Error('upsertNoNewTestsMarker: reason must be a non-empty string');
  }
  const props = { reason: r };
  const g = String(guardedBy == null ? '' : guardedBy).trim();
  if (g) props['guarded-by'] = g;
  const marker = serializeMarker('no-new-tests', props);
  return replaceProgressMarkersSection(
    body,
    (section) => `${marker}\n${trimSectionStart(section.replace(NO_NEW_TESTS_STRIP_RE, ''))}`
  );
}

/**
 * Stamp the escape declaration onto a live issue, routed through `mutateIssueBody`.
 * `deps.mutateIssueBody` is injectable for tests.
 */
export async function declareNoNewTests({ issueNumber, repo, reason, guardedBy, deps = {} } = {}) {
  if (issueNumber == null) throw new Error('declareNoNewTests: issueNumber is required');
  if (!repo) throw new Error('declareNoNewTests: repo is required');
  const mutate = deps.mutateIssueBody || mutateIssueBody;
  return mutate({
    issueNumber,
    repo,
    mutate: (base) => upsertNoNewTestsMarker(base, { reason, guardedBy }),
  });
}
