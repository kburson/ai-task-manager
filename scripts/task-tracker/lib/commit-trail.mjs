// Pure helpers for the per-commit comment trail.
//
// Manages a single "### 🔗 Commits" comment per bound issue. A hidden marker
// <!-- aitm-commits: SHA1,SHA2,... --> tracks SHAs already recorded so that
// hook re-fires are idempotent.

export const TRAIL_HEADING = '### 🔗 Commits';
export const MARKER_RE = /<!--\s*aitm-commits:\s*([^-]*?)\s*-->/;

const TABLE_HEADER_4 = [
  '| SHA | Subject | Author | When |',
  '|---|---|---|---|',
].join('\n');

const TABLE_HEADER_6 = [
  '| SHA | Subject | Author | When | Branch | Worktree |',
  '|---|---|---|---|---|---|',
].join('\n');

export function parseMarker(body) {
  if (!body) return { shas: new Set(), index: -1, raw: '' };
  const m = body.match(MARKER_RE);
  if (!m) return { shas: new Set(), index: -1, raw: '' };
  const list = m[1].split(',').map(s => s.trim()).filter(Boolean);
  return { shas: new Set(list), index: m.index, raw: m[0] };
}

export function hasWorktreeCols(body) {
  if (!body) return false;
  return body.includes('| SHA | Subject | Author | When | Branch | Worktree |');
}

export function buildInitialTrail({ worktreeCols = false } = {}) {
  const header = worktreeCols ? TABLE_HEADER_6 : TABLE_HEADER_4;
  return [TRAIL_HEADING, '', '<!-- aitm-commits:  -->', '', header].join('\n');
}

function shortSha(sha) {
  return String(sha).slice(0, 7);
}

function escapePipe(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export function buildRow({ sha, subject, author, ts, branch, worktree }, { worktreeCols = false } = {}) {
  const cols = [
    `\`${shortSha(sha)}\``,
    escapePipe(subject),
    escapePipe(author),
    escapePipe(ts),
  ];
  if (worktreeCols) {
    cols.push(escapePipe(branch || '-'));
    cols.push(escapePipe(worktree || '-'));
  }
  return `| ${cols.join(' | ')} |`;
}

export function appendCommitRow(body, row) {
  const lines = body.split('\n');
  let lastTableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('| `') || (l.startsWith('| ') && !l.startsWith('| SHA') && !l.startsWith('|---'))) {
      lastTableIdx = i;
    }
  }
  if (lastTableIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('|---')) { lastTableIdx = i; break; }
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

export function updateMarker(body, sha) {
  const parsed = parseMarker(body);
  if (parsed.shas.has(sha)) return body;
  parsed.shas.add(sha);
  const next = `<!-- aitm-commits: ${Array.from(parsed.shas).join(',')} -->`;
  if (parsed.index === -1) {
    // Insert marker just after the heading line.
    const lines = body.split('\n');
    const hIdx = lines.findIndex(l => l.startsWith(TRAIL_HEADING));
    if (hIdx === -1) return `${next}\n${body}`;
    lines.splice(hIdx + 1, 0, '', next);
    return lines.join('\n');
  }
  return body.slice(0, parsed.index) + next + body.slice(parsed.index + parsed.raw.length);
}

// --- Command-string detection ---

// Strip heredoc bodies so a `git commit` token inside heredoc content
// doesn't trigger a false positive.
function stripHeredocs(cmd) {
  return cmd.replace(/<<-?\s*'?([A-Za-z_][A-Za-z0-9_]*)'?[\s\S]*?\n\1\s*(?:\n|$)/g, ' ');
}

// Returns { isCommit, isAmend } based on a bash command string.
// Heuristic: split on `;` `&&` `||` `|`, then per-segment match
// `^\s*(VAR=val\s+)*git[\s\-]…\bcommit\b` — i.e., `git ... commit` with
// optional env-var prefix and optional `-c k=v` flags.
export function detectGitCommit(cmd) {
  if (!cmd || typeof cmd !== 'string') return { isCommit: false, isAmend: false };
  const stripped = stripHeredocs(cmd);
  const segments = stripped.split(/&&|\|\||;|\|/);
  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    // Allow leading env-var assignments and `cd path && ...` already handled by split.
    const m = trimmed.match(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*git\b(?:\s+-[cC]\s+\S+)*\s+(?:[a-z\-]+\s+)*commit\b/);
    if (!m) continue;
    const isAmend = /\s--amend\b/.test(trimmed);
    return { isCommit: true, isAmend };
  }
  return { isCommit: false, isAmend: false };
}
