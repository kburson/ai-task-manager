#!/usr/bin/env node
// INTERNAL — DO NOT INVOKE DIRECTLY, and not exposed through `aitm`.
// Plumbing: invoked by the Claude Code and Codex hook runners, never by a human
// or the AI. See bin/aitm-registry.mjs (INTERNAL map) for the rationale.
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
// write-oriented commands. After pure policy checks, only positively proven
// reads/tests/builds bypass source authority; ambiguous executable segments
// fail closed to the governed source-write operation.
//
// `/tmp` contract (issue #199): system `/tmp` and `/private/tmp` are out of
// scope for both reads and writes. The canonical scratch directory is
// project-local `./.tmp/` (see CLAUDE.md "Tool Usage Rules"). This matches the
// activity-guard `.tmp/**` carve-out.
//
// FAIL-CLOSED contract (issue #751): the guard must never fail *open*. Two
// distinct failure modes are handled separately below:
//   1. A malformed stdin payload (unparseable JSON) is NOT a guard failure — it
//      is a bad harness payload, and today's intentional pass-through behavior
//      is preserved (exit 0, no block).
//   2. Any *internal* evaluation error — a dependency module that throws during
//      its own import/eval, a config-load throw, or an unexpected exception in
//      the guard logic — must fail CLOSED: emit `{"decision":"block"}` with a
//      guard-failure reason and a non-zero exit. A single broken dependency
//      must never silently disable every Bash protection at once.
// The guard-logic dependency imports are therefore performed via dynamic
// `import()` *inside* the try/catch (a static top-level import that threw at
// module-eval time would crash node before any handler could fail it closed).
// Out of scope: a hook whose script *file* is entirely missing — node never
// starts, so it cannot self-defend; that case is guarded at install/startup.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';

class BashPolicyBlock extends Error {
  constructor(reason, code) {
    super(reason);
    this.reason = reason;
    this.code = code;
  }
}

function allow(reason) {
  return { decision: 'allow', reason };
}

// Normal policy block — a command violated a rule. Throwing a private signal
// keeps the large policy evaluator short-circuiting without terminating an
// importing test process; main translates it back to the historical exit-0
// JSON decision.
function block(reason, code) {
  throw new BashPolicyBlock(reason, code);
}

// Fail closed — the guard could not complete evaluation. Emit a block decision
// AND exit non-zero, so an unchecked command is never allowed through.
function failClosed(err) {
  const detail = err && err.message ? err.message : String(err);
  const reason =
    'Bash guard failed to evaluate and is failing CLOSED (blocking) rather than ' +
    'allowing an unchecked command through. Internal guard error: ' +
    detail +
    '\n  Fix the guard before re-running; do not bypass it.';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exitCode = 1;
}

export async function runBashGuard(input, deps = {}) {
  try {
    await evaluate(input, deps);
    return allow('bash-policy-and-authority-allowed');
  } catch (error) {
    if (error instanceof BashPolicyBlock) {
      return {
        decision: 'block',
        reason: error.reason,
        ...(error.code ? { code: error.code } : {}),
      };
    }
    throw error;
  }
}

async function evaluate(input, deps = {}) {
  // #751 AC3 — test-only fault-injection seam. Lets the regression test force
  // the guard's internal evaluation to throw, so the fail-closed path can be
  // exercised deterministically from a subprocess. Never set in production.
  if (process.env.AITM_GUARD_FORCE_THROW) {
    throw new Error(process.env.AITM_GUARD_FORCE_THROW);
  }

  // Guard-logic dependencies are imported dynamically so a throw during their
  // own module evaluation is catchable and fails closed (see contract above).
  const { evaluateGhEdit, evaluateGhCreate, evaluateGhApiCreate, splitCommandSegments } =
    await import('./lib/gh-edit-guard.mjs');
  const { evaluateGhProject } = await import('./lib/gh-project-guard.mjs');
  const { evaluateAitmPath } = await import('./lib/aitm-path-guard.mjs');
  const { extractWriteTargets } = await import('./activity-policy.mjs');
  const { GIT_TIMEOUT_MS } = await import('./lib/process-timeouts.mjs');
  const { configPath } = await import('./paths.mjs');

  const command = input?.tool_input?.command ?? '';
  if (!command) return;

  // Resolve project root; fall back to cwd when not in a git repo.
  let projectRoot = deps.projectRoot;
  if (!projectRoot) {
    try {
      projectRoot = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: GIT_TIMEOUT_MS,
      }).trim();
    } catch {
      projectRoot = process.cwd();
    }
  }

  const homeDir = deps.homeDir || homedir();
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

  // #715 — cross-project board guard. Refuse agent-issued `gh project` subcommands
  // outright, and `gh api graphql` ProjectV2 operations that target a project id
  // other than the bound one (or pin no id at all). aitm owns board access via the
  // bound `projectId`; reads go through `aitm board`, writes through state verbs.
  // `boundProjectId` is best-effort from `task-tracker.json`; on read failure the
  // guard fails closed (only the exact-bound-id allow is suppressed). Checked
  // against the RAW command — ProjectV2 ids live inside quoted GraphQL bodies that
  // `scanned` strips. aitm's own ProjectV2 queries run via `node`/`gql()`, not
  // Bash, so they never reach this hook.
  const ghProjectResult = evaluateGhProject({
    command,
    boundProjectId: readBoundProjectId(projectRoot),
  });
  if (ghProjectResult.block) block(ghProjectResult.reason);

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

  // Legacy absolute-path extraction remains as a defensive overlap. The
  // command-position-aware extractor below covers quoted, relative, wrapped,
  // and multi-operand forms.
  const writeCommandRe = /\b(?:touch|mkdir|rmdir|rm)\s+(?:-[^\s]+\s+)*(\/[a-zA-Z0-9._~/-]+)/g;
  for (const [, p] of scanned.matchAll(writeCommandRe)) writePaths.add(p);
  for (const segment of collectCommandSegments(command, splitCommandSegments)) {
    for (const target of extractWriteTargets(segment)) writePaths.add(target);
  }

  // --- Extract all absolute paths ---
  // Lookbehind ensures we match only boundary-anchored paths, not mid-segment slashes
  // inside relative paths like node_modules/pkg/sub.
  const absPathRe = /(?<=^|[\s='"(`])\/[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*/gm;
  const allPaths = new Set(scanned.match(absPathRe) ?? []);

  // --- Validate write targets ---
  for (const p of writePaths) {
    if (p === '-') continue;
    const resolvedTarget = isAbsolute(p) ? resolve(p) : resolve(projectRoot, p);
    const projectRelative = relative(resolve(projectRoot), resolvedTarget);
    const insideProject =
      projectRelative === '' || (!projectRelative.startsWith('..') && !isAbsolute(projectRelative));
    if (!insideProject || p === '~' || p.startsWith('~/')) {
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

  // --- #769 commit-time assignee lock ---
  // A `git commit` whose message attributes to an issue (`[#N]` token) is
  // refused when that issue is assigned to another developer — the assignee is
  // a work-lock. This is a DEFENSIVE layer; the primary lock is at bind/mutator
  // time. Unlike the fail-closed verb preflight, fetch failures PASS here so an
  // offline `gh` never wedges every commit. Token-less/chore commits carry no
  // `[#N]` and pass — the visible escape hatch.
  await checkCommitAssigneeLock({ command, projectRoot });

  // All pure policy checks passed. Only now may the guard initialize durable
  // authority for shell source writes or a session-attributed commit.
  await authorizeAcceptedCommand({ command, projectRoot, deps });

  // #769 — commit-time assignee-lock check. Nested so it shares `block()` and
  // the resolved `projectRoot`/`configPath`. Any block() short-circuits with
  // exit 0; every fetch/parse failure is swallowed so commits are never wedged.
  async function checkCommitAssigneeLock({ command: rawCommand, projectRoot: root }) {
    const commitSegments = collectCommandSegments(rawCommand, splitCommandSegments).filter(
      isCommitSegment
    );
    if (commitSegments.length === 0) return;

    // Offline escape — consistent with the verb preflight's TT_SKIP_NETWORK gate.
    if (process.env.TT_SKIP_NETWORK === '1') return;

    const cfg = readAssigneeCfg(root);
    if (!cfg) return; // no config / unresolved repo — don't wedge commits
    if ((cfg.preferences?.gateAssigneeMatch ?? true) === false) return;

    const { parseCommitIssueRefs, checkAssigneeMatch } = await import('./lib/assignee-guard.mjs');
    // `[#N]` tokens live inside quoted commit messages. Parse only the raw
    // genuine commit segments so neighboring prose cannot borrow attribution.
    const refs = [...new Set(commitSegments.flatMap((segment) => parseCommitIssueRefs(segment)))];
    if (refs.length === 0) return; // token-less / chore — escape hatch

    const cache = {};
    for (const issueNumber of refs) {
      let verdict;
      try {
        verdict = await checkAssigneeMatch({ issueNumber, cfg, deps: { cache } });
      } catch {
        continue; // fetch failure PASSES at commit-time (defensive layer)
      }
      if (!verdict.ok && verdict.kind === 'assigned-to-other') {
        block(
          `Refusing git commit: #${issueNumber} is assigned to ${verdict.assignees.join(', ')}, not @${verdict.currentUser}.\n` +
            `  The issue's assignee is a work-lock — you cannot commit work attributed to another developer's issue.\n` +
            `  A human must reassign via the GitHub UI (with the current assignee's agreement) before you commit.\n` +
            `  Un-attributed chore commits (no \`[#N]\` token) are the intended escape hatch.`
        );
      }
    }
  }

  // #769 — best-effort read of the bound repo + assignee preference for the
  // commit-time lock. Returns null on any failure so the check no-ops rather
  // than wedging commits (the primary lock lives at bind/mutator time).
  function readAssigneeCfg(root) {
    try {
      const cfg = JSON.parse(readFileSync(configPath(root), 'utf8'));
      if (!cfg?.repo) return null;
      return cfg;
    } catch {
      return null;
    }
  }

  // #715 — best-effort read of the bound `projectId` for evaluateGhProject.
  // Prefers the git-tracked `.ai-task-manager/task-tracker.json`, falling back to
  // the legacy `.claude/task-tracker.json`. Returns null on any failure so the
  // guard fails closed (non-bound-id and no-id branches still fire).
  function readBoundProjectId(root) {
    // configPath() resolves task-tracker.json under SHARED_DIR with a transparent
    // read-fallback to the legacy `.claude` twin — no raw path literals here.
    try {
      const cfg = JSON.parse(readFileSync(configPath(root), 'utf8'));
      if (cfg?.projectId) return cfg.projectId;
    } catch {
      // unreadable config → fail closed (null); the guard blocks accordingly.
    }
    return null;
  }
}

function normalizeShellTarget(target, projectRoot) {
  const raw = String(target || '').replace(/^['"]|['"]$/g, '');
  if (!raw) return '';
  if (!isAbsolute(raw)) return raw.replace(/^\.\//, '');
  const rel = relative(resolve(projectRoot), resolve(raw));
  if (!rel.startsWith('..') && !isAbsolute(rel)) return rel.split('\\').join('/');
  return raw;
}

function isScratchTarget(target) {
  return target === '.tmp' || target.startsWith('.tmp/');
}

function shellWords(command) {
  const words = [];
  let word = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (quote === '"' && char === '\\' && i + 1 < command.length) {
        word += command[++i];
      } else {
        word += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === '\\' && i + 1 < command.length) {
      word += command[++i];
      continue;
    }
    if (/\s/.test(char)) {
      if (word) words.push(word);
      word = '';
      continue;
    }
    word += char;
  }
  if (word) words.push(word);
  return words;
}

function nestedCommandBodies(command) {
  const bodies = [];

  function scan(source) {
    let quote = null;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quote === "'") {
        if (char === "'") quote = null;
        continue;
      }
      if (char === "'" && quote !== '"') {
        quote = "'";
        continue;
      }
      if (char === '\\') {
        i += 1;
        continue;
      }
      if (char === '"') {
        quote = quote === '"' ? null : '"';
        continue;
      }
      if (char === '`') {
        let end = i + 1;
        while (end < source.length && source[end] !== '`') {
          if (source[end] === '\\') end += 1;
          end += 1;
        }
        const body = source.slice(i + 1, end);
        if (body.trim()) bodies.push(body);
        i = end;
        continue;
      }
      if (char !== '$' || source[i + 1] !== '(') continue;

      let depth = 1;
      let innerQuote = null;
      let end = i + 2;
      for (; end < source.length && depth > 0; end++) {
        const inner = source[end];
        if (innerQuote === "'") {
          if (inner === "'") innerQuote = null;
          continue;
        }
        if (inner === "'" && innerQuote !== '"') {
          innerQuote = "'";
          continue;
        }
        if (inner === '\\') {
          end += 1;
          continue;
        }
        if (inner === '"') {
          innerQuote = innerQuote === '"' ? null : '"';
          continue;
        }
        if (inner === '(') depth += 1;
        if (inner === ')') depth -= 1;
      }
      const body = source.slice(i + 2, depth === 0 ? end - 1 : source.length);
      if (body.trim()) bodies.push(body);
      i = depth === 0 ? end - 1 : source.length;
    }
  }

  scan(String(command || ''));
  return bodies;
}

function stripGroupingParens(segment) {
  return segment
    .trim()
    .replace(/^\(\s*/, '')
    .replace(/\s*\)+$/, '')
    .trim();
}

function collectCommandSegments(command, splitCommandSegments) {
  const collected = [];
  const seenBodies = new Set();

  function collect(source) {
    if (!source || seenBodies.has(source)) return;
    seenBodies.add(source);

    for (const rawSegment of splitCommandSegments(source)) {
      const segment = stripGroupingParens(rawSegment);
      if (!segment) continue;
      const words = shellWords(segment);
      const head = words[0]?.split('/').pop();
      const shellFlag = ['bash', 'sh', 'zsh'].includes(head)
        ? words.findIndex((word) => word === '-c' || word === '--command')
        : -1;
      if (shellFlag >= 0 && words[shellFlag + 1]) {
        collect(words[shellFlag + 1]);
      } else {
        collected.push(segment);
      }
    }

    for (const nested of nestedCommandBodies(source)) collect(nested);
  }

  collect(String(command || ''));
  return [...new Set(collected)];
}

function unwrapCommandWords(words) {
  const remaining = [...words];
  while (remaining[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(remaining[0])) remaining.shift();

  while (remaining.length > 0) {
    const head = remaining[0].split('/').pop();
    if (head === 'env') {
      remaining.shift();
      while (
        remaining[0] &&
        (remaining[0].startsWith('-') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(remaining[0]))
      ) {
        remaining.shift();
      }
      continue;
    }
    if (head === 'command' && remaining[1] !== '-v' && remaining[1] !== '-V') {
      remaining.shift();
      while (remaining[0]?.startsWith('-')) remaining.shift();
      continue;
    }
    break;
  }
  return remaining;
}

function gitSubcommand(words) {
  if (words[0]?.split('/').pop() !== 'git') return null;
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (word === '-c' || word === '-C' || word === '--git-dir' || word === '--work-tree') {
      i += 1;
      continue;
    }
    if (word.startsWith('-')) continue;
    return word;
  }
  return null;
}

function isCommitSegment(segment) {
  return gitSubcommand(unwrapCommandWords(shellWords(segment))) === 'commit';
}

function isSanctionedAitmCommand(command, segments) {
  if (nestedCommandBodies(command).length > 0 || segments.length !== 1) return false;
  const segment = segments[0].trim();
  const words = shellWords(segment);
  while (words[0] && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
  if (words[0] !== 'npx') return false;
  let cursor = 1;
  if (words[cursor] === '--yes') cursor += 1;
  return words[cursor] === 'aitm' || words[cursor] === 'ai-task-manager';
}

const READ_ONLY_BINS = new Set([
  '[',
  'basename',
  'cat',
  'cmp',
  'cut',
  'date',
  'diff',
  'dirname',
  'echo',
  'false',
  'file',
  'grep',
  'head',
  'hostname',
  'id',
  'jq',
  'ls',
  'printf',
  'pwd',
  'realpath',
  'rg',
  'sort',
  'stat',
  'tail',
  'test',
  'tr',
  'true',
  'type',
  'uname',
  'uniq',
  'wc',
  'which',
  'whoami',
]);

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'blame',
  'cat-file',
  'describe',
  'diff',
  'grep',
  'log',
  'ls-files',
  'ls-tree',
  'rev-list',
  'rev-parse',
  'show',
  'status',
]);

function isProvenReadOnly(segment, classifyBash) {
  const words = unwrapCommandWords(shellWords(segment));
  if (words.length === 0) return true;
  const normalized = words.join(' ');
  const activity = classifyBash(normalized);
  if (activity === 'RUN_TESTS' || activity === 'RUN_BUILD') return true;

  const head = words[0].split('/').pop();
  if (
    (head === 'sort' || head === 'diff') &&
    words.some(
      (word) =>
        word === '-o' ||
        word === '--output' ||
        word.startsWith('--output=') ||
        (head === 'sort' && /^-o.+/.test(word))
    )
  ) {
    return false;
  }
  if (READ_ONLY_BINS.has(head)) return true;
  if (head === 'command' && (words[1] === '-v' || words[1] === '-V')) return true;
  if (head === 'env' && words.length === 1) return true;
  if (head === 'node') {
    const preload = words.some(
      (word) => word === '-r' || word === '--require' || word.startsWith('--require=')
    );
    return words[1] === '--check' && !preload;
  }
  if (head === 'npm') {
    const safeScript = words[1] === 'run' && (words[2] === 'lint' || words[2] === 'format:check');
    const mutationFlag = words.some(
      (word) => word === '--fix' || word === '--write' || word.startsWith('--fix=')
    );
    return safeScript && !mutationFlag;
  }
  if (head === 'find') {
    // cspell:ignore execdir fprint okdir
    const mutationPrimaries = new Set([
      '-delete',
      '-exec',
      '-execdir',
      '-fls',
      '-fprint',
      '-fprint0',
      '-ok',
      '-okdir',
    ]);
    return !words.some((word) => mutationPrimaries.has(word));
  }
  if (head === 'sed') {
    return !words.some((word) => word === '-i' || word.startsWith('-i') || word === '--in-place');
  }
  if (head === 'git') {
    const subcommand = gitSubcommand(words);
    if (words.some((word) => word === '--output' || word.startsWith('--output='))) return false;
    if (READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) return true;
    if (subcommand === 'branch') {
      return words.some((word) => ['--list', '--show-current', '-a', '-r'].includes(word));
    }
    if (subcommand === 'config') {
      return words.some((word) =>
        ['--get', '--get-all', '--get-regexp', '--list', '-l', '--show-origin'].includes(word)
      );
    }
    if (subcommand === 'worktree') {
      const worktreeIndex = words.indexOf('worktree');
      return words.slice(worktreeIndex + 1).find((word) => !word.startsWith('-')) === 'list';
    }
    return false;
  }
  if (head === 'gh') {
    if (words[1] === 'api') {
      return !words.some(
        (word) =>
          word === '-F' ||
          word.startsWith('-F') ||
          word === '-f' ||
          word.startsWith('-f') ||
          word === '-X' ||
          word.startsWith('-X') ||
          word === '--field' ||
          word.startsWith('--field=') ||
          word === '--input' ||
          word.startsWith('--input=') ||
          word === '--method' ||
          word.startsWith('--method=')
      );
    }
    if (words[1] === 'issue' && (words[2] === 'reopen' || words[2] === 'edit')) {
      // The pure gh policy above already refuses body edits and lifecycle
      // closes. Reopen and metadata-only edits remain intentional legacy
      // escape paths and do not produce a local source effect.
      return true;
    }
    const key = `${words[1] || ''} ${words[2] || ''}`;
    return new Set([
      'issue list',
      'issue status',
      'issue view',
      'pr checks',
      'pr diff',
      'pr list',
      'pr status',
      'pr view',
      'repo list',
      'repo view',
      'run list',
      'run view',
      'workflow list',
      'workflow view',
    ]).has(key);
  }
  return false;
}

function sourceEffectProfile({
  command,
  projectRoot,
  splitCommandSegments,
  classifyBash,
  extractWriteTargets,
}) {
  const segments = collectCommandSegments(command, splitCommandSegments);
  const commitSegments = segments.filter(isCommitSegment);
  const writeTargets = segments
    .flatMap((segment) => extractWriteTargets(segment))
    .map((target) => normalizeShellTarget(target, projectRoot))
    .filter(Boolean);
  const sourceTargets = writeTargets.filter((target) => !isScratchTarget(target));

  if (
    commitSegments.length === 0 &&
    sourceTargets.length === 0 &&
    isSanctionedAitmCommand(command, segments)
  ) {
    return { commitSegments, sourceTargets, requiresSource: false };
  }

  let requiresSource = sourceTargets.length > 0;
  for (const segment of segments) {
    if (isCommitSegment(segment) || isProvenReadOnly(segment, classifyBash)) continue;
    const segmentTargets = extractWriteTargets(segment)
      .map((target) => normalizeShellTarget(target, projectRoot))
      .filter(Boolean);
    if (segmentTargets.length > 0 && segmentTargets.every(isScratchTarget)) continue;
    requiresSource = true;
  }

  return { commitSegments, sourceTargets, requiresSource };
}

function canonicalIssue(value) {
  const match = String(value ?? '').match(/^#?([1-9]\d*)$/);
  return match?.[1] ?? null;
}

async function authorizeAcceptedCommand({ command, projectRoot, deps }) {
  const [{ classifyBash, extractWriteTargets }, { splitCommandSegments }] = await Promise.all([
    import('./activity-policy.mjs'),
    import('./lib/gh-edit-guard.mjs'),
  ]);

  const { commitSegments, sourceTargets, requiresSource } = sourceEffectProfile({
    command,
    projectRoot,
    splitCommandSegments,
    classifyBash,
    extractWriteTargets,
  });
  if (commitSegments.length === 0 && !requiresSource) return;

  const [{ isChoreModeActive }, { readBoundState }] = await Promise.all([
    import('./lib/chore-mode.mjs'),
    import('./lib/bound-state.mjs'),
  ]);
  const choreActive = (deps.isChoreModeActive || isChoreModeActive)(projectRoot);
  if (choreActive) return;

  const { activeIssue } = (deps.readBoundState || readBoundState)(projectRoot);
  const boundIssue = canonicalIssue(activeIssue);
  const operations = [];

  if (commitSegments.length > 0) {
    const { parseCommitIssueRefs } = await import('./lib/assignee-guard.mjs');
    const refs = [
      ...new Set(commitSegments.flatMap((segment) => parseCommitIssueRefs(segment).map(String))),
    ];
    if (!boundIssue) {
      if (refs.length === 0) {
        if (!requiresSource) return;
      } else {
        block(
          `[task-tracker] Refusing issue-attributed git commit: ${refs.map((id) => `#${id}`).join(', ')} has no active session binding.\n` +
            `  Bind the intended issue before committing so its exclusive work lease can be verified.`,
          'bash-commit-no-bound-issue'
        );
      }
    }
    if (boundIssue) {
      const mismatches = refs.filter((id) => id !== boundIssue);
      if (mismatches.length > 0) {
        block(
          `[task-tracker] Refusing git commit: message target ${mismatches.map((id) => `#${id}`).join(', ')} differs from active binding #${boundIssue}.\n` +
            `  A commit may only attribute the issue whose session lease is currently bound.`,
          'bash-commit-binding-mismatch'
        );
      }
      operations.push('issue-attributed-commit');
    }
  }

  if (requiresSource) {
    if (!boundIssue) {
      const targets =
        sourceTargets.length > 0 ? sourceTargets.join(', ') : 'unclassified shell segment';
      block(
        `[task-tracker] Refusing shell source mutation: no active issue is bound.\n` +
          `  Targets: ${targets}`,
        'bash-source-no-bound-issue'
      );
    }
    operations.push('source-write');
  }

  let withGovernedEffect = deps.withGovernedEffect;
  if (!withGovernedEffect) {
    const { createRuntimeGovernedEffectAdapter } =
      await import('./lib/work-lease/governed-effect.mjs');
    const config =
      deps.config ||
      (() => {
        const configFile = join(projectRoot, '.ai-task-manager', 'task-tracker.json');
        return JSON.parse(readFileSync(configFile, 'utf8'));
      })();
    withGovernedEffect = createRuntimeGovernedEffectAdapter({
      projectDir: projectRoot,
      config,
    });
  }

  for (const operation of [...new Set(operations)]) {
    try {
      await withGovernedEffect(
        {
          issueId: boundIssue,
          operation,
          heartbeat: true,
        },
        async () => {
          await deps.onAuthorizedCommand?.({ operation, issueId: boundIssue });
        }
      );
    } catch (error) {
      const authorityCode =
        typeof error?.code === 'string' && error.code.trim() ? error.code.trim() : 'unknown';
      const detail = error?.message ? `: ${error.message}` : '';
      const prefix = operation === 'source-write' ? 'source' : 'commit';
      block(
        `[task-tracker] Bash command refused: ${operation} authority ${authorityCode}${detail}\n` +
          `  The shell command did not receive permission to run.`,
        `bash-${prefix}-authority-refused`
      );
    }
  }
}

async function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }

  try {
    const result = await runBashGuard(input);
    if (result.decision === 'block') {
      process.stdout.write(JSON.stringify({ decision: 'block', reason: result.reason }));
    }
  } catch (error) {
    failClosed(error);
  }
}

export const runGuardBootstrap = main;

const isMain =
  import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('bash-guard.mjs');
if (isMain) {
  runGuardBootstrap();
}
