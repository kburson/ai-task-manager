#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked only by the Claude Code hook runner, never by a human or
// the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
//
// PreToolUse hook — enforces read/write path scoping on Bash commands.
//
// Write permissions: project root only (scratch lives under `./.tmp/`, which is
//                    inside the project root, with purpose subfolders
//                    `gh/`, `plan/`, `heal/`, `inspect/`). System `/tmp` and
//                    `/private/tmp` are NOT writable — use `./.tmp/<sub>/`
//                    instead. All other destinations → block.
// Read permissions:  project root + ~/.claude/ + system binaries.
//                    All other sources → block.
// ~/.claude/ writes: always blocked (read-only for the task manager).
//
// Detects write targets via output redirections (>/>>), tee, and common
// write-oriented commands. Everything else is treated as a read.
//
// `/tmp` contract (issue #199): system `/tmp` and `/private/tmp` are out of
// scope for both reads and writes. The canonical scratch directory is
// project-local `./.tmp/` (see CLAUDE.md "Tool Usage Rules"). This matches the
// activity-guard `.tmp/**` carve-out.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { evaluateGhEdit, evaluateGhCreate, evaluateGhApiCreate } from './lib/gh-edit-guard.mjs';
import { evaluateAitmPath } from './lib/aitm-path-guard.mjs';
import { GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';

let input = {};
try {
  input = JSON.parse(readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0); // malformed payload — don't block
}

const command = input?.tool_input?.command ?? '';
if (!command) process.exit(0);

// Resolve project root; fall back to cwd when not in a git repo.
let projectRoot;
try {
  projectRoot = execSync('git rev-parse --show-toplevel', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_TIMEOUT_MS,
  }).trim();
} catch {
  projectRoot = process.cwd();
}

const homeDir = homedir();
const claudeDir = join(homeDir, '.claude');

// Unconditionally dangerous patterns — block regardless of path.
const ALWAYS_BLOCK = [
  { pattern: 'rm -rf /', label: 'recursive delete from root' },
  { pattern: 'sudo ', label: 'sudo elevation' },
  { pattern: '> /dev/', label: 'device write' },
  { pattern: 'mkfs', label: 'filesystem format' },
  { pattern: 'dd if=', label: 'raw disk write (dd)' },
];

for (const { pattern, label } of ALWAYS_BLOCK) {
  if (command.includes(pattern)) {
    block(`Command contains dangerous pattern (${label}): ${pattern}`);
  }
}

// Write-allowed prefixes — project root only. `./.tmp/` lives inside the
// project root and is the canonical scratch directory. System `/tmp` and
// `/private/tmp` are deliberately excluded.
const WRITE_ALLOWED = [projectRoot + '/'];

// Read-allowed prefixes — project root, temp, ~/.claude, and system paths.
const READ_ALLOWED = [
  ...WRITE_ALLOWED,
  claudeDir + '/',
  '/usr/',
  '/opt/',
  '/bin/',
  '/sbin/',
  '/etc/',
  '/private/etc/',
  '/Library/Developer/',
  '/Applications/',
];

// Replace single- and double-quoted regions with same-length spaces so the
// extraction regexes below don't pick up shell metachars or path-like
// substrings appearing inside argument strings (e.g. `/task` mentioned
// inside a /task ensureChecked label). ALWAYS_BLOCK patterns above still see the
// raw command — quote stripping only affects path scanning.
function stripQuotedRegions(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "'" || c === '"') {
      const q = c;
      out += ' ';
      i += 1;
      while (i < s.length && s[i] !== q) {
        out += ' ';
        i += 1;
      }
      if (i < s.length) {
        out += ' ';
        i += 1;
      }
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}
const scanned = stripQuotedRegions(command);

// Direct invocation of move-state.{mjs,sh} is reserved for internal callers
// (promote/demote/reconcile). Checked against the quote-stripped `scanned`
// (mirroring the gh-issue guards below) so that a mere *mention* of the
// filename inside a quoted argument — an `ac-stamp` AC label, a `git commit`
// message — is not refused; only an actual unquoted invocation
// (`node …/move-state.mjs`, `bash …/move-state.sh`, `./…/move-state.mjs`, or a
// bare `…/move-state.mjs` as the command itself) trips it. As with those
// guards, an invocation hidden inside a single-quoted `sh -c '…'` is
// intentionally not caught (consistent quote-stripping blind spot; see #542).
// Internal callers spawn via execFile/spawn, not Bash, so they bypass this
// hook entirely.
//
// #675 AC5 — a bare `\bmove-state\.(mjs|sh)\b` substring match fires on any
// unquoted MENTION of the filename anywhere in the command (e.g. an unquoted
// `grep -rn move-state.mjs scripts/` search, or prose in an `echo`), not just
// on genuine invocations. Tightened to require command position: the match
// must be the first token of a command segment (segments split on `&&`,
// `||`, `;`, `&`, `|`, newline, and `$(`), optionally preceded by `node ` or
// `bash `, and optionally prefixed with `./`.
const MOVE_STATE_INVOCATION_RE = /^(?:node\s+|bash\s+)?(?:\.\/)?\S*move-state\.(mjs|sh)\b/;
const moveStateSegments = scanned.split(/&&|\|\||[;&|\n]|\$\(/);
if (moveStateSegments.some((seg) => MOVE_STATE_INVOCATION_RE.test(seg.trim()))) {
  block(
    'Direct invocation of move-state is reserved for internal use.\n' +
      '  Use `/task promote` (forward), `/task demote` (back to development), or `/task reconcile` (drift recovery).'
  );
}

// gh issue mutation guards — checked against quote-stripped command so that
// grep patterns containing "gh issue create" etc. don't trigger false positives.
// Direct `gh issue create` bypasses the create-issue.mjs wrapper (project
// tether, assignee/priority gates, template enforcement). Always use the wrapper.
if (/\bgh\s+issue\s+create\b/.test(scanned)) {
  block(
    'Direct `gh issue create` is forbidden.\n' +
      '  Use `scripts/gh/create-issue.mjs --shape <epic|sub-issue|solo>` — it enforces project tether, assignee/priority gates, and template structure.'
  );
}

// #659 AC1 — `gh api` issue creation bypasses the `gh issue create` guard.
// Refuse a REST POST to `repos/<owner>/<repo>/issues` and a GraphQL
// `createIssue` mutation, routing to create-issue.mjs (same message as the
// subcommand guard above). Checked against the RAW command — the GraphQL
// mutation body and field flags live inside quotes, which `scanned` strips.
// GETs (`gh api repos/.../issues` with no fields), `.../issues/<n>` edits, and
// unrelated `gh api` calls pass. (gh's own internal create-issue.mjs spawns via
// execFile, not Bash, so it never reaches this hook.)
const ghApiCreateResult = evaluateGhApiCreate({ command });
if (ghApiCreateResult.block) block(ghApiCreateResult.reason);

// Direct `gh issue close` bypasses the timing flush and DoD gate enforced by
// `/task close`. Direct `gh issue reopen` similarly skips state reconciliation.
if (/\bgh\s+issue\s+close\b/.test(scanned)) {
  block(
    'Direct `gh issue close` is forbidden.\n' +
      '  Use `/task close` — it validates the DoD, flushes timing, and moves the issue to Done atomically.'
  );
}

// #487 — refuse direct `node node_modules/ai-task-manager/scripts/...`
// invocations of commands the `aitm` orchestrator already exposes, steering to
// `npx aitm <name>`. Checked against the quote-stripped command so path-like
// substrings inside quoted argument strings (grep patterns, descriptions) are
// not flagged. Hook-runner wiring and internal-only scripts pass through.
const aitmPathResult = evaluateAitmPath({ command: scanned });
if (aitmPathResult.block) block(aitmPathResult.reason);

// --- Extract write targets ---

const writePaths = new Set();

// Output redirections: > /path or >> /path (not >&, 2>, etc.)
// Lookbehind avoids matching >& or 2>
const redirectRe = /(?<![0-9&])>>?\s*(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of scanned.matchAll(redirectRe)) writePaths.add(p);

// tee [-a] /path
const teeRe = /\btee\s+(?:-a\s+)?(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of scanned.matchAll(teeRe)) writePaths.add(p);

// touch, mkdir, rmdir, rm — first absolute path argument is the target
const writeCommandRe = /\b(?:touch|mkdir|rmdir|rm)\s+(?:-[^\s]+\s+)*(\/[a-zA-Z0-9._~/-]+)/g;
for (const [, p] of scanned.matchAll(writeCommandRe)) writePaths.add(p);

// --- Extract all absolute paths ---
// Lookbehind ensures we match only boundary-anchored paths, not mid-segment slashes
// inside relative paths like node_modules/pkg/sub.
const absPathRe = /(?<=^|[\s='"(`])\/[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*/gm;
const allPaths = new Set(scanned.match(absPathRe) ?? []);

// --- Validate write targets ---
for (const p of writePaths) {
  if (!WRITE_ALLOWED.some((prefix) => p.startsWith(prefix))) {
    block(
      `Write operation to path outside allowed scope: ${p}\n  (writes permitted only inside the project root; use \`./.tmp/\` for scratch — \`./.tmp/gh/\` for issue bodies, \`./.tmp/plan/\` for create-issue fragments; system \`/tmp\` and \`/private/tmp\` are not allowed)`
    );
  }
  // Explicit check: ~/.claude writes are blocked even if path somehow matched
  if (p.startsWith(claudeDir + '/') || p === claudeDir) {
    block(`Write operation to ~/.claude/ is not permitted: ${p}`);
  }
}

// --- Validate read/exec paths (everything not identified as a write target) ---
for (const p of allPaths) {
  if (writePaths.has(p)) continue; // already validated above
  if (!READ_ALLOWED.some((prefix) => p.startsWith(prefix))) {
    block(
      `Access to path outside allowed scope: ${p}\n  (reads permitted in project root, ~/.claude/, and system binaries; system \`/tmp\` is not in scope — use \`./.tmp/\` for scratch)`
    );
  }
}

// --- gh issue edit body protection ---
// #361 hard refusal: any `gh issue edit --body` / `--body-file` from Bash is
// forbidden (route body writes through `mutateIssueBody`). Label/title/
// assignee edits, carrying no body, pass through. (#566 removed the former
// diff-based path — it was unreachable behind the hard refusal — so the guard
// no longer needs the live body or the bound issue's state.)
const ghEditResult = evaluateGhEdit({ command });
if (ghEditResult.block) block(ghEditResult.reason);

// --- gh issue create body protection ---
// Mirrors the edit guard for create: refuses bodies that contain deprecated
// visible-checkbox lines at creation time.
const ghCreateResult = evaluateGhCreate({
  command,
  readBodyFile: (p) => readFileSync(p, 'utf8'),
});
if (ghCreateResult.block) block(ghCreateResult.reason);

// All checks passed.
process.exit(0);

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
