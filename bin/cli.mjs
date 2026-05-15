#!/usr/bin/env node
// npx ai-task-manager <command> [options]
// Commands: install, init, statusline, version

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { createInterface } from 'node:readline';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  symlinkSync,
  rmSync,
  lstatSync,
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
import { PREFERENCE_DEFAULTS } from '../scripts/task-tracker/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const PKG_NAME = 'ai-task-manager';
const LEGACY_BIN = 'claude-gh-task-manager';

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

const TIMING_HOOK_CMD = 'node node_modules/ai-task-manager/scripts/task-tracker/hook-handler.mjs';
const COMMIT_TRAIL_HOOK_CMD =
  'node node_modules/ai-task-manager/scripts/task-tracker/commit-trail-handler.mjs';
const LEGACY_TIMING_HOOK_COMMANDS = [
  '.claude/hooks/task-tracker.sh',
  'node node_modules/ai-task-manager/hooks/hook-handler.mjs',
];
const LEGACY_COMMIT_TRAIL_HOOK_COMMANDS = ['.claude/hooks/commit-trail.sh'];

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

function patchSettingsJson(settingsPath) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      /* ignore */
    }
  }

  if (!settings.hooks) settings.hooks = {};

  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: TIMING_HOOK_CMD }] };
  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    settings.hooks[event] = removeHookCommands(settings.hooks[event], LEGACY_TIMING_HOOK_COMMANDS);
    const alreadyRegistered = settings.hooks[event].some((h) =>
      hookEntryHasCommand(h, TIMING_HOOK_CMD)
    );
    if (!alreadyRegistered) settings.hooks[event].push(hookEntry);
  }

  // bash-guard: PreToolUse hook that blocks bash commands referencing paths outside
  // the project tree. Allows all intra-project and system-binary paths; blocks anything
  // pointing at home-dir dotfiles, other projects, or truly destructive patterns.
  const guardCmd = 'node node_modules/ai-task-manager/scripts/task-tracker/bash-guard.mjs';
  const guardEntry = { matcher: 'Bash', hooks: [{ type: 'command', command: guardCmd }] };
  if (!Array.isArray(settings.hooks.PreToolUse)) settings.hooks.PreToolUse = [];
  const guardRegistered = settings.hooks.PreToolUse.some((h) =>
    h.hooks?.some((inner) => inner.command === guardCmd)
  );
  if (!guardRegistered) settings.hooks.PreToolUse.push(guardEntry);

  // agent-guard: PreToolUse hook on the `Agent` tool — refuses sub-agent
  // spawns when the orchestrator is running in the main git worktree.
  // Closes the spawn-class failure (epic #61): no override, no flag.
  const agentGuardCmd = 'node node_modules/ai-task-manager/scripts/task-tracker/agent-guard.mjs';
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
  const activityGuardCmd =
    'node node_modules/ai-task-manager/scripts/task-tracker/activity-guard.mjs';
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

  // Allow all Bash without prompting — the bash-guard hook above enforces path scope
  // so per-command permission prompts add friction without meaningful security benefit.
  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];
  if (!settings.permissions.allow.includes('Bash')) settings.permissions.allow.push('Bash');

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function patchGitignore(targetDir) {
  const gitignorePath = join(targetDir, '.gitignore');
  const entries = [
    '.ai-task-manager/task-tracker-state.json',
    '.ai-task-manager/task-tracker-queue.json',
    '.ai-task-manager/task-fleet.json',
    '.ai-task-manager/pickup-directive.md.bak',
    '.ai-task-manager/definition-of-done.md.bak',
    '.claude/task-tracker.json',
    '.claude/task-tracker-state.json',
    '.claude/task-tracker-queue.json',
    '.claude/task-fleet.json',
    'tmp/',
  ];
  const COMMENT = '# ai-task-manager — user configuration files (do not commit)';
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

function writeIfChanged(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  if (existsSync(file) && readFileSync(file, 'utf8') === content) return false;
  writeFileSync(file, content, 'utf8');
  return true;
}

function installStub(file, content, label) {
  const changed = writeIfChanged(file, content);
  ok(`${label} ${dim(relative(process.cwd(), file))}${changed ? '' : ` ${dim('(unchanged)')}`}`);
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

function claudeStub() {
  return [
    '---',
    'name: task',
    'description: Bind AI work sessions to GitHub issues and track time, context words, state, and completion workflow. Use when the user types /task with no args or followed by #N, new, plan, resume, pause, update, close, log, check, fleet, or config.',
    '---',
    '',
    '# Task',
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
    '- `adapter` — `node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`',
    '- `shared` — `node_modules/ai-task-manager/skill/shared/SKILL.md`',
    '- `pickup` — `.ai-task-manager/pickup-directive.md` (loaded on sub-issue pickup)',
    '',
    'After `/clear` or `/compact`, sentinels disappear from context and these files reload automatically.',
    'After `npm update ai-task-manager`, the marker version changes and reload is forced.',
    '',
    '## Canonical Source',
    '',
    'Load and follow the canonical Claude adapter instructions from:',
    '',
    '`node_modules/ai-task-manager/skill/adapters/claude/SKILL.md`',
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
    'Load and follow the canonical Codex adapter instructions from:',
    '',
    '`node_modules/ai-task-manager/skill/adapters/codex/SKILL.md`',
    '',
    'Use executable scripts from:',
    '',
    '`node_modules/ai-task-manager/scripts/`',
    '',
  ].join('\n');
}

function installClaude(targetDir, linkMode) {
  step('Claude Code files');
  const skillDest = join(targetDir, '.claude', 'skills', 'task');
  if (linkMode === 'symlink') {
    replaceWithSymlink(skillDest, join(PKG_ROOT, 'skill', 'adapters', 'claude'), 'Skill');
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
      '### State Transition Verb Map (7-state model)',
      '',
      'States: `Backlog → Refine → Plan → Develop → Test → Review → Done`.',
      '',
      '- `/task promote` (or `/task next`) — walk forward one state (Backlog → Refine → Plan → Develop)',
      '- `/task approve` — writes the Plan-approval and review-approval markers (human gate)',
      '- `/task review` — Develop → Test; auto-promotes to Review when verification passes, reverts to Develop on failure',
      '- `/task close` — Review → Done',
      '',
      'Test → Review is automatic on verification pass — no CLI verb.',
      '',
    ].join('\n'),
    'Command'
  );

  patchSettingsJson(join(targetDir, '.claude', 'settings.json'));
  ok(`Settings ${dim('.claude/settings.json')}`);
}

function installCodex(targetDir, linkMode) {
  step('Codex files');
  const skillDest = join(targetDir, '.agents', 'skills', 'task');
  if (linkMode === 'symlink') {
    replaceWithSymlink(skillDest, join(PKG_ROOT, 'skill', 'adapters', 'codex'), 'Skill');
  } else {
    installStub(join(skillDest, 'SKILL.md'), codexStub(), 'Skill');
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
  mkdirSync(templateDest, { recursive: true });
  for (const name of [
    'pickup-directive.md',
    'definition-of-done.md',
    'epic-body.md',
    'sub-issue-body.md',
    'solo-issue-body.md',
  ]) {
    const src = join(PKG_ROOT, 'templates', name);
    const out = join(templateDest, name);
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
    ok(`Template ${dim('.ai-task-manager/' + name)}${suffix}`);
  }
  for (const name of ['project-fields.json', 'project-field-events.json']) {
    const defaultName = name.replace('.json', '.default.json');
    const src = join(PKG_ROOT, 'config', defaultName);
    const out = join(templateDest, name);
    const bundled = readFileSync(src, 'utf8');
    if (!existsSync(out)) {
      copyFileSync(src, out);
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
  patchGitignore(targetDir);
  ok(`Gitignore ${dim('.ai-task-manager state and legacy .claude state')}`);
  mergeDefaultPreferences(templateDest);
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

function cmdInstall(args) {
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

  if (agent === 'claude' || agent === 'both') installClaude(targetDir, linkMode);
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

async function cmdConfigurePreferences(args) {
  let targetDir = process.cwd();
  const targetArg = parseOption(args, '--target');
  if (targetArg) targetDir = resolve(targetArg);
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
  console.log(`  ${dim('Answers are written to .ai-task-manager/task-tracker.json#preferences.')}`);
  console.log(
    `  ${dim('Press Enter to keep the current value. These are team-shared and git-tracked.')}\n`
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

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

  rl.close();

  cfg.preferences = updated;
  mkdirSync(templateDest, { recursive: true });
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(
    `\n  ${green('✓')} Preferences saved to ${dim('.ai-task-manager/task-tracker.json')}`
  );
}

const [, , command = 'help', ...rest] = process.argv;

switch (command) {
  case 'version':
  case '-v':
  case '--version':
    cmdVersion();
    break;
  case 'install':
    cmdInstall(rest);
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

${bold('  Compatibility')}
    ${cyan(`npx ${LEGACY_BIN} <command>`)} ${dim('continues to work as a bin alias for this release')}

${bold('  Quickstart')}
    ${green('1.')} ${cyan('npx ai-task-manager install')}
    ${green('2.')} ${cyan('npx ai-task-manager init')}
    ${green('3.')} ${dim('Claude Code:')} ${magenta('/task #<issue-number>')}
    ${green('4.')} ${dim('Codex:')} ${magenta('Use the task skill to start issue #<issue-number>.')}
`);
}
