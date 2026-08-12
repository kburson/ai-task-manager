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
import { execFileSync, execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, resolve } from 'node:path';

// --- Phase 1: parse stdin -------------------------------------------------
// A malformed payload is not a guard failure — preserve the intentional
// pass-through (exit 0, no block). This stays OUTSIDE the fail-closed try below
// so a bad harness payload can never be mistaken for an internal guard error.
let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0); // malformed payload — don't block
}

// --- Phase 2: evaluate, failing CLOSED on any internal error --------------
try {
  await evaluate(input);
  process.exit(0); // all checks passed
} catch (err) {
  failClosed(err);
}

// Normal policy block — a command violated a rule. Exit 0 with the decision
// (Claude Code reads the block from the stdout JSON, not the exit code).
function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
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
  process.exit(1);
}

async function evaluate(input) {
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
  const { classifyBashWorktreeCommand, evaluateBashWorktreeBinding } =
    await import('./lib/bash-worktree-guard.mjs');
  const { readWorktreeIdentity, resolveCurrentSessionWorktreeBinding } =
    await import('./lib/worktree-binding-guard.mjs');
  const { evaluateGhProject } = await import('./lib/gh-project-guard.mjs');
  const { evaluateAitmPath } = await import('./lib/aitm-path-guard.mjs');
  const { GIT_TIMEOUT_MS } = await import('./lib/process-timeouts.mjs');
  const { configPath } = await import('./paths.mjs');

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

  // #1166 — refuse writes, verification, and task verbs from a checkout other
  // than this session's recorded bound worktree. Navigation and read-only
  // inspection remain available so the operator can reach the corrective path.
  const worktreeClassification = classifyBashWorktreeCommand(command);
  if (worktreeClassification.guarded) {
    const invokingDir = input?.cwd || process.cwd();
    const bound = resolveCurrentSessionWorktreeBinding({ invokingDir });
    const invoking = bound ? readWorktreeIdentity({ projectDir: invokingDir }) : null;
    const worktreeResult = evaluateBashWorktreeBinding({
      command,
      bound,
      invoking,
      classification: worktreeClassification,
    });
    if (worktreeResult.block) block(worktreeResult.reason);
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
        '  Use `scripts/gh/create-issue.mjs --shape <stub|epic|sub-issue|solo|defect>` — it enforces project tether, assignee/priority gates, and template structure.'
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
  // forbidden (route body writes through `mutateIssueBody`). Label/title edits
  // pass through; #1212 routes assignee edits through governed ownership verbs.
  // (#566 removed the former
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
  // refused unless that issue has exactly one owner matching the authenticated
  // clone identity. This is a DEFENSIVE layer; the primary lock is at
  // bind/mutator time. Ownership failures fail closed because an attributed
  // commit is development collateral. Token-less/chore commits carry no `[#N]`
  // and pass — the visible escape hatch.
  await checkCommitAssigneeLock({ command, scanned, projectRoot });

  // All checks passed — evaluate() returns and the caller exits 0.

  // #769 — commit-time assignee-lock check. Nested so it shares `block()` and
  // the resolved `projectRoot`/`configPath`. Any block() short-circuits with
  // exit 0; ownership verification is fail-closed for attributed commits.
  async function checkCommitAssigneeLock({ command: rawCommand, projectRoot: root }) {
    const rawSegments = splitCommandSegments(rawCommand);
    const commits = [];
    for (let index = 0; index < rawSegments.length; index += 1) {
      const parsed = parseGitCommitSegment(rawSegments[index]);
      if (parsed) commits.push({ index, ...parsed });
    }
    if (commits.length === 0) return;

    // Offline escape — consistent with the verb preflight's TT_SKIP_NETWORK gate.
    if (process.env.TT_SKIP_NETWORK === '1') return;

    const { parseCommitIssueRefs, checkAssigneeMatch } = await import('./lib/assignee-guard.mjs');
    const refs = [];
    const seen = new Set();
    const addRefs = (text) => {
      for (const issue of parseCommitIssueRefs(text)) {
        if (!seen.has(issue)) {
          seen.add(issue);
          refs.push(issue);
        }
      }
    };
    for (const { index, args } of commits) {
      const segment = rawSegments[index] || '';
      addRefs(segment);
      for (const messagePath of commitMessageFiles(args)) {
        if (messagePath === '-') {
          block(
            'Refusing git commit: attributed ownership cannot be verified from `git commit -F -` stdin.\n' +
              '  Use `-F <file>`, `-m`, or an un-attributed chore commit.'
          );
        }
        try {
          const absolutePath = isAbsolute(messagePath) ? messagePath : resolve(root, messagePath);
          addRefs(readFileSync(absolutePath, 'utf8'));
        } catch (error) {
          block(
            `Refusing git commit: could not read commit message file ${messagePath} (${error?.message || String(error)}).\n` +
              '  Attributed ownership verification fails closed when the final message is unreadable.'
          );
        }
      }
      for (const inheritedRef of inheritedMessageRefs(args)) {
        try {
          addRefs(
            execFileSync('git', ['log', '-1', '--format=%B', inheritedRef], {
              cwd: root,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: GIT_TIMEOUT_MS,
            })
          );
        } catch (error) {
          block(
            `Refusing git commit: could not resolve inherited message from ${inheritedRef} (${error?.message || String(error)}).`
          );
        }
      }
    }
    if (refs.length === 0) return; // token-less / chore — escape hatch

    const cfg = readAssigneeCfg(root);
    if (!cfg) {
      block(
        'Refusing attributed git commit: repository ownership config is missing or unreadable.\n' +
          '  Attributed development commits fail closed when ownership cannot be resolved; restore task-tracker.json or use an un-attributed chore commit.'
      );
    }
    if ((cfg.preferences?.gateAssigneeMatch ?? true) === false) return;

    const cache = {};
    for (const issueNumber of refs) {
      let verdict;
      try {
        verdict = await checkAssigneeMatch({ issueNumber, cfg, deps: { cache } });
      } catch (error) {
        block(
          `Refusing git commit: could not verify exclusive ownership of #${issueNumber} (${error?.message || String(error)}).\n` +
            `  Attributed development commits fail closed when ownership is unreadable.\n` +
            `  Retry with GitHub connectivity, or use an un-attributed chore commit for work that does not belong to the story.`
        );
      }
      if (!verdict.ok) {
        block(
          `Refusing git commit: #${issueNumber} ownership is ${verdict.kind}; expected exactly @${verdict.currentUser}.\n` +
            `  Observed owners: ${verdict.assignees.length ? verdict.assignees.join(', ') : 'none'}.\n` +
            `  Story ownership is an exclusive workstation lock for attributed development commits.\n` +
            `  Un-attributed chore commits (no \`[#N]\` token) are the intended escape hatch.`
        );
      }
    }
  }

  function parseGitCommitSegment(segment) {
    const tokens = shellWords(segment);
    const gitIndex = tokens.findIndex((token) => basename(token) === 'git');
    if (gitIndex < 0) return false;
    let index = gitIndex + 1;
    while (index < tokens.length) {
      const token = tokens[index];
      if (token === 'commit') return { args: tokens.slice(index + 1) };
      if (!token.startsWith('-')) return false;
      if (['-c', '-C', '--git-dir', '--work-tree', '--namespace'].includes(token)) index += 2;
      else index += 1;
    }
    return false;
  }

  function shellWords(segment) {
    const words = [];
    let word = '';
    let quote = '';
    let escaped = false;
    for (const char of String(segment || '')) {
      if (escaped) {
        word += char;
        escaped = false;
      } else if (char === '\\' && quote !== "'") {
        escaped = true;
      } else if (quote) {
        if (char === quote) quote = '';
        else word += char;
      } else if (char === "'" || char === '"') {
        quote = char;
      } else if (/\s/.test(char)) {
        if (word) {
          words.push(word);
          word = '';
        }
      } else {
        word += char;
      }
    }
    if (word) words.push(word);
    return words;
  }

  function commitMessageFiles(args) {
    const paths = [];
    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === '-F' || token === '--file') paths.push(args[++index]);
      else if (token.startsWith('--file=')) paths.push(token.slice('--file='.length));
      else if (token.startsWith('-F') && token.length > 2) paths.push(token.slice(2));
    }
    return paths.filter(Boolean);
  }

  function inheritedMessageRefs(args) {
    const refs = [];
    let amend = false;
    let explicitMessage = false;
    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === '--amend') amend = true;
      if (['-m', '--message', '-F', '--file'].includes(token)) {
        explicitMessage = true;
        index += 1;
        continue;
      }
      if (/^(?:-m|--message=|-F|--file=)/.test(token)) explicitMessage = true;
      if (['-C', '--reuse-message', '-c', '--reedit-message'].includes(token)) {
        const ref = args[++index];
        if (ref) refs.push(ref);
      } else if (token.startsWith('--reuse-message=')) {
        refs.push(token.slice('--reuse-message='.length));
      } else if (token.startsWith('--reedit-message=')) {
        refs.push(token.slice('--reedit-message='.length));
      } else if (/^-C.+/.test(token)) {
        refs.push(token.slice(2));
      } else if (/^-c.+/.test(token)) {
        refs.push(token.slice(2));
      }
    }
    if (amend && !explicitMessage && refs.length === 0) refs.push('HEAD');
    return refs;
  }

  // #769/#1212 — read the bound repo + assignee preference for the commit-time
  // lock. Returning null lets tokenless chore commits pass, but attributed
  // commits fail closed above because their ownership authority is unreadable.
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
