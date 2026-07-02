#!/usr/bin/env node
// #413 — `aitm`: the operational orchestrator for the /task skill.
//
// One public entrypoint so neither the human nor the AI invokes a support
// script by its `node_modules/ai-task-manager/**/*.mjs` filepath. Every call is
// `npx aitm <name> <args>` — the same invocation a user would type.
//
// Routing (see bin/aitm-registry.mjs):
//   - <name> is a /task verb   → delegate to task-tracker.mjs <name> <args>
//   - <name> is an exposed script → spawn that script with <args>
//   - else                      → error listing available commands (names only)
//
// Delegation is child_process with inherited stdio and a passthrough exit code,
// so behavior is byte-identical to invoking the target directly. Zero logic is
// duplicated here. `aitm <name> help` / `aitm <name> ?` forwards the help token
// to the target, which self-documents (verbs via task-tracker's help flag,
// scripts via scripts/lib/self-doc.mjs).
//
// `ai-task-manager` (bin/cli.mjs) remains the installer/lifecycle CLI; `aitm`
// is the daily driver.
//
// #667 — help routing. This wrapper is the real `/task help` entrypoint, so it
// owns three help shapes and routes them to task-tracker's `verbHelp` renderer
// (the single source of the per-verb reference, topic grouping, state-transition
// map, and gate/evidence model):
//   - `aitm help` / `aitm`           → orchestrator command index (this file's
//                                       names-only listing, incl. scripts) THEN
//                                       the /task verb reference (verbHelp top).
//   - `aitm help <verb>`             → that verb's full page (verbHelp <verb>).
//   - `aitm <verb> help` / `<verb> ?`/`--help`/`-h` → that verb's full page.
// This is documentation-surface only — no verb's runtime behavior changes.

import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, TASK_TRACKER_PATH, SCRIPTS, kind, groupedListing } from './aitm-registry.mjs';

const HELP_NAMES = new Set(['help', '?', '--help', '-h', undefined, '']);
// Flag-shaped help tokens task-tracker already recognizes in any argv position.
const HELP_FLAGS = new Set(['--help', '-h', '?']);
// The bare word `help` — the canonical `aitm <name> help` self-doc token. It is
// NOT a flag, so task-tracker would otherwise swallow it as verb positional
// data; the verb router below normalizes it to `--help`.
const isHelpWord = (a) => a === 'help';

function printListing(write = (s) => process.stdout.write(s)) {
  const { verbs, scriptGroups } = groupedListing();
  const out = [];
  out.push('aitm — operational orchestrator for the /task skill.');
  out.push('');
  out.push('Usage: npx aitm <command> [args]    ·    npx aitm <command> help');
  out.push('');
  out.push('Workflow verbs (delegate to the /task state machine):');
  // Wrap the verb names at a sensible width; names only, never filepaths.
  let line = '  ';
  for (const v of verbs) {
    if ((line + v + ' ').length > 78) {
      out.push(line.replace(/\s+$/, ''));
      line = '  ';
    }
    line += v + ' ';
  }
  if (line.trim()) out.push(line.replace(/\s+$/, ''));
  out.push('');
  for (const group of Object.keys(scriptGroups).sort()) {
    out.push(`${group}:`);
    for (const { name, synopsis } of scriptGroups[group]) {
      out.push(`  ${name.padEnd(24)} ${synopsis}`);
    }
    out.push('');
  }
  out.push("Run `npx aitm <command> help` for a command's full API.");
  out.push('');
  write(out.join('\n'));
}

function delegate(targetPath, args) {
  const res = spawnSync(process.execPath, [targetPath, ...args], {
    stdio: 'inherit',
    shell: false,
    cwd: process.cwd(),
  });
  if (res.error) {
    process.stderr.write(
      `aitm: failed to launch ${path.basename(targetPath)}: ${res.error.message}\n`
    );
    return 1;
  }
  // Passthrough exit code (signal → 128+n convention).
  if (typeof res.status === 'number') return res.status;
  if (res.signal) return 1;
  return 0;
}

export function run(argv = process.argv.slice(2)) {
  const [name, ...rest] = argv;

  // Top-level help entry: bare invocation, or `help`/`?`/`--help`/`-h` as the
  // command. A trailing non-flag token selects a specific command to document.
  if (HELP_NAMES.has(name)) {
    const target = rest.find((a) => a && !HELP_FLAGS.has(a) && !isHelpWord(a));
    if (target) {
      // `aitm help <command>` → that command self-documents.
      if (kind(target) === 'script') {
        return delegate(path.join(REPO_ROOT, SCRIPTS[target].path), ['help']);
      }
      // A verb (or an unknown token → verbHelp falls back to the top-level
      // listing) routes through task-tracker's help renderer.
      return delegate(TASK_TRACKER_PATH, [target, '--help']);
    }
    // Bare top-level: the orchestrator command index (names-only, incl. scripts)
    // followed by the /task verb reference (topics + state map + gate model).
    printListing();
    return delegate(TASK_TRACKER_PATH, ['--help']);
  }

  const k = kind(name);
  if (k === 'verb') {
    // Canonical self-doc form is `aitm <verb> help`; normalize the bare `help`
    // word to the help flag task-tracker recognizes (it already honors ?/-h/
    // --help). Every other arg passes through untouched.
    const forwarded = rest.map((a) => (isHelpWord(a) ? '--help' : a));
    return delegate(TASK_TRACKER_PATH, [name, ...forwarded]);
  }
  if (k === 'script') {
    const target = path.join(REPO_ROOT, SCRIPTS[name].path);
    return delegate(target, rest);
  }

  process.stderr.write(`aitm: unknown command "${name}"\n\n`);
  printListing((s) => process.stderr.write(s));
  return 2;
}

// #506 — `npm`/`npx` installs `aitm` as a symlink (`node_modules/.bin/aitm ->
// ../ai-task-manager/bin/aitm.mjs`). `path.resolve` normalizes but does NOT
// dereference symlinks, so comparing the resolved `argv[1]` against the real
// module path made `isMain` false through the shim and the CLI ran nothing.
// Realpath both sides before comparing. Fail-closed (`false`) on any throw.
export function resolvesAsMain(moduleUrl, argvPath, { realpath = realpathSync } = {}) {
  try {
    if (!argvPath) return false;
    return realpath(fileURLToPath(moduleUrl)) === realpath(path.resolve(argvPath));
  } catch {
    return false;
  }
}

const isMain = resolvesAsMain(import.meta.url, process.argv[1]);

if (isMain) {
  process.exit(run());
}
