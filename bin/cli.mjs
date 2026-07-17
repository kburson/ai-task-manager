#!/usr/bin/env node
// npx ai-task-manager <command> [options]
// Commands: install, init, statusline, version

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
// (getProvider import added below; dirname already imported for adapter dir resolution)
import { createInterface } from 'node:readline';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  rmSync,
  lstatSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import {
  findSuperpowersSkillRoot,
  mirrorSuperpowerSkills,
  codexBootstrapBlock,
  updateAgentsFile,
} from '../scripts/task-tracker/codex-superpowers.mjs';
import { stampAllSkillVersions } from './lib/stamp-skill-version.mjs';
import { TEMPLATE_FILES, memorySeedFiles } from './lib/template-manifest.mjs';
import {
  parseMemorySeedFlag,
  parseMemoryBullets,
  filesForMode,
  writeMemorySeed,
} from './lib/memory-seed-install.mjs';
import { writeIfChanged } from '../scripts/task-tracker/lib/write-if-changed.mjs';
import { CLAUDE_BASH_ALLOWLIST } from './lib/claude-bash-allowlist.mjs';
import { PREFERENCE_DEFAULTS } from '../scripts/task-tracker/config.mjs';
import { getProvider } from '../scripts/providers/index.mjs';
import {
  GUARD_NAMES,
  guardBootstrapCommand,
  hookBootstrapCommand,
} from '../scripts/task-tracker/lib/guard-entrypoint.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const PKG_NAME = 'ai-task-manager';

// TTY gate: return raw string when stdout is not a TTY (pipe, file, CI log) so
// downstream consumers don't see raw escape sequences as garbage characters.
export function colorize(open, s, close = '\x1b[0m') {
  if (!process.stdout.isTTY) return String(s);
  return `${open}${s}${close}`;
}
export function bold(s) {
  return colorize('\x1b[1m', s);
}
export function dim(s) {
  return colorize('\x1b[2m', s);
}
export function green(s) {
  return colorize('\x1b[32m', s);
}
export function red(s) {
  return colorize('\x1b[31m', s);
}
export function yellow(s) {
  return colorize('\x1b[33m', s);
}
export function cyan(s) {
  return colorize('\x1b[36m', s);
}
export function magenta(s) {
  return colorize('\x1b[35m', s);
}
export function bgBlue(s) {
  return colorize('\x1b[44m\x1b[97m', s);
}
export function bgGreen(s) {
  return colorize('\x1b[42m\x1b[30m', s);
}
export function bgYellow(s) {
  return colorize('\x1b[43m\x1b[30m', s);
}

function ok(msg) {
  console.log(`  ${green('OK')} ${msg}`);
}
function err(msg) {
  console.error(`  ${red('ERR')} ${msg}`);
}

function banner(title, subtitle) {
  const inner = `  ${title.padEnd(58)}`;
  const pad = ' '.repeat(inner.length);
  console.log('');
  console.log(bgBlue(bold(pad)));
  console.log(bgBlue(bold(inner)));
  if (subtitle) console.log(bgBlue(`  ${dim(subtitle.padEnd(58))}`));
  console.log(bgBlue(bold(pad)));
  console.log('');
}

function step(title) {
  console.log('');
  console.log(`${cyan('>')} ${bold(title)}`);
  console.log(dim('  ---------------------------------------------------------'));
}

function parseOption(args, name, fallback = null) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

// #869 — every lifecycle hook command now routes through `hookBootstrapCommand`
// (node_modules → repo-relative existence pick + argv normalization) so it
// resolves in a node_modules-less worktree of this repo. The bare
// `node node_modules/…` forms these replace are listed in `LEGACY_HOOK_COMMANDS`
// and stripped on re-install so old settings migrate idempotently (mirrors #792).
const TIMING_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hook-handler.mjs');
const COMMIT_TRAIL_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/commit-trail-handler.mjs');
// EPIC #207 / #213 — Seq 2: Stop + UserPromptSubmit hooks for hook-driven
// pause/resume. The hook handlers write/drain a per-session pending-pause
// marker; the resume hook posts a single idle row when the inter-turn gap
// exceeds `pauseThresholdSeconds`.
const ON_STOP_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/on-stop.mjs');
const ON_USER_PROMPT_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-user-prompt.mjs'
);
const CODEX_PROMPT_TIMESTAMP_HOOK_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/codex-prompt-timestamp.mjs';
// EPIC #238 / #240 — AskUserQuestion pause/resume hooks. The same module is
// invoked twice with a phase argument: `pause` (PreToolUse) brackets the
// question open, `resume` (PostToolUse) closes it with the measured wait.
const ON_ASK_PAUSE_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-ask.mjs',
  'pause'
);
const ON_ASK_RESUME_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/on-ask.mjs',
  'resume'
);
// EPIC #238 / #241 — Stop hook that audits the bound issue's ⏱ Timing Log for
// the current session and warns when pause/resume rows do not balance. Warn-
// only, fail-open; the safety net for chat-only questions that never trip the
// AskUserQuestion hook (#240).
const STOP_AUDIT_HOOK_CMD = hookBootstrapCommand(
  'scripts/task-tracker/hooks/stop-audit-pause-resume.mjs'
);
// #728 — always-loaded memory-index hook. Emits ONLY `.ai-task-manager/memory/
// MEMORY.md` as additionalContext on SessionStart + PostCompact. Registered only
// when at least one seed file was accepted at install (a `none` selection
// installs no hook).
const MEMORY_INDEX_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/hooks/memory-index.mjs');
// #869 — SessionStart seed check: inspect + heal an unseeded worktree before any
// other hook resolves a node_modules path. Routed through the shim like the rest.
const SEED_CHECK_HOOK_CMD = hookBootstrapCommand('scripts/task-tracker/ensure-worktree-seeded.mjs');
// Bare-path forms shipped before #869 — stripped and re-registered as shims so
// re-running the installer migrates old settings idempotently (mirrors #792).
const LEGACY_HOOK_COMMANDS = [
  'node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/commit-trail-handler.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-stop.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-user-prompt.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs pause',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/on-ask.mjs resume',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/stop-audit-pause-resume.mjs',
  'node node_modules/ai-task-manager/scripts/task-tracker/hooks/memory-index.mjs',
];
const LEGACY_TIMING_HOOK_COMMANDS = [
  '.claude/hooks/task-tracker.sh',
  'node node_modules/ai-task-manager/hooks/hook-handler.mjs',
];
const LEGACY_COMMIT_TRAIL_HOOK_COMMANDS = ['.claude/hooks/commit-trail.sh'];
// #792 — the pre-fallback direct-node guard command form. These fail OPEN in a
// node_modules-less worktree (node can't resolve the file before guard logic
// runs). `patchSettingsJson` removes them and re-registers the `node -e`
// existence-pick form (`guardBootstrapCommand`) so re-running the installer
// migrates old settings idempotently instead of leaving both entries.
const LEGACY_GUARD_HOOK_COMMANDS = GUARD_NAMES.map(
  (name) => `node node_modules/ai-task-manager/scripts/task-tracker/${name}.mjs`
);

function hookEntryHasCommand(entry, command) {
  return (
    entry?.command === command ||
    (typeof entry === 'string' && entry === command) ||
    entry?.hooks?.some((inner) => inner.command === command)
  );
}

function removeHookCommands(entries, commands) {
  return entries
    .map((entry) => {
      if (typeof entry === 'string') return commands.includes(entry) ? null : entry;
      if (!entry || typeof entry !== 'object') return entry;
      if (commands.includes(entry.command)) return null;
      if (!Array.isArray(entry.hooks)) return entry;
      const hooks = entry.hooks.filter((inner) => !commands.includes(inner.command));
      if (hooks.length === 0) return null;
      return { ...entry, hooks };
    })
    .filter(Boolean);
}

export function patchSettingsJson(settingsPath, { memoryIndexHook = false } = {}) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  if (!settings.hooks) settings.hooks = {};

  // #869 — strip every pre-shim bare-path lifecycle hook command across all
  // events, then let the registrations below re-add the shim forms. A global
  // strip (rather than one per event loop) guarantees no bare
  // `node node_modules/…` command survives, whichever event array it sat in.
  for (const event of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = removeHookCommands(settings.hooks[event], LEGACY_HOOK_COMMANDS);
    }
  }

  // #869 — seed check FIRST on SessionStart: heal an unseeded worktree before
  // any other hook resolves a node_modules path. Idempotent by command string.
  if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = [];
  if (!settings.hooks.SessionStart.some((h) => hookEntryHasCommand(h, SEED_CHECK_HOOK_CMD))) {
    settings.hooks.SessionStart.unshift({
      matcher: '',
      hooks: [{ type: 'command', command: SEED_CHECK_HOOK_CMD }],
    });
  }

  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: TIMING_HOOK_CMD }] };
  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    settings.hooks[event] = removeHookCommands(settings.hooks[event], LEGACY_TIMING_HOOK_COMMANDS);
    const alreadyRegistered = settings.hooks[event].some((h) =>
      hookEntryHasCommand(h, TIMING_HOOK_CMD)
    );
    if (!alreadyRegistered) settings.hooks[event].push(hookEntry);
  }

  // #792 — direct-node guard entrypoints resolve via a node_modules →
  // repo-relative existence pick so they run (or fail closed + loud) even in a
  // node_modules-less worktree of this repo. First strip any legacy bare
  // `node node_modules/…/<guard>.mjs` commands, then register the `node -e`
  // fallback form. node_modules stays the first candidate, so a downstream
  // install's dispatch is byte-for-byte unchanged (AC3).
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
  settings.hooks.PreToolUse = removeHookCommands(
    settings.hooks.PreToolUse,
    LEGACY_GUARD_HOOK_COMMANDS
  );

  // bash-guard: PreToolUse hook that blocks bash commands referencing paths outside
  // the project tree. Allows all intra-project and system-binary paths; blocks anything
  // pointing at home-dir dotfiles, other projects, or truly destructive patterns.
  const guardCmd = guardBootstrapCommand('bash-guard');
  const guardEntry = { matcher: 'Bash', hooks: [{ type: 'command', command: guardCmd }] };
  const guardRegistered = settings.hooks.PreToolUse.some((h) =>
    h.hooks?.some((inner) => inner.command === guardCmd)
  );
  if (!guardRegistered) settings.hooks.PreToolUse.push(guardEntry);

  // agent-guard: PreToolUse hook on the `Agent` tool — refuses sub-agent
  // spawns when the orchestrator is running in the main git worktree.
  // Closes the spawn-class failure (epic #61): no override, no flag.
  const agentGuardCmd = guardBootstrapCommand('agent-guard');
  const agentGuardEntry = {
    matcher: 'Agent',
    hooks: [{ type: 'command', command: agentGuardCmd }],
  };
  const agentGuardRegistered = settings.hooks.PreToolUse.some((h) =>
    h.hooks?.some((inner) => inner.command === agentGuardCmd)
  );
  if (!agentGuardRegistered) settings.hooks.PreToolUse.push(agentGuardEntry);

  // activity-guard: PreToolUse hook that refuses tool calls whose activity
  // class is not permitted in the current Kanban state (epic #61, W2.2 / #65).
  // Two entries — Edit/Write/NotebookEdit matcher and a separate Bash matcher
  // chained after bash-guard. Either guard blocking is sufficient.
  const activityGuardCmd = guardBootstrapCommand('activity-guard');
  const activityEditEntry = {
    matcher: 'Edit|Write|NotebookEdit',
    hooks: [{ type: 'command', command: activityGuardCmd }],
  };
  const activityBashEntry = {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: activityGuardCmd }],
  };
  const activityEditRegistered = settings.hooks.PreToolUse.some(
    (h) =>
      h.matcher === 'Edit|Write|NotebookEdit' &&
      h.hooks?.some((inner) => inner.command === activityGuardCmd)
  );
  if (!activityEditRegistered) settings.hooks.PreToolUse.push(activityEditEntry);
  const activityBashRegistered = settings.hooks.PreToolUse.some(
    (h) => h.matcher === 'Bash' && h.hooks?.some((inner) => inner.command === activityGuardCmd)
  );
  if (!activityBashRegistered) settings.hooks.PreToolUse.push(activityBashEntry);

  // source-edit-gate (#327): PreToolUse hook on Edit/Write/NotebookEdit that
  // refuses non-allowlisted source edits when the bound issue is below
  // `develop` OR lacks both deep-dive markers. Bypassed when chore-mode is
  // active. Allowlist: `.tmp/**` and `.ai-task-manager/scratch/**`.
  const sourceEditGateCmd = guardBootstrapCommand('source-edit-gate');
  const sourceEditGateEntry = {
    matcher: 'Edit|Write|NotebookEdit',
    hooks: [{ type: 'command', command: sourceEditGateCmd }],
  };
  const sourceEditGateRegistered = settings.hooks.PreToolUse.some(
    (h) =>
      h.matcher === 'Edit|Write|NotebookEdit' &&
      h.hooks?.some((inner) => inner.command === sourceEditGateCmd)
  );
  if (!sourceEditGateRegistered) settings.hooks.PreToolUse.push(sourceEditGateEntry);

  // commit-trail: PostToolUse hook that appends a row to the bound issue's
  // `### 🔗 Commits` comment after each successful `git commit`.
  const trailEntry = {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: COMMIT_TRAIL_HOOK_CMD }],
  };
  if (!Array.isArray(settings.hooks.PostToolUse)) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse = removeHookCommands(
    settings.hooks.PostToolUse,
    LEGACY_COMMIT_TRAIL_HOOK_COMMANDS
  );
  const trailRegistered = settings.hooks.PostToolUse.some((h) =>
    hookEntryHasCommand(h, COMMIT_TRAIL_HOOK_CMD)
  );
  if (!trailRegistered) settings.hooks.PostToolUse.push(trailEntry);

  // EPIC #207 / #213 — Stop + UserPromptSubmit hooks. Idempotent: matched by
  // command string so re-running the installer does not duplicate entries.
  for (const [event, cmd] of [
    ['Stop', ON_STOP_HOOK_CMD],
    ['Stop', STOP_AUDIT_HOOK_CMD],
    ['UserPromptSubmit', ON_USER_PROMPT_HOOK_CMD],
  ]) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    const already = settings.hooks[event].some((h) => hookEntryHasCommand(h, cmd));
    if (!already) {
      settings.hooks[event].push({
        matcher: '',
        hooks: [{ type: 'command', command: cmd }],
      });
    }
  }

  // EPIC #238 / #240 — AskUserQuestion pause/resume hooks. Matched on the
  // tool name so they fire only around clarifying questions. Idempotent:
  // matched by command string so re-running the installer does not duplicate.
  for (const [event, cmd] of [
    ['PreToolUse', ON_ASK_PAUSE_HOOK_CMD],
    ['PostToolUse', ON_ASK_RESUME_HOOK_CMD],
  ]) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    const already = settings.hooks[event].some((h) => hookEntryHasCommand(h, cmd));
    if (!already) {
      settings.hooks[event].push({
        matcher: 'AskUserQuestion',
        hooks: [{ type: 'command', command: cmd }],
      });
    }
  }

  // #728 — always-loaded memory-index hook on SessionStart + PostCompact.
  // Installed ONLY when at least one memory-seed file was accepted at install.
  // Idempotent: matched by command string so re-running install never dupes.
  if (memoryIndexHook) {
    for (const event of ['SessionStart', 'PostCompact']) {
      if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
      const already = settings.hooks[event].some((h) =>
        hookEntryHasCommand(h, MEMORY_INDEX_HOOK_CMD)
      );
      if (!already) {
        settings.hooks[event].push({
          matcher: '',
          hooks: [{ type: 'command', command: MEMORY_INDEX_HOOK_CMD }],
        });
      }
    }
  }

  // Positive Bash allowlist (issue #199) — replaces the prior broad `Bash` allow.
  // The hooks above (bash-guard + activity-guard) remain in place as
  // defense-in-depth, but the primary security boundary is this enumerated
  // allowlist. Anything outside it will prompt the user. The canonical
  // source-of-truth lives in `bin/lib/claude-bash-allowlist.mjs`.
  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];
  // Migrate older installs that ship the broad `Bash` allow.
  settings.permissions.allow = settings.permissions.allow.filter((entry) => entry !== 'Bash');
  for (const entry of CLAUDE_BASH_ALLOWLIST) {
    if (!settings.permissions.allow.includes(entry)) settings.permissions.allow.push(entry);
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

export function patchCodexHooksJson(hooksPath) {
  let config = {};
  if (existsSync(hooksPath)) {
    try {
      config = JSON.parse(readFileSync(hooksPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  if (!config.hooks) config.hooks = {};

  function add(event, matcher, command, extra = {}) {
    if (!Array.isArray(config.hooks[event])) config.hooks[event] = [];
    const already = config.hooks[event].some((entry) => hookEntryHasCommand(entry, command));
    if (already) return;
    const entry = {
      ...extra,
      hooks: [{ type: 'command', command }],
    };
    if (matcher != null) entry.matcher = matcher;
    config.hooks[event].push(entry);
  }

  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    add(
      event,
      event === 'SessionStart' ? 'startup|resume|clear|compact' : 'manual|auto',
      TIMING_HOOK_CMD
    );
  }

  // #792 — strip any legacy bare `node node_modules/…/<guard>.mjs` PreToolUse
  // commands, then register the node_modules → repo-relative existence-pick
  // form so the guards run (or fail closed + loud) in a node_modules-less
  // worktree of this repo. node_modules stays first candidate → downstream
  // installs dispatch unchanged (AC3).
  if (Array.isArray(config.hooks.PreToolUse)) {
    config.hooks.PreToolUse = removeHookCommands(
      config.hooks.PreToolUse,
      LEGACY_GUARD_HOOK_COMMANDS
    );
  }
  add('PreToolUse', 'Bash', guardBootstrapCommand('bash-guard'));
  add('PreToolUse', 'Bash', guardBootstrapCommand('activity-guard'));
  add('PreToolUse', 'apply_patch|Edit|Write|NotebookEdit', guardBootstrapCommand('activity-guard'));
  add(
    'PreToolUse',
    'apply_patch|Edit|Write|NotebookEdit',
    guardBootstrapCommand('source-edit-gate')
  );
  add('PostToolUse', 'Bash', COMMIT_TRAIL_HOOK_CMD);

  add('Stop', null, ON_STOP_HOOK_CMD, { timeout: 30 });
  add('Stop', null, STOP_AUDIT_HOOK_CMD, { timeout: 30 });
  add('UserPromptSubmit', null, ON_USER_PROMPT_HOOK_CMD, { timeout: 30 });
  add('UserPromptSubmit', null, CODEX_PROMPT_TIMESTAMP_HOOK_CMD, { timeout: 30 });

  mkdirSync(dirname(hooksPath), { recursive: true });
  writeFileSync(hooksPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function patchGitignore(targetDir) {
  const gitignorePath = join(targetDir, '.gitignore');
  const entries = [
    // Machine-local/transient runtime state (state, queue, fleet, sessions,
    // locks, caches, per-provider app state) all live under `.tmp/aitm/` as of
    // #573 — covered wholesale by the `.tmp/` entry below. The skill-installed
    // templates + references/ now live tracked under `.ai-task-manager/templates/`
    // (#574); only their `.bak` edit backups still need explicit ignores here.
    '.ai-task-manager/templates/*.bak',
    '.ai-task-manager/templates/references/*.bak',
    '.tmp/',
  ];
  const COMMENT = '# ai-task-manager — local edit backups (do not commit)';
  let content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  let changed = false;
  for (const entry of entries) {
    if (!content.includes(entry)) {
      if (!changed && !content.includes(COMMENT)) {
        content += (content.endsWith('\n') || content === '' ? '' : '\n') + '\n' + COMMENT + '\n';
      }
      content += entry + '\n';
      changed = true;
    }
  }
  if (changed) writeFileSync(gitignorePath, content, 'utf8');
}

function installStub(file, content, label) {
  const { written } = writeIfChanged(file, content);
  ok(`${label} ${dim(relative(process.cwd(), file))}${written ? '' : ` ${dim('(unchanged)')}`}`);
}

function replaceWithSymlink(dest, src, label) {
  mkdirSync(dirname(dest), { recursive: true });
  let existing = null;
  try {
    existing = lstatSync(dest);
  } catch {
    /* absent */
  }
  if (existing) {
    if (existing.isSymbolicLink()) rmSync(dest);
    else
      throw new Error(
        `${dest} exists and is not a symlink; rerun with --link-mode stub or remove it manually`
      );
  }
  symlinkSync(src, dest, 'dir');
  ok(`${label} ${dim(relative(process.cwd(), dest))} -> ${dim(src)}`);
}

export function claudeStub() {
  return [
    '---',
    'name: task',
    'description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.',
    '---',
    '',
    '# Task',
    '',
    '## Step 0 — Verify worktree seeding (run before anything else)',
    '',
    'If this session runs in a git worktree, its `node_modules` may be absent, which',
    'breaks the skill reads below and silently redirects module resolution to the',
    'parent checkout. The SessionStart hook heals this automatically; if you have any',
    'doubt it ran, verify and self-heal before loading the skill:',
    '',
    '```bash',
    "node -e \"const{existsSync}=require('fs');const{resolve}=require('path');const{pathToFileURL}=require('url');const c=['node_modules/ai-task-manager/scripts/task-tracker/ensure-worktree-seeded.mjs','scripts/task-tracker/ensure-worktree-seeded.mjs'];const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);if(p){process.argv=[process.argv[0],p];import(pathToFileURL(p).href);}\"",
    '```',
    '',
    'Proceed to the Load-Once Procedure only once the self-link resolves to THIS worktree.',
    '',
    '## Load-Once Procedure',
    '',
    'Frequently-loaded skill files carry an `<!-- aitm-skill-version: X.Y.Z -->` marker.',
    'To avoid re-reading them every invocation:',
    '',
    '1. Read just the first ~10 lines of each file below to extract its marker version.',
    '2. Grep your current context for `aitm-skill-loaded:<id>:<version>`. If found, skip step 3 for that file.',
    '3. Read the full file. Then emit a single line in your reply: `aitm-skill-loaded:<id>:<version>` so future invocations in this conversation can detect the load.',
    '',
    'Files (id — path):',
    '',
    `- \`adapter\` — \`node_modules/ai-task-manager/${getProvider('claude').skillAdapterPath}\``,
    '- `shared` — `node_modules/ai-task-manager/skill/shared/SKILL.md`',
    '- `pickup` — `.ai-task-manager/templates/pickup-directive.md` (loaded on sub-issue pickup)',
    '',
    'After `/clear` or `/compact`, sentinels disappear from context and these files reload automatically.',
    'After `npm update ai-task-manager`, the marker version changes and reload is forced.',
    '',
    '## Canonical Source',
    '',
    'Load and follow the canonical Claude adapter instructions from:',
    '',
    `\`node_modules/ai-task-manager/${getProvider('claude').skillAdapterPath}\``,
    '',
    'Use executable scripts from:',
    '',
    '`node_modules/ai-task-manager/scripts/`',
    '',
  ].join('\n');
}

function codexStub() {
  return [
    '---',
    'name: task',
    'description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user asks to manage a task, start or close issue work, run /task commands, create backlog issues, track active work, log time, update task status, or inspect the active task fleet.',
    '---',
    '',
    '# Task',
    '',
    '## Step 0 — Verify worktree seeding (run before anything else)',
    '',
    'If this session runs in a git worktree, its `node_modules` may be absent, which',
    'breaks the skill reads below and silently redirects module resolution to the',
    'parent checkout. The SessionStart hook heals this automatically; if you have any',
    'doubt it ran, verify and self-heal before loading the skill:',
    '',
    '```bash',
    "node -e \"const{existsSync}=require('fs');const{resolve}=require('path');const{pathToFileURL}=require('url');const c=['node_modules/ai-task-manager/scripts/task-tracker/ensure-worktree-seeded.mjs','scripts/task-tracker/ensure-worktree-seeded.mjs'];const p=c.map(x=>resolve(process.cwd(),x)).find(existsSync);if(p){process.argv=[process.argv[0],p];import(pathToFileURL(p).href);}\"",
    '```',
    '',
    'Proceed to the Load-Once Procedure only once the self-link resolves to THIS worktree.',
    '',
    '## Load-Once Procedure',
    '',
    'Frequently-loaded skill files carry an `<!-- aitm-skill-version: X.Y.Z -->` marker.',
    'To avoid re-reading them every invocation:',
    '',
    '1. Read just the first ~10 lines of each file below to extract its marker version.',
    '2. Grep your current context for `aitm-skill-loaded:<id>:<version>`. If found, skip step 3 for that file.',
    '3. Read the full file. Then emit a single line in your reply: `aitm-skill-loaded:<id>:<version>` so future invocations in this conversation can detect the load.',
    '',
    'Files (id — path):',
    '',
    `- \`codex-adapter\` — \`node_modules/ai-task-manager/${getProvider('codex').skillAdapterPath}\``,
    '- `shared` — `node_modules/ai-task-manager/skill/shared/SKILL.md`',
    '- `pickup` — `.ai-task-manager/templates/pickup-directive.md` (loaded on issue pickup)',
    '',
    'After `/clear` or `/compact`, sentinels disappear from context and these files reload automatically.',
    'After `npm update ai-task-manager`, the marker version changes and reload is forced.',
    '',
    '## Canonical Source',
    '',
    'Load and follow the canonical Codex adapter instructions from:',
    '',
    `\`node_modules/ai-task-manager/${getProvider('codex').skillAdapterPath}\``,
    '',
    'Use executable scripts from:',
    '',
    '`node_modules/ai-task-manager/scripts/`',
    '',
  ].join('\n');
}

function installClaude(targetDir, linkMode, { memoryIndexHook = false } = {}) {
  step('Claude Code files');
  const skillDest = join(targetDir, getProvider('claude').installTarget);
  if (linkMode === 'symlink') {
    replaceWithSymlink(
      skillDest,
      join(PKG_ROOT, dirname(getProvider('claude').skillAdapterPath)),
      'Skill'
    );
  } else {
    installStub(join(skillDest, 'SKILL.md'), claudeStub(), 'Skill');
  }

  installStub(
    join(targetDir, '.claude', 'commands', 'task.md'),
    [
      'Invoke the `task` skill to handle this request. Pass along any arguments: $ARGUMENTS',
      '',
      '<!-- Canonical source: skill/shared/SKILL.md (State Transition Verb Map). Mirrored here for the verb-uniqueness verification grep. -->',
      '',
      '### State Transition Verb Map (8-state model)',
      '',
      'States: `Backlog → On Deck → Refine → Plan → Develop → Test → Review → Done`.',
      '',
      '- `/task refine #N --size <XS|S|M|L|XL> --estimate <hours> --priority <p0|p1|p2|p3> --reason "<text>"` — Backlog/On Deck → Refine with required fields.',
      '- `/task plan #N` — Refine → Plan (sprint-planning entry).',
      '- `/task promote` (or `/task next`) — advance one state generically.',
      '- `/task test #N` — Develop → Test (sandbox verification).',
      '- `/task approve #N` — write Plan-approval and review-approval markers.',
      '- `/task close` — Review → Done.',
      '',
      'Test → Review is automatic on verification pass — no dedicated CLI verb.',
      '',
    ].join('\n'),
    'Command'
  );

  // Lifecycle hooks are only installed when the active provider supports them.
  // Routed through `adapter.hookCapability` to remove the prior hard-coded
  // claude/codex fork at this call site (#203).
  if (getProvider('claude').hookCapability) {
    patchSettingsJson(join(targetDir, '.claude', 'settings.json'), { memoryIndexHook });
    ok(`Settings ${dim('.claude/settings.json')}`);
  }
}

function installCodex(targetDir, linkMode) {
  step('Codex files');
  const skillDest = join(targetDir, getProvider('codex').installTarget);
  if (linkMode === 'symlink') {
    replaceWithSymlink(
      skillDest,
      join(PKG_ROOT, dirname(getProvider('codex').skillAdapterPath)),
      'Skill'
    );
  } else {
    installStub(join(skillDest, 'SKILL.md'), codexStub(), 'Skill');
  }
  if (getProvider('codex').hookCapability) {
    patchCodexHooksJson(join(targetDir, '.codex', 'hooks.json'));
    ok(`Hooks ${dim('.codex/hooks.json')}`);
  }
}

function setupCodexSuperpowers(targetDir, { globalAgents = false } = {}) {
  step('Codex Superpowers bootstrap');
  const sourceRoot = findSuperpowersSkillRoot();
  if (!sourceRoot) {
    console.log(
      `  ${yellow('WARN')} Superpowers skills were not found in ${dim('~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills')}`
    );
    console.log(
      `       AITM install/init will continue. Install Claude Code Superpowers first, then rerun with ${cyan('--codex-superpowers')}.`
    );
    return;
  }

  const mirror = mirrorSuperpowerSkills({ sourceRoot });
  const copied = mirror.copied.length ? mirror.copied.join(', ') : 'none';
  const unchanged = mirror.unchanged.length ? mirror.unchanged.length : 0;
  ok(
    `Mirrored Superpowers skills to ${dim('~/.codex/skills')} ${dim(`copied: ${copied}; unchanged: ${unchanged}`)}`
  );
  if (mirror.missing.length) {
    console.log(
      `  ${yellow('WARN')} Missing optional Superpowers skills: ${mirror.missing.join(', ')}`
    );
  }

  const agentsPath = globalAgents
    ? join(homedir(), '.codex', 'AGENTS.md')
    : join(targetDir, 'AGENTS.md');
  const changed = updateAgentsFile(
    agentsPath,
    codexBootstrapBlock({ scope: globalAgents ? 'global' : 'repo' })
  );
  ok(
    `Bootstrap ${dim(globalAgents ? '~/.codex/AGENTS.md' : relative(process.cwd(), agentsPath))}${changed ? '' : ` ${dim('(unchanged)')}`}`
  );
  if (globalAgents) {
    console.log(
      `  ${yellow('NOTE')} Updated global Codex instructions because ${cyan('--codex-superpowers-global')} was set.`
    );
  }
}

function installTemplates(targetDir) {
  step('Shared templates and gitignore');
  const templateDest = join(targetDir, '.ai-task-manager');
  // Skill-installed markdown templates + references/ consolidate under
  // `.ai-task-manager/templates/` (#574); JSON config stays at the root.
  const mdTemplatesDest = join(templateDest, 'templates');
  mkdirSync(templateDest, { recursive: true });
  mkdirSync(mdTemplatesDest, { recursive: true });
  for (const name of TEMPLATE_FILES) {
    const src = join(PKG_ROOT, 'templates', name);
    const out = join(mdTemplatesDest, name);
    let suffix = '';
    if (existsSync(out)) {
      const existing = readFileSync(out, 'utf8');
      const bundled = readFileSync(src, 'utf8');
      if (existing !== bundled) {
        writeFileSync(out + '.bak', existing, 'utf8');
        suffix = ` ${yellow('(overwrote; previous saved as .bak)')}`;
      } else {
        suffix = ` ${dim('(unchanged)')}`;
      }
    }
    copyFileSync(src, out);
    ok(`Template ${dim('.ai-task-manager/templates/' + name)}${suffix}`);
  }
  for (const name of ['project-fields.json', 'project-field-events.json']) {
    const defaultName = name.replace('.json', '.default.json');
    const src = join(PKG_ROOT, 'config', defaultName);
    const out = join(templateDest, name);
    const bundled = readFileSync(src, 'utf8');
    if (!existsSync(out)) {
      // Tracked field config (#574) — route the initial emit through the shared
      // compare-before-write writer so re-running install never dirties the tree.
      writeIfChanged(out, bundled);
      ok(`Config ${dim('.ai-task-manager/' + name)}`);
      continue;
    }
    const existing = readFileSync(out, 'utf8');
    if (existing === bundled) {
      ok(`Config ${dim('.ai-task-manager/' + name)} ${dim('(unchanged)')}`);
      continue;
    }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
    const sidecar = join(templateDest, name.replace('.json', `.default.${stamp}.json`));
    writeFileSync(sidecar, bundled, 'utf8');
    ok(
      `Config ${dim('.ai-task-manager/' + name)} ${yellow('(kept; new default written beside it)')}`
    );
  }
  // activity-policy.json — write the bundled default only when absent. Existing
  // project policies are never overwritten (#70: idempotent + user-edit-preserving).
  {
    const policySrc = join(PKG_ROOT, 'config', 'activity-policy.default.json');
    const policyOut = join(templateDest, 'activity-policy.json');
    if (!existsSync(policyOut)) {
      copyFileSync(policySrc, policyOut);
      ok(`Config ${dim('.ai-task-manager/activity-policy.json')}`);
    } else {
      ok(`Config ${dim('.ai-task-manager/activity-policy.json')} ${dim('(unchanged)')}`);
    }
  }
  installReferences(mdTemplatesDest);
  patchGitignore(targetDir);
  ok(`Gitignore ${dim('.ai-task-manager/templates backups and .tmp/ runtime tree')}`);
  mergeDefaultPreferences(templateDest);
}

// Recursively copy templates/references/ -> .ai-task-manager/templates/references/
// using the same overwrite-with-.bak behavior as installTemplates(). Reference
// files are checked-in under templates/references/ so downstream consumers
// receive them at install time; the runtime copies are tracked (#574).
function installReferences(mdTemplatesDest) {
  const srcRoot = join(PKG_ROOT, 'templates', 'references');
  if (!existsSync(srcRoot)) return;
  const destRoot = join(mdTemplatesDest, 'references');
  mkdirSync(destRoot, { recursive: true });
  copyReferenceTree(srcRoot, destRoot, 'templates/references');
}

function copyReferenceTree(srcDir, destDir, displayPrefix) {
  for (const entry of readdirSync(srcDir)) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const display = `${displayPrefix}/${entry}`;
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyReferenceTree(srcPath, destPath, display);
      continue;
    }
    if (!st.isFile()) continue;
    let suffix = '';
    if (existsSync(destPath)) {
      const existing = readFileSync(destPath, 'utf8');
      const bundled = readFileSync(srcPath, 'utf8');
      if (existing !== bundled) {
        writeFileSync(destPath + '.bak', existing, 'utf8');
        suffix = ` ${yellow('(overwrote; previous saved as .bak)')}`;
      } else {
        suffix = ` ${dim('(unchanged)')}`;
      }
    }
    copyFileSync(srcPath, destPath);
    ok(`Reference ${dim('.ai-task-manager/' + display)}${suffix}`);
  }
}

function mergeDefaultPreferences(templateDest) {
  const cfgPath = join(templateDest, 'task-tracker.json');
  let cfg = {};
  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    } catch {
      cfg = {};
    }
  }
  const existing = cfg.preferences && typeof cfg.preferences === 'object' ? cfg.preferences : {};
  const merged = { ...PREFERENCE_DEFAULTS };
  for (const [k, v] of Object.entries(existing)) {
    if (!(k in PREFERENCE_DEFAULTS)) continue;
    const def = PREFERENCE_DEFAULTS[k];
    if (def && typeof def === 'object' && !Array.isArray(def)) {
      merged[k] = { ...def, ...(v && typeof v === 'object' ? v : {}) };
    } else {
      merged[k] = v;
    }
  }
  const before = JSON.stringify(cfg.preferences ?? null);
  cfg.preferences = merged;
  const after = JSON.stringify(cfg.preferences);
  if (before === after && existsSync(cfgPath)) {
    ok(
      `Preferences ${dim('.ai-task-manager/task-tracker.json#preferences')} ${dim('(unchanged)')}`
    );
    return;
  }
  mkdirSync(dirname(cfgPath), { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  ok(`Preferences ${dim('.ai-task-manager/task-tracker.json#preferences')}`);
}

function cmdVersion() {
  console.log(`${PKG_NAME} v${pkg.version}`);
}

// #728 — install-time opt-in memory-seed menu. Resolves the mode (flag ›
// interactive prompt › non-TTY `none` default), copies the accepted durable
// seed files into `.ai-task-manager/memory/`, and returns the accepted count so
// the caller can conditionally register the always-loaded index hook. The
// decision + write logic lives in `bin/lib/memory-seed-install.mjs`; this
// function owns only the console I/O.
async function installMemorySeed(targetDir, args) {
  step('Operational-lessons memory seed');
  const seedDir = join(PKG_ROOT, 'docs', 'ai-memory');
  const memoryDir = join(targetDir, '.ai-task-manager', 'memory');

  let mode = parseMemorySeedFlag(args);
  const isTty = Boolean(process.stdin.isTTY);
  if (!mode && !isTty) mode = 'none';

  const rl = mode ? null : createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  try {
    if (!mode) {
      const answer = (
        await ask(`  Install the bundled operational-lessons memory seed? [all / choose / none] `)
      )
        .trim()
        .toLowerCase();
      mode = ['all', 'choose', 'none'].includes(answer) ? answer : 'none';
    }

    if (mode === 'none') {
      ok(`Memory seed ${dim('(skipped — none)')}`);
      return 0;
    }

    let selectedFiles;
    if (mode === 'all') {
      selectedFiles = filesForMode(seedDir, 'all');
    } else {
      // choose — one selectable item per MEMORY.md bullet → its linked file.
      const memoryMd = existsSync(join(seedDir, 'MEMORY.md'))
        ? readFileSync(join(seedDir, 'MEMORY.md'), 'utf8')
        : '';
      const items = parseMemoryBullets(memoryMd, memorySeedFiles(seedDir));
      selectedFiles = [];
      for (const item of items) {
        const yes = (await ask(`    include "${item.title}"? [y/N] `)).trim().toLowerCase();
        if (yes === 'y' || yes === 'yes') selectedFiles.push(item.file);
      }
    }

    const { count } = writeMemorySeed({ seedDir, memoryDir, selectedFiles });
    ok(
      count > 0
        ? `Memory seed ${dim(`${count} fact(s) → .ai-task-manager/memory/`)}`
        : `Memory seed ${dim('(nothing selected)')}`
    );
    return count;
  } finally {
    if (rl) rl.close();
  }
}

async function cmdInstall(args) {
  let targetDir = process.cwd();
  const targetArg = parseOption(args, '--target');
  if (targetArg) targetDir = resolve(targetArg);

  const agent = parseOption(args, '--agent', 'both');
  const linkMode = parseOption(args, '--link-mode', 'stub');
  const enableCodexSuperpowers =
    hasFlag(args, '--codex-superpowers') || hasFlag(args, '--codex-superpowers-global');
  const globalCodexSuperpowers = hasFlag(args, '--codex-superpowers-global');
  if (!['claude', 'codex', 'both'].includes(agent)) {
    err(`Unknown --agent value "${agent}". Expected claude or codex.`);
    process.exit(1);
  }
  if (!['stub', 'symlink'].includes(linkMode)) {
    err(`Unknown --link-mode ${linkMode}. Expected stub or symlink.`);
    process.exit(1);
  }

  banner(`Installing ${PKG_NAME} v${pkg.version}`, `target: ${targetDir}`);

  step('Skill version markers');
  const stampResult = stampAllSkillVersions({
    pkgRoot: PKG_ROOT,
    version: pkg.version,
    logger: (e) => {
      if (e.kind === 'skipped') {
        ok(`${dim('skipped (dev package — would dirty source tree)')}`);
      } else if (e.kind === 'stamped') {
        if (e.reason === 'missing') {
          err(`${e.pkgRelPath} ${dim('(missing — not stamped)')}`);
        } else {
          ok(`${e.id.padEnd(8)} ${dim(e.pkgRelPath)}${e.changed ? '' : ` ${dim('(unchanged)')}`}`);
        }
      }
    },
  });
  // Surface a non-fatal warning if a target file is missing.
  if (!stampResult.skipped) {
    const missing = stampResult.results.filter((r) => r.reason === 'missing');
    if (missing.length) {
      console.log(
        `  ${yellow('WARN')} ${missing.length} skill detail file(s) missing — install may be incomplete.`
      );
    }
  }

  // #728 — resolve the memory-seed opt-in BEFORE installing Claude files so the
  // always-loaded index hook is registered only when ≥1 seed file was accepted.
  const memorySeedCount = await installMemorySeed(targetDir, args);
  const memoryIndexHook = memorySeedCount > 0;

  if (agent === 'claude' || agent === 'both')
    installClaude(targetDir, linkMode, { memoryIndexHook });
  if (agent === 'codex' || agent === 'both') installCodex(targetDir, linkMode);
  if ((agent === 'codex' || agent === 'both') && enableCodexSuperpowers) {
    setupCodexSuperpowers(targetDir, { globalAgents: globalCodexSuperpowers });
  }
  installTemplates(targetDir);

  console.log('');
  console.log(bgGreen(bold('  Install complete                                          ')));
  console.log('');
  console.log(`  ${bold('Next step')} ${dim('- configure your GitHub project:')}`);
  console.log('');
  console.log(`     ${cyan(bold('npx ai-task-manager init'))}`);
  if ((agent === 'codex' || agent === 'both') && !enableCodexSuperpowers) {
    console.log('');
    console.log(bgYellow(bold('  Optional: Codex workflow bootstrap                        ')));
    console.log(bgYellow('  Enable Superpowers skills for Codex agents:               '));
    console.log(bgYellow('                                                             '));
    console.log(
      bgYellow(`  ${bold('npx ai-task-manager install --codex-superpowers')}            `)
    );
    console.log('');
  }
  console.log('');
}

function cmdStatusline() {
  const home = homedir();
  const claudeDir = join(home, '.claude');
  const destScript = join(claudeDir, 'statusline.sh');
  const destSettings = join(claudeDir, 'settings.json');

  banner('Installing status line', 'target: ~/.claude/');

  step('Status line script');
  const srcScript = join(PKG_ROOT, 'statusline', 'statusline.sh');
  mkdirSync(claudeDir, { recursive: true });
  copyFileSync(srcScript, destScript);
  try {
    execFileSync('chmod', ['+x', destScript]);
  } catch {
    /* ignore on Windows */
  }
  ok(`Installed ${dim('~/.claude/statusline.sh')}`);

  step('User settings');
  let settings = {};
  if (existsSync(destSettings)) {
    try {
      settings = JSON.parse(readFileSync(destSettings, 'utf8'));
    } catch {
      /* ignore */
    }
  }
  if (typeof settings.statusLine === 'string') {
    settings.statusLine = { type: 'command', command: settings.statusLine };
  }
  settings.statusLine = { type: 'command', command: destScript };
  writeFileSync(destSettings, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  ok(`Updated ${dim('~/.claude/settings.json')}`);
}

function cmdInit(args) {
  let targetDir = process.cwd();
  const targetArg = parseOption(args, '--target');
  if (targetArg) targetDir = resolve(targetArg);
  const projectArg = parseOption(args, '--project') ?? parseOption(args, '--project-url');
  const enableCodexSuperpowers =
    hasFlag(args, '--codex-superpowers') || hasFlag(args, '--codex-superpowers-global');
  const globalCodexSuperpowers = hasFlag(args, '--codex-superpowers-global');

  const initScript = join(PKG_ROOT, 'scripts', 'gh', 'init-project-config.sh');

  try {
    const initArgs = [initScript, '--target', targetDir];
    if (projectArg) initArgs.push('--project', projectArg);
    execFileSync('bash', initArgs, { stdio: 'inherit' });
    if (enableCodexSuperpowers) {
      setupCodexSuperpowers(targetDir, { globalAgents: globalCodexSuperpowers });
    }
  } catch (e) {
    err(`Init failed: ${e.message}`);
    process.exit(1);
  }
}

function cmdRepair(args) {
  let targetDir = process.cwd();
  const targetArg = parseOption(args, '--target');
  if (targetArg) targetDir = resolve(targetArg);
  const repairScript = join(PKG_ROOT, 'scripts', 'gh', 'init-repair.mjs');
  banner('Repairing task-tracker config', `target: ${targetDir}`);
  try {
    execFileSync('node', [repairScript], {
      stdio: 'inherit',
      env: { ...process.env, AI_TASK_MANAGER_PROJECT_DIR: targetDir },
    });
  } catch (e) {
    err(`Repair failed: ${e.message}`);
    process.exit(1);
  }
}

// Behaviour-preserving seam (#651): the interactive prompt loop is extracted
// into a pure-ish function with an injected `ask` (question → Promise<string>)
// and `log`. The CLI wrapper supplies a readline-backed `ask`; unit tests inject
// a deterministic stub. Returns the persisted `preferences` object.
export async function configurePreferences({ targetDir, ask, log = console.log }) {
  const templateDest = join(targetDir, '.ai-task-manager');
  const cfgPath = join(templateDest, 'task-tracker.json');

  let cfg = {};
  if (existsSync(cfgPath)) {
    try {
      cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    } catch {
      cfg = {};
    }
  }
  const current =
    cfg.preferences && typeof cfg.preferences === 'object' ? { ...cfg.preferences } : {};

  banner('Configure project preferences', `target: ${targetDir}`);
  log(`  ${dim('Answers are written to .ai-task-manager/task-tracker.json#preferences.')}`);
  log(
    `  ${dim('Press Enter to keep the current value. These are team-shared and git-tracked.')}\n`
  );

  function boolDefault(key) {
    const val = key in current ? current[key] : PREFERENCE_DEFAULTS[key];
    return val ? 'Y/n' : 'y/N';
  }
  function parseBool(input, key) {
    const s = input.trim().toLowerCase();
    if (!s) return key in current ? current[key] : PREFERENCE_DEFAULTS[key];
    return ['y', 'yes', '1', 'true'].includes(s);
  }
  function strDefault(key, subKey) {
    if (subKey) {
      const sub = key in current ? current[key] : PREFERENCE_DEFAULTS[key];
      return (
        sub && sub[subKey] !== undefined ? sub[subKey] : PREFERENCE_DEFAULTS[key][subKey]
      ).toString();
    }
    return (key in current ? current[key] : PREFERENCE_DEFAULTS[key]).toString();
  }

  const updated = { ...PREFERENCE_DEFAULTS, ...current };
  if (updated.formatting && typeof updated.formatting !== 'object') updated.formatting = {};
  updated.formatting = { ...PREFERENCE_DEFAULTS.formatting, ...(current.formatting ?? {}) };

  updated.noPushToOrigin = parseBool(
    await ask(
      `  Solo project — never push to origin or open PRs? [${boolDefault('noPushToOrigin')}] `
    ),
    'noPushToOrigin'
  );
  updated.mainThreadOnly = parseBool(
    await ask(
      `  Main-thread-only — commit straight to trunk, no feature branches? [${boolDefault('mainThreadOnly')}] `
    ),
    'mainThreadOnly'
  );
  updated.driveSubIssuesToReview = parseBool(
    await ask(
      `  Drive sub-issues end-to-end to Review without per-step check-ins? [${boolDefault('driveSubIssuesToReview')}] `
    ),
    'driveSubIssuesToReview'
  );
  updated.pauseTimerOnBlockingQuestion = parseBool(
    await ask(
      `  Pause timer before asking blocking questions? [${boolDefault('pauseTimerOnBlockingQuestion')}] `
    ),
    'pauseTimerOnBlockingQuestion'
  );
  updated.noConfirmAfterDeepDive = parseBool(
    await ask(
      `  Skip "ready to proceed?" after deep dive? [${boolDefault('noConfirmAfterDeepDive')}] `
    ),
    'noConfirmAfterDeepDive'
  );
  updated.askGatesBeforeParallel = parseBool(
    await ask(
      `  Prompt which human gates to toggle before parallel dispatch? [${boolDefault('askGatesBeforeParallel')}] `
    ),
    'askGatesBeforeParallel'
  );
  const curNoEmojis = current.formatting?.noEmojis ?? PREFERENCE_DEFAULTS.formatting.noEmojis;
  const noEmojisInput = await ask(
    `  No emojis in issue bodies, comments, commits? [${curNoEmojis ? 'Y/n' : 'y/N'}] `
  );
  updated.formatting.noEmojis = (() => {
    const s = noEmojisInput.trim().toLowerCase();
    if (!s) return curNoEmojis;
    return ['y', 'yes', '1', 'true'].includes(s);
  })();

  const currInBt =
    current.formatting?.currencyInBackticks ?? PREFERENCE_DEFAULTS.formatting.currencyInBackticks;
  const cibInput = await ask(
    `  Wrap currency amounts in backticks (\`$200\`)? [${currInBt ? 'Y/n' : 'y/N'}] `
  );
  updated.formatting.currencyInBackticks = (() => {
    const s = cibInput.trim().toLowerCase();
    if (!s) return currInBt;
    return ['y', 'yes', '1', 'true'].includes(s);
  })();

  const scratchInput = await ask(
    `  Scratch directory for transient files? [${strDefault('scratchDir')}] `
  );
  updated.scratchDir = scratchInput.trim() || strDefault('scratchDir');

  cfg.preferences = updated;
  mkdirSync(templateDest, { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  log(`\n  ${green('✓')} Preferences saved to ${dim('.ai-task-manager/task-tracker.json')}`);
  return updated;
}

async function cmdConfigurePreferences(args) {
  let targetDir = process.cwd();
  const targetArg = parseOption(args, '--target');
  if (targetArg) targetDir = resolve(targetArg);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));
  try {
    await configurePreferences({ targetDir, ask });
  } finally {
    rl.close();
  }
}

// Only dispatch when invoked as a script — not when imported by tests (#212).
// Compare real paths so the bin-shim symlink (node_modules/.bin/ai-task-manager) resolves
// to the same path as import.meta.url (#227).
let invokedDirectly = false;
if (process.argv[1]) {
  try {
    invokedDirectly =
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    invokedDirectly = import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}
const [, , command = 'help', ...rest] = process.argv;

if (invokedDirectly)
  switch (command) {
    case 'version':
    case '-v':
    case '--version':
      cmdVersion();
      break;
    case 'install':
      cmdInstall(rest).catch((e) => {
        err(e.message);
        process.exit(1);
      });
      break;
    case 'init':
      cmdInit(rest);
      break;
    case 'repair':
      cmdRepair(rest);
      break;
    case 'statusline':
      cmdStatusline();
      break;
    case 'configure':
      if (rest[0] === 'preferences') {
        cmdConfigurePreferences(rest.slice(1)).catch((e) => {
          err(e.message);
          process.exit(1);
        });
      } else {
        err(
          `Unknown configure subcommand: ${rest[0] ?? '(none)'}. Try: npx ai-task-manager configure preferences`
        );
        process.exit(1);
      }
      break;
    default:
      console.log(`
${bgBlue(bold('  ai-task-manager  '))} ${dim('v' + pkg.version)}

  ${dim('Bind AI coding sessions to GitHub issues and track time, context, state, and completion workflow.')}

${bold('  Usage')}
    ${cyan('npx ai-task-manager install')}    ${dim('[--agent claude|codex] [--link-mode stub|symlink] [--codex-superpowers] [--codex-superpowers-global] [--target <dir>]')}
    ${cyan('npx ai-task-manager init')}       ${dim('[--target <dir>] [--project <url|owner:number>] [--codex-superpowers] [--codex-superpowers-global]')}
    ${cyan('npx ai-task-manager repair')}     ${dim('[--target <dir>] Backfill empty kanbanOption* fields in existing config')}
    ${cyan('npx ai-task-manager statusline')}              ${dim('Install Claude Code status line')}
    ${cyan('npx ai-task-manager configure preferences')}  ${dim('Interactive team-workflow preferences editor')}
    ${cyan('npx ai-task-manager version')}                ${dim('Print version')}

${bold('  Quickstart')}
    ${green('1.')} ${cyan('npx ai-task-manager install')}
    ${green('2.')} ${cyan('npx ai-task-manager init')}
    ${green('3.')} ${dim('Claude Code:')} ${magenta('/task #<issue-number>')}
    ${green('4.')} ${dim('Codex:')} ${magenta('Use the task skill to start issue #<issue-number>.')}
`);
  }
