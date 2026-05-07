#!/usr/bin/env node
// npx ai-task-manager <command> [options]
// Commands: install, init, statusline, version

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync,
  symlinkSync, rmSync, lstatSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import {
  findSuperpowersSkillRoot,
  mirrorSuperpowerSkills,
  codexBootstrapBlock,
  updateAgentsFile,
} from '../scripts/task-tracker/codex-superpowers.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const PKG_NAME = 'ai-task-manager';
const LEGACY_BIN = 'claude-gh-task-manager';

function bold(s)    { return `\x1b[1m${s}\x1b[0m`; }
function dim(s)     { return `\x1b[2m${s}\x1b[0m`; }
function green(s)   { return `\x1b[32m${s}\x1b[0m`; }
function red(s)     { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s)  { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s)    { return `\x1b[36m${s}\x1b[0m`; }
function magenta(s) { return `\x1b[35m${s}\x1b[0m`; }
function bgBlue(s)  { return `\x1b[44m\x1b[97m${s}\x1b[0m`; }
function bgGreen(s) { return `\x1b[42m\x1b[30m${s}\x1b[0m`; }

function ok(msg)   { console.log(`  ${green('OK')} ${msg}`); }
function err(msg)  { console.error(`  ${red('ERR')} ${msg}`); }

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

function patchSettingsJson(settingsPath) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* ignore */ }
  }

  if (!settings.hooks) settings.hooks = {};

  const hookScript = '.claude/hooks/task-tracker.sh';
  const hookEntry = { matcher: '', hooks: [{ type: 'command', command: hookScript }] };

  for (const event of ['SessionStart', 'PreCompact', 'PostCompact']) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
    const alreadyRegistered = settings.hooks[event].some(
      h => h.command === hookScript ||
           (typeof h === 'string' && h === hookScript) ||
           h.hooks?.some(inner => inner.command === hookScript)
    );
    if (!alreadyRegistered) settings.hooks[event].push(hookEntry);
  }

  const autoAllowRules = [
    'Bash(node */ai-task-manager/scripts/task-tracker/task-tracker.mjs*)',
    'Bash(node */ai-task-manager/scripts/task-tracker/preflight-issue.mjs*)',
    'Bash(*/ai-task-manager/scripts/gh/move-state.sh*)',
    'Bash(*/ai-task-manager/scripts/gh/set-priority.sh*)',
    'Bash(node */claude-gh-task-manager/scripts/task-tracker/task-tracker.mjs*)',
    'Bash(node */claude-gh-task-manager/scripts/task-tracker/preflight-issue.mjs*)',
  ];
  if (!settings.permissions) settings.permissions = {};
  if (!Array.isArray(settings.permissions.allow)) settings.permissions.allow = [];
  for (const rule of autoAllowRules) {
    if (!settings.permissions.allow.includes(rule)) settings.permissions.allow.push(rule);
  }

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
  try { existing = lstatSync(dest); } catch { /* absent */ }
  if (existing) {
    if (existing.isSymbolicLink()) rmSync(dest);
    else throw new Error(`${dest} exists and is not a symlink; rerun with --link-mode stub or remove it manually`);
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

  const hookStubPath = join(targetDir, '.claude', 'hooks', 'task-tracker.sh');
  const hookStub = [
    '#!/usr/bin/env bash',
    `# Generated by ${PKG_NAME} install - do not edit.`,
    `PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"`,
    `PKG="$PROJECT_ROOT/node_modules/${PKG_NAME}"`,
    'export AI_TASK_MANAGER_PROJECT_DIR="$PROJECT_ROOT"',
    'exec bash "$PKG/hooks/task-tracker.sh"',
    '',
  ].join('\n');
  writeIfChanged(hookStubPath, hookStub);
  try { execFileSync('chmod', ['+x', hookStubPath]); } catch { /* ignore on Windows */ }
  ok(`Hook ${dim('.claude/hooks/task-tracker.sh (stub -> node_modules)')}`);

  installStub(
    join(targetDir, '.claude', 'commands', 'task.md'),
    'Invoke the `task` skill to handle this request. Pass along any arguments: $ARGUMENTS\n',
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
    console.log(`  ${yellow('WARN')} Superpowers skills were not found in ${dim('~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills')}`);
    console.log(`       AITM install/init will continue. Install Claude Code Superpowers first, then rerun with ${cyan('--codex-superpowers')}.`);
    return;
  }

  const mirror = mirrorSuperpowerSkills({ sourceRoot });
  const copied = mirror.copied.length ? mirror.copied.join(', ') : 'none';
  const unchanged = mirror.unchanged.length ? mirror.unchanged.length : 0;
  ok(`Mirrored Superpowers skills to ${dim('~/.codex/skills')} ${dim(`copied: ${copied}; unchanged: ${unchanged}`)}`);
  if (mirror.missing.length) {
    console.log(`  ${yellow('WARN')} Missing optional Superpowers skills: ${mirror.missing.join(', ')}`);
  }

  const agentsPath = globalAgents
    ? join(homedir(), '.codex', 'AGENTS.md')
    : join(targetDir, 'AGENTS.md');
  const changed = updateAgentsFile(agentsPath, codexBootstrapBlock({ scope: globalAgents ? 'global' : 'repo' }));
  ok(`Bootstrap ${dim(globalAgents ? '~/.codex/AGENTS.md' : relative(process.cwd(), agentsPath))}${changed ? '' : ` ${dim('(unchanged)')}`}`);
  if (globalAgents) {
    console.log(`  ${yellow('NOTE')} Updated global Codex instructions because ${cyan('--codex-superpowers-global')} was set.`);
  }
}

function installTemplates(targetDir) {
  step('Shared templates and gitignore');
  const templateDest = join(targetDir, '.ai-task-manager');
  mkdirSync(templateDest, { recursive: true });
  for (const name of ['pickup-directive.md', 'definition-of-done.md']) {
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
    ok(`Config ${dim('.ai-task-manager/' + name)} ${yellow('(kept; new default written beside it)')}`);
  }
  patchGitignore(targetDir);
  ok(`Gitignore ${dim('.ai-task-manager state and legacy .claude state')}`);
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
  const enableCodexSuperpowers = hasFlag(args, '--codex-superpowers') || hasFlag(args, '--codex-superpowers-global');
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
    console.log(`  ${dim('Optional Codex workflow bootstrap:')} ${cyan('npx ai-task-manager install --codex-superpowers')}`);
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
  try { execFileSync('chmod', ['+x', destScript]); } catch { /* ignore on Windows */ }
  ok(`Installed ${dim('~/.claude/statusline.sh')}`);

  step('User settings');
  let settings = {};
  if (existsSync(destSettings)) {
    try { settings = JSON.parse(readFileSync(destSettings, 'utf8')); } catch { /* ignore */ }
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
  const enableCodexSuperpowers = hasFlag(args, '--codex-superpowers') || hasFlag(args, '--codex-superpowers-global');
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

const [,, command = 'help', ...rest] = process.argv;

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
  case 'statusline':
    cmdStatusline();
    break;
  default:
    console.log(`
${bgBlue(bold('  ai-task-manager  '))} ${dim('v' + pkg.version)}

  ${dim('Bind AI coding sessions to GitHub issues and track time, context, state, and completion workflow.')}

${bold('  Usage')}
    ${cyan('npx ai-task-manager install')}    ${dim('[--agent claude|codex] [--link-mode stub|symlink] [--codex-superpowers] [--codex-superpowers-global] [--target <dir>]')}
    ${cyan('npx ai-task-manager init')}       ${dim('[--target <dir>] [--project <url|owner:number>] [--codex-superpowers] [--codex-superpowers-global]')}
    ${cyan('npx ai-task-manager statusline')} ${dim('Install Claude Code status line')}
    ${cyan('npx ai-task-manager version')}    ${dim('Print version')}

${bold('  Compatibility')}
    ${cyan(`npx ${LEGACY_BIN} <command>`)} ${dim('continues to work as a bin alias for this release')}

${bold('  Quickstart')}
    ${green('1.')} ${cyan('npx ai-task-manager install')}
    ${green('2.')} ${cyan('npx ai-task-manager init')}
    ${green('3.')} ${dim('Claude Code:')} ${magenta('/task #<issue-number>')}
    ${green('4.')} ${dim('Codex:')} ${magenta('Use the task skill to start issue #<issue-number>.')}
`);
}
