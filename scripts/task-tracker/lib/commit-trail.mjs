// Pure helpers for the per-commit comment trail.
//
// Manages a single "### 🔗 Commits" comment per bound issue. A hidden marker
// <!-- aitm-commits shas="SHA1,SHA2,..." --> tracks SHAs already recorded so
// that hook re-fires are idempotent.
//
// Marker grammar (#381, parent epic #367): the writer emits the consolidated
// `shas="..."` property form via `serializeMarker`. The reader is tolerant of
// BOTH the legacy bare-CSV colon form (`aitm-commits: SHA1,SHA2`) and the new
// quoted-attribute form; the legacy branch stays until the #369 corpus sweep
// reports zero residual legacy markers.

import { serializeMarker, unescapeValue } from './marker-grammar.mjs';
import { detectCommitCommands } from './bash-effect-classifier.mjs';

export const TRAIL_HEADING = '### 🔗 Commits';

// Hidden idempotency sentinel for the informational-ledger caveat (#732). Its
// presence anywhere in a trail body means the caveat has already been injected.
export const LEDGER_CAVEAT_MARKER = '<!-- aitm-ledger-caveat -->';

// #732 — the trail is an INFORMATIONAL point-in-time ledger, not a reachability
// contract. Every trail carries this caveat: the recorded SHA is what was
// observed at commit time and MAY change during history maintenance
// (rebase / squash / amend), and the durable way to locate the issue's commits
// is message attribution — `git log --all --grep='[#N]'` (the token minted by
// #730). `issueNumber` accepts `732`, `'732'` or `'#732'`.
export function buildLedgerCaveat(issueNumber) {
  const id = String(issueNumber ?? '')
    .trim()
    .replace(/^#/, '');
  return [
    LEDGER_CAVEAT_MARKER,
    '> **Informational ledger — not a reachability contract.**',
    '> Each SHA below is the value observed at commit time and may change during history maintenance (rebase / squash / amend).',
    '> A rewritten or orphaned SHA is tolerated here, never pruned.',
    `> To locate this issue's commits regardless of SHA churn, use message attribution: \`git log --all --grep='[#${id}]'\`.`,
  ].join('\n');
}

// Idempotently inject the ledger caveat just after the trail heading. Returns
// the body unchanged when no issue number is supplied or the caveat is already
// present (detected via LEDGER_CAVEAT_MARKER). Never touches recorded SHAs.
export function ensureLedgerCaveat(body, issueNumber) {
  if (issueNumber == null) return body;
  const src = String(body ?? '');
  if (src.includes(LEDGER_CAVEAT_MARKER)) return src;
  const lines = src.split('\n');
  const hIdx = lines.findIndex((l) => l.startsWith(TRAIL_HEADING));
  if (hIdx === -1) return src;
  lines.splice(hIdx + 1, 0, '', buildLedgerCaveat(issueNumber));
  return lines.join('\n');
}

// Legacy bare-CSV colon form. `[^-]*?` is lazy and SHAs are hex (no hyphen),
// so it captures the whole comma list up to the closing `-->`.
const MARKER_LEGACY_RE = /<!--\s*aitm-commits:\s*([^-]*?)\s*-->/;
// New consolidated property form emitted by `serializeMarker('commits', …)`.
const MARKER_NEW_RE = /<!--\s*aitm-commits\s+shas="((?:[^"]|&quot;)*)"\s*-->/;
// Presence/union pattern (exported for back-compat). Matches either grammar.
export const MARKER_RE = /<!--\s*aitm-commits(?::\s*[^-]*?|\s+shas="(?:[^"]|&quot;)*")\s*-->/;

// Serialize a SHA list (array or Set) into the new property-form marker.
function renderCommitsMarker(shas) {
  return serializeMarker('commits', { shas: Array.from(shas).join(',') });
}

const TABLE_HEADER_4 = ['| SHA | Subject | Author | When |', '|---|---|---|---|'].join('\n');

const TABLE_HEADER_6 = [
  '| SHA | Subject | Author | When | Branch | Worktree |',
  '|---|---|---|---|---|---|',
].join('\n');

export function parseMarker(body) {
  if (!body) return { shas: new Set(), index: -1, raw: '' };
  // Prefer the new quoted-attribute form; fall back to the legacy colon CSV.
  let m = body.match(MARKER_NEW_RE);
  let csv;
  if (m) {
    csv = unescapeValue(m[1]);
  } else {
    m = body.match(MARKER_LEGACY_RE);
    if (!m) return { shas: new Set(), index: -1, raw: '' };
    csv = m[1];
  }
  const list = csv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { shas: new Set(list), index: m.index, raw: m[0] };
}

export function hasWorktreeCols(body) {
  if (!body) return false;
  return body.includes('| SHA | Subject | Author | When | Branch | Worktree |');
}

export function buildInitialTrail({ worktreeCols = false, issueNumber } = {}) {
  const header = worktreeCols ? TABLE_HEADER_6 : TABLE_HEADER_4;
  const parts = [TRAIL_HEADING, ''];
  // #732 — embed the informational-ledger caveat when the issue is known.
  if (issueNumber != null) parts.push(buildLedgerCaveat(issueNumber), '');
  parts.push(renderCommitsMarker([]), '', header);
  return parts.join('\n');
}

// Short SHA used in the visible table column. The marker keeps the full SHA
// (parseable identity, lookup-friendly); the table column trims to keep rows
// scannable. 6 chars matches `git log --abbrev=6` and remains unique in any
// real-world repo. (#155)
function shortSha(sha) {
  return String(sha).slice(0, 6);
}

function escapePipe(s) {
  return String(s == null ? '' : s)
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function buildRow(
  { sha, subject, author, ts, branch, worktree, commitUrl },
  { worktreeCols = false } = {}
) {
  const shaCell = commitUrl
    ? `[\`${shortSha(sha)}\`](${escapePipe(commitUrl)})`
    : `\`${shortSha(sha)}\``;
  const cols = [shaCell, escapePipe(subject), escapePipe(author), escapePipe(ts)];
  if (worktreeCols) {
    cols.push(escapePipe(branch || '-'));
    cols.push(escapePipe(worktree || '-'));
  }
  return `| ${cols.join(' | ')} |`;
}

export function hasCanonicalCommitTrace(body, sha) {
  const src = String(body || '');
  if (!src.startsWith(TRAIL_HEADING)) return false;
  const parsed = parseMarker(src);
  return parsed.index !== -1 && parsed.shas.has(String(sha));
}

export function appendCommitRow(body, row) {
  const lines = body.split('\n');
  let lastTableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (
      l.startsWith('| `') ||
      (l.startsWith('| ') && !l.startsWith('| SHA') && !l.startsWith('|---'))
    ) {
      lastTableIdx = i;
    }
  }
  if (lastTableIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|---')) {
        lastTableIdx = i;
        break;
      }
    }
  }
  if (lastTableIdx === -1) {
    // No table at all — append one.
    lines.push('', TABLE_HEADER_4, row);
  } else {
    lines.splice(lastTableIdx + 1, 0, row);
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}

// Ledger reconciliation (#732). The commit trail is an INFORMATIONAL
// point-in-time ledger, not a reachability contract. This function's historical
// job was the inverse: it DROPPED any recorded SHA that was no longer reachable
// from HEAD (`git merge-base --is-ancestor`). That deadlocked gates whenever a
// rebase/squash/amend rewrote or orphaned a SHA — the very commit the work lived
// in would vanish from the trail. The inversion: a recorded SHA is now TOLERATED
// regardless of reachability. Gate assertion has moved to message-based
// attribution (#731 `hasAttributingCommit`, wired into gates by #733), so the
// trail no longer needs to be the thing gates assert against.
//
// Reconciliation therefore never removes rows. Its only mutation is to ensure
// the informational caveat is present (back-filling legacy trails), so callers
// keep a single reconcile seam. Reachability, if a caller cares, is now advisory
// annotation only (see `defaultIsReachable` / #731 `annotateReachable`) — never a
// precondition for a SHA to remain in the ledger.
export async function reconcileLedger(body, { issueNumber } = {}) {
  return ensureLedgerCaveat(body, issueNumber);
}

// Deprecated alias (#732). Retained so existing call sites and any external
// callers keep compiling through the ledger inversion. The `existsSha` predicate
// is intentionally IGNORED: no SHA is ever dropped. Prefer `reconcileLedger`.
export async function pruneUnreachable(body, { issueNumber } = {}) {
  return reconcileLedger(body, { issueNumber });
}

export function updateMarker(body, sha) {
  const parsed = parseMarker(body);
  if (parsed.shas.has(sha)) return body;
  parsed.shas.add(sha);
  const next = renderCommitsMarker(parsed.shas);
  if (parsed.index === -1) {
    // Insert marker just after the heading line.
    const lines = body.split('\n');
    const hIdx = lines.findIndex((l) => l.startsWith(TRAIL_HEADING));
    if (hIdx === -1) return `${next}\n${body}`;
    lines.splice(hIdx + 1, 0, '', next);
    return lines.join('\n');
  }
  return body.slice(0, parsed.index) + next + body.slice(parsed.index + parsed.raw.length);
}

// --- Command-string detection ---

// Returns { isCommit, isAmend } based on a bash command string.
// Shared with the PreToolUse authority classifier so wrapped/global/process-
// substitution commits cannot pass execution governance and then disappear
// from the PostToolUse trail.
export function detectGitCommit(cmd) {
  return detectCommitCommands(cmd);
}
