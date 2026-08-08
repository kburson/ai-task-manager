// Derived epic commit trail (#884, parent epic #883).
//
// A container epic has no commit of its own by construction, so it can never
// satisfy a check that demands its own `### 🔗 Commits` trail. Its trail is
// DERIVED: the union of its children's `[#N]`-attributed commits, grouped per
// child.
//
// The rendered artifact is a trail the UNMODIFIED existing reader accepts —
// `parseMarker` for identity, `hasCanonicalCommitTrace` for membership. Both
// read only the hidden marker and never walk the table, so the per-child
// grouping rows are invisible to them by construction.
//
// Reachability: this module deliberately departs from #727/#733. Attribution
// there is message-based across `--all` so an unmerged deliverable still
// attributes. The epic trail asks the stricter question — not "does this work
// exist?" but "is it in the thing I am about to close?" — so callers must feed
// it a log scoped to `<epic-head>`, NOT `--all`. See `epicTrailLogArgs`.

import { parseIssueIds } from './commit-attribution-format.mjs';
import { TRAIL_HEADING, buildLedgerCaveat, buildRow } from './commit-trail.mjs';
import { serializeMarker } from './marker-grammar.mjs';

// Field separator for the log format. Chosen because it cannot appear in a
// sha, an author name, an ISO timestamp, or a commit subject line.
const FIELD_SEP = '\x1f';

// #1177 — read compatibility for delivered history created before the
// canonical leading-token convention was enforced. This grammar is deliberately
// local to epic derivation: writers and general attribution readers remain
// leading-only. A canonical leading run always wins; otherwise exactly one
// terminal token may provide the historical identity.
const HISTORICAL_TRAILING_ISSUE_RE = /\s\[#(\d+)\]\s*$/;
const ANY_ISSUE_TOKEN_RE = /\[#\d+\]/;

export function parseEpicTrailIssueIds(subject) {
  const source = String(subject ?? '');
  const canonical = parseIssueIds(source);
  if (canonical.length > 0) return canonical;

  const historical = HISTORICAL_TRAILING_ISSUE_RE.exec(source);
  if (!historical) return [];
  if (ANY_ISSUE_TOKEN_RE.test(source.slice(0, historical.index))) return [];

  const issue = Number(historical[1]);
  return Number.isInteger(issue) && issue > 0 ? [issue] : [];
}

// The log invocation the caller must use. Scoped to the epic HEAD ref — NOT
// `--all` — because the trail records what is reachable from the thing being
// closed. `defaultHasAttributingCommit`'s `--all` search answers a different
// question and would silently admit unmerged sibling-branch commits.
export const EPIC_TRAIL_LOG_FORMAT = ['%H', '%s', '%an', '%aI'].join(FIELD_SEP);

export function epicTrailLogArgs(epicHead) {
  return ['log', String(epicHead), `--format=${EPIC_TRAIL_LOG_FORMAT}`];
}

// Parse the stdout of the above invocation into commit records. Blank lines and
// malformed rows are skipped rather than throwing: a truncated log should
// surface as an unreachable-child refusal, not as a parse crash.
export function parseEpicTrailLog(stdout) {
  return String(stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject, author, ts] = line.split(FIELD_SEP);
      if (!sha || subject == null) return null;
      return { sha, subject, author: author || '', ts: ts || '' };
    })
    .filter(Boolean);
}

function childNumber(child) {
  const raw = child && typeof child === 'object' ? (child.number ?? child.issue) : child;
  const n = Number(String(raw ?? '').replace(/^#/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function childTitle(child) {
  return (child && typeof child === 'object' && child.title) || '';
}

// A closed NOT_PLANNED child has no retained delivery to prove reachable from
// the epic HEAD. The sibling mapper normalizes GitHub's terminal reason to this
// exact value; everything else (including absent or unfamiliar data) remains
// fail-closed and therefore still requires a commit.
function isNonDeliveryChild(child) {
  return (
    child &&
    typeof child === 'object' &&
    String(child.closeReason || '').toLowerCase() === 'not_planned'
  );
}

export function partitionChildrenByDeliveryRequirement(children = []) {
  const deliveryRequired = [];
  const excluded = [];
  for (const child of children || []) {
    (isNonDeliveryChild(child) ? excluded : deliveryRequired).push(child);
  }
  return { deliveryRequired, excluded };
}

export class UnreachableChildrenError extends Error {
  constructor(epicNumber, children) {
    const names = children.map((c) => `#${c.number}${c.title ? ` (${c.title})` : ''}`);
    super(
      `epic #${epicNumber}: no [#N] commit reachable from the epic HEAD for ${names.length} child(ren): ${names.join(', ')}`
    );
    this.name = 'UnreachableChildrenError';
    this.epicNumber = epicNumber;
    this.unreachable = children;
  }
}

// Group the epic HEAD's commits by the child they attribute to. A commit
// carrying several `[#N]` tokens is attributed to each matching child.
export function groupCommitsByChild({ children = [], commits = [] } = {}) {
  const groups = new Map();
  for (const child of children) {
    const n = childNumber(child);
    if (n == null) continue;
    groups.set(n, { number: n, title: childTitle(child), commits: [] });
  }
  for (const commit of commits) {
    for (const id of parseEpicTrailIssueIds(commit.subject)) {
      const group = groups.get(Number(id));
      if (group) group.commits.push(commit);
    }
  }
  return Array.from(groups.values());
}

// Build the derived trail body. Throws `UnreachableChildrenError` naming EVERY
// child with no reachable commit — collecting all of them rather than throwing
// on the first, so an operator with six children fixes in one pass instead of
// bisecting by hand.
export function buildEpicDerivedTrail({ epicNumber, children = [], commits = [] } = {}) {
  if (!epicNumber) throw new Error('buildEpicDerivedTrail: epicNumber is required');

  const { deliveryRequired, excluded } = partitionChildrenByDeliveryRequirement(children);
  const groups = groupCommitsByChild({ children: deliveryRequired, commits });
  const unreachable = groups.filter((g) => g.commits.length === 0);
  if (unreachable.length > 0) throw new UnreachableChildrenError(epicNumber, unreachable);

  const shas = [];
  const rows = [];
  for (const group of groups) {
    rows.push(`| **#${group.number}${group.title ? ` — ${group.title}` : ''}** | | | |`);
    for (const commit of group.commits) {
      shas.push(commit.sha);
      rows.push(buildRow(commit));
    }
  }

  return [
    TRAIL_HEADING,
    '',
    buildLedgerCaveat(epicNumber),
    '',
    `<!-- aitm-epic-derived-trail children="${groups.map((g) => g.number).join(',')}" excluded="${excluded
      .map((child) => childNumber(child))
      .filter(Boolean)
      .join(',')}" -->`,
    '',
    serializeMarker('commits', { shas: shas.join(',') }),
    '',
    '| SHA | Subject | Author | When |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n');
}
