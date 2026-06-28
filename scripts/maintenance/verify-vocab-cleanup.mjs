#!/usr/bin/env node
// Sandbox-safe verification for the R4R + Groom/Analyze/Todo retirement (#196).
//
// The sandboxed verification runner forbids shell pipes, `!`, redirects, and
// inline-code flags, AND rejects the literal characters `|`, `>`, `<`, etc.
// in the raw command string — even inside quotes. So regex patterns with
// alternation or word boundaries cannot be passed as argv tokens.
//
// Instead, every per-AC check is registered as a named "check" with a hard-
// coded (file, pattern, mode) triple. Issue body markers reference checks by
// alphanumeric key only:
//
//   node scripts/maintenance/verify-vocab-cleanup.mjs check <key>
//   node scripts/maintenance/verify-vocab-cleanup.mjs noop
//   node scripts/maintenance/verify-vocab-cleanup.mjs final-sweep
//
// Exit 0 = pass, non-zero = fail (with a one-line reason on stderr).
//
// cspell:ignore deprecat

import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function fail(msg) {
  process.stderr.write(`verify-vocab-cleanup: ${msg}\n`);
  process.exit(1);
}

// Each check: { mode, file, pattern } where mode is 'absent', 'present', or
// 'not-exists'. `pattern` is a JS regex source compiled with the 'i' flag.
// Keys must be plain alphanumerics-plus-dash so the sandbox accepts them as a
// bare argv token.
const CHECKS = {
  // R4R cleanup
  'pickup-r4r': {
    mode: 'absent',
    file: '.ai-task-manager/templates/pickup-directive.md',
    pattern: 'r4r',
  },
  'templates-pickup-r4r': {
    mode: 'absent',
    file: 'templates/pickup-directive.md',
    pattern: 'r4r',
  },
  'wave-admission-r4r': {
    mode: 'absent',
    file: 'scripts/gh/lib/wave-admission.mjs',
    pattern: 'r4r',
  },

  // Groom/Analyze/Todo cleanup (user-facing strings)
  'create-issue-help-vocab': {
    mode: 'absent',
    file: 'scripts/gh/create-issue.mjs',
    pattern: '\\b(groom|analyze|validate|todo)\\b',
  },
  'project-tether-help-vocab': {
    mode: 'absent',
    file: 'scripts/gh/project-tether.mjs',
    pattern: '\\b(groom|analyze|validate|todo)\\b',
  },
  'project-tether-lib-groom-warning': {
    mode: 'absent',
    file: 'scripts/gh/lib/project-tether.mjs',
    pattern: 'Groom column|--status groom',
  },
  'move-state-legacy-chain': {
    mode: 'absent',
    file: 'scripts/gh/move-state.mjs',
    pattern: 'Backlog . Groom|Groom . Analyze|Analyze . Development|. Validate .',
  },
  'heal-backlog-legacy-columns': {
    mode: 'absent',
    file: 'scripts/task-tracker/heal-backlog.mjs',
    pattern: "'(Groom|Analyze|Validate)'",
  },
  'body-gates-legacy-comments': {
    mode: 'absent',
    file: 'scripts/task-tracker/lib/body-gates.mjs',
    pattern: 'Analyze-gate|Grooming . Analysis|past .Groom.',
  },
  'apply-reevaluate-groom-time': {
    mode: 'absent',
    file: 'scripts/task-tracker/lib/apply-reevaluate.mjs',
    pattern: 'Groom time',
  },

  // CLI status-flag mismatch fix
  'project-tether-valid-statuses': {
    mode: 'present',
    file: 'scripts/gh/project-tether.mjs',
    pattern: 'VALID_STATUSES.has',
  },

  // Deep-dive additions
  'promote-legacy-chain': {
    mode: 'absent',
    file: 'scripts/task-tracker/verbs/promote.mjs',
    pattern: 'groom . analyze . development . validate',
  },
  'promote-groom-gate-refused': {
    mode: 'absent',
    file: 'scripts/task-tracker/verbs/promote.mjs',
    pattern: 'groom-gate-refused',
  },
  'pickup-directive-bak-removed': {
    mode: 'not-exists',
    file: '.ai-task-manager/templates/pickup-directive.md.bak',
  },
};

function runCheck(key) {
  if (!key) fail('check: usage: check <key>');
  const def = CHECKS[key];
  if (!def) fail(`check: unknown key '${key}'`);

  if (def.mode === 'not-exists') {
    const abs = path.resolve(ROOT, def.file);
    if (existsSync(abs)) fail(`not-exists: path still exists: ${def.file}`);
    return;
  }

  const abs = path.resolve(ROOT, def.file);
  if (!existsSync(abs)) fail(`${def.mode}: file not found: ${def.file}`);
  const re = new RegExp(def.pattern, 'i');
  const body = readFileSync(abs, 'utf8');

  if (def.mode === 'absent') {
    const lines = body.split('\n');
    const hits = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) hits.push(`${def.file}:${i + 1}: ${lines[i].trim()}`);
    }
    if (hits.length > 0) {
      fail(
        `absent[${key}]: ${hits.length} match(es) for /${def.pattern}/i in ${def.file}\n  ${hits.slice(0, 5).join('\n  ')}`
      );
    }
    return;
  }

  if (def.mode === 'present') {
    if (!re.test(body)) {
      fail(`present[${key}]: pattern /${def.pattern}/i not found in ${def.file}`);
    }
    return;
  }

  fail(`check: unknown mode '${def.mode}' for key '${key}'`);
}

// Recursive file walk that skips node_modules / .git.
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(full);
    } else if (ent.isFile()) {
      yield full;
    }
  }
}

// Equivalent of:
//   grep -RIn 'R4R|r4r|\bGroom\b|\bAnalyze\b|\bTodo\b' docs templates .ai-task-manager scripts \
//     | grep -vE 'migrate/|migration|archive/|\.test\.mjs|legacy|backward.?compat|deprecat'
//
// Plus path/line exclusions for files that legitimately mention the legacy
// vocabulary (migration tooling, this verify script's own documentation,
// audit trails in issue bodies / state files).
function finalSweep() {
  const targets = ['docs', 'templates', '.ai-task-manager', 'scripts'];
  const tokenRe = /R4R|r4r|\bGroom\b|\bAnalyze\b|\bTodo\b/;
  const excludePath =
    /(?:^|\/)(?:migrate|archive)\/|migration|\.test\.mjs$|verify-vocab-cleanup\.mjs$|task-tracker-state\.json$|fleet\.json$|rename-estimation-headers\.mjs$/;
  const excludeLine =
    /legacy|backward.?compat|deprecat|aitm-|verify-vocab-cleanup|board-name alias|column-name alias|consumer board|alias list|config-key|predate|→\s*(?:Refine|Plan|Develop|Test)|existing projects|auto_or_pick/i;
  const offenders = [];
  for (const root of targets) {
    const abs = path.resolve(ROOT, root);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isFile()) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(ROOT, file);
      if (excludePath.test(rel)) continue;
      let body;
      try {
        body = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = body.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        if (!tokenRe.test(lines[i])) continue;
        if (excludeLine.test(lines[i])) continue;
        offenders.push(`${rel}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }
  if (offenders.length > 0) {
    fail(
      `final-sweep: ${offenders.length} unaccounted vocab reference(s):\n  ${offenders.slice(0, 30).join('\n  ')}`
    );
  }
}

const [, , subcommand, ...rest] = process.argv;
switch (subcommand) {
  case 'check':
    runCheck(rest[0]);
    break;
  case 'noop':
    // Manual-review / maintainer-decision ACs: no automated check possible.
    // Exit 0 to satisfy the sandbox; the audit trail lives in the deep-dive
    // section of the issue body.
    break;
  case 'final-sweep':
    finalSweep();
    break;
  case 'list-checks':
    // Convenience for maintainers: print every registered key.
    for (const key of Object.keys(CHECKS)) process.stdout.write(`${key}\n`);
    break;
  default:
    fail(`unknown subcommand: ${subcommand}. usage: check|noop|final-sweep|list-checks`);
}
