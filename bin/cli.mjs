#!/usr/bin/env node
// npx claude-gh-task-manager <command> [options]
// Commands: install, init, version

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// ── helpers ─────────────────────────────────────────────────────────────────

function bold(s)  { return `\x1b[1m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }

function ok(msg)  { console.log(`  ${green('✓')}  ${msg}`); }
function err(msg) { console.error(`  ${red('✗')}  ${msg}`); }

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function patchSettingsJson(settingsPath) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { /* ignore */ }
  }

  if (!settings.hooks) settings.hooks = {};

  const hookScript = '.claude/hooks/task-tracker.sh';
  const hookEntry = { type: 'command', command: hookScript };

  const eventNames = ['SessionStart', 'PreCompact', 'PostCompact'];
  for (const event of eventNames) {
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = [];
    }
    const alreadyRegistered = settings.hooks[event].some(
      h => h.command === hookScript || (typeof h === 'string' && h === hookScript)
    );
    if (!alreadyRegistered) {
      settings.hooks[event].push(hookEntry);
    }
  }

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function dirname2(p) {
  // re-export of path.dirname for clarity
  return join(p, '..');
}

// ── commands ─────────────────────────────────────────────────────────────────

function cmdVersion() {
  console.log(`claude-gh-task-manager v${pkg.version}`);
}

function cmdInstall(args) {
  let targetDir = process.cwd();
  const tIdx = args.indexOf('--target');
  if (tIdx !== -1 && args[tIdx + 1]) {
    targetDir = resolve(args[tIdx + 1]);
  }

  console.log('');
  console.log(bold('Installing claude-gh-task-manager'));
  console.log(dim(`  → ${targetDir}`));
  console.log('');

  // 1. Skill
  const skillDest = join(targetDir, '.claude', 'skills', 'task');
  mkdirSync(skillDest, { recursive: true });
  copyFileSync(join(PKG_ROOT, 'skill', 'SKILL.md'), join(skillDest, 'SKILL.md'));
  ok(`Skill:    .claude/skills/task/SKILL.md`);

  // 2. Design doc alongside skill (for the SKILL.md reference)
  copyFileSync(join(PKG_ROOT, 'docs', 'DESIGN.md'), join(skillDest, 'DESIGN.md'));
  ok(`Design:   .claude/skills/task/DESIGN.md`);

  // 3. Hook
  const hookDest = join(targetDir, '.claude', 'hooks');
  mkdirSync(hookDest, { recursive: true });
  copyFileSync(join(PKG_ROOT, 'hooks', 'task-tracker.sh'), join(hookDest, 'task-tracker.sh'));
  // Ensure executable
  try { execFileSync('chmod', ['+x', join(hookDest, 'task-tracker.sh')]); } catch { /* ignore on Windows */ }
  ok(`Hook:     .claude/hooks/task-tracker.sh`);

  // 4. Scripts — task-tracker
  const ttSrc = join(PKG_ROOT, 'scripts', 'task-tracker');
  const ttDest = join(targetDir, 'scripts', 'task-tracker');
  copyDir(ttSrc, ttDest);
  ok(`Scripts:  scripts/task-tracker/`);

  // 5. Scripts — gh helpers
  const ghSrc = join(PKG_ROOT, 'scripts', 'gh');
  const ghDest = join(targetDir, 'scripts', 'gh');
  mkdirSync(ghDest, { recursive: true });
  for (const f of readdirSync(ghSrc)) {
    const src = join(ghSrc, f);
    const dest = join(ghDest, f);
    // Don't overwrite existing user-customised gh scripts
    if (!existsSync(dest)) {
      copyFileSync(src, dest);
      try { execFileSync('chmod', ['+x', dest]); } catch { /* ignore */ }
    } else {
      console.log(`  ${dim('○')}  Skipped (exists): scripts/gh/${f}`);
    }
  }
  ok(`Scripts:  scripts/gh/ (move-state.sh, set-priority.sh, init-project-config.sh)`);

  // 6. Patch .claude/settings.json
  const settingsPath = join(targetDir, '.claude', 'settings.json');
  patchSettingsJson(settingsPath);
  ok(`Hooks:    registered in .claude/settings.json`);

  console.log('');
  console.log(bold('Next step — configure your GitHub project:'));
  console.log('');
  console.log('  npx claude-gh-task-manager init');
  console.log('');
  console.log(dim('Or, from inside the project directory:'));
  console.log(dim('  bash scripts/gh/init-project-config.sh'));
  console.log('');
}

function cmdInit(args) {
  let targetDir = process.cwd();
  const tIdx = args.indexOf('--target');
  if (tIdx !== -1 && args[tIdx + 1]) {
    targetDir = resolve(args[tIdx + 1]);
  }

  const initScript = join(targetDir, 'scripts', 'gh', 'init-project-config.sh');
  if (!existsSync(initScript)) {
    err(`init script not found at: ${initScript}`);
    err('Run "npx claude-gh-task-manager install" first.');
    process.exit(1);
  }

  try {
    execFileSync('bash', [initScript, '--target', targetDir], { stdio: 'inherit' });
  } catch (e) {
    err(`Init failed: ${e.message}`);
    process.exit(1);
  }
}

// ── dispatch ─────────────────────────────────────────────────────────────────

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

  default:
    console.log(`
${bold('claude-gh-task-manager')} v${pkg.version}

Bind Claude Code sessions to GitHub issues and auto-log time + context words.

${bold('Usage:')}
  npx claude-gh-task-manager install [--target <dir>]   Copy files into your project
  npx claude-gh-task-manager init    [--target <dir>]   Configure GitHub project IDs
  npx claude-gh-task-manager version                    Print version

${bold('Quickstart:')}
  npx claude-gh-task-manager install
  npx claude-gh-task-manager init
  # Then in Claude Code: /task #<issue-number>
`);
}
