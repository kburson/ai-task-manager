#!/usr/bin/env node
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

import { evaluateGhEdit, evaluateGhCreate } from './lib/gh-edit-guard.mjs';
import { GH_API_TIMEOUT_MS, GIT_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { readBoundState } from './lib/bound-state.mjs';

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

// Direct invocation of move-state.{mjs,sh} is reserved for internal callers
// (promote/demote/reconcile). Agent-context Bash always runs through this hook,
// so the block applies to every spawn from a Claude session. Internal callers
// set AITM_INTERNAL=1 in env (not the command string), so this regex won't see
// it — they bypass the hook by being spawned with execFile/spawn, not Bash.
if (/\bmove-state\.(mjs|sh)\b/.test(command)) {
  block(
    'Direct invocation of move-state is reserved for internal use.\n' +
      '  Use `/task promote` (forward), `/task demote` (back to development), or `/task reconcile` (drift recovery).'
  );
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
// inside a /task check label). ALWAYS_BLOCK patterns above still see the
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

// Direct `gh issue close` bypasses the timing flush and DoD gate enforced by
// `/task close`. Direct `gh issue reopen` similarly skips state reconciliation.
if (/\bgh\s+issue\s+close\b/.test(scanned)) {
  block(
    'Direct `gh issue close` is forbidden.\n' +
      '  Use `/task close` — it validates the DoD, flushes timing, and moves the issue to Done atomically.'
  );
}

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
// Refuses writes that would reintroduce deprecated visible-checkbox lines or
// drop hidden verb-completion markers. Diff-based: safe wholesale rewrites of
// bodies that never had the legacy lines or markers pass through.
// Resolve the bound issue's kanban state once for any per-state gates
// inside evaluateGhEdit (e.g. #281 Refine deep-dive gate). The callback only
// reports state when the target issue IS the currently-bound issue — guarding
// an unbound issue's body against a state we don't know would be guessing.
const bound = readBoundState(projectRoot);
const boundIssueNum = bound.activeIssue
  ? Number(String(bound.activeIssue).replace(/^#/, ''))
  : null;

const ghEditResult = evaluateGhEdit({
  command,
  readBodyFile: (p) => readFileSync(p, 'utf8'),
  fetchCurrentBody: (n) =>
    execSync(`gh issue view ${Number(n)} --json body --jq .body`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: GH_API_TIMEOUT_MS,
    }),
  resolveCurrentState: (n) => (Number(n) === boundIssueNum ? bound.state : undefined),
});
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
