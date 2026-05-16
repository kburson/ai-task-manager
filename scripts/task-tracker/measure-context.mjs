#!/usr/bin/env node
// Measure the agent-context cost of the task skill in three modes:
//   --idle              Tier-0 shim only (what sits in context with no /task call)
//   --invoked           shim + active adapter + router (first /task call this session)
//   --active <N>        invoked + pickup-directive + rule files typical for sub-issue N
//
// Token estimate: chars / 4 (industry-standard rough approximation for English).
// Budgets (Epic #114): idle ≤1,500, invoked ≤8,000, active ≤12,000.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, '..', '..');

const BUDGETS = { idle: 1500, invoked: 8000, active: 12000 };

const SHIM = 'skill/SKILL.md';
const ADAPTERS = {
  claude: 'skill/adapters/claude/SKILL.md',
  codex: 'skill/adapters/codex/SKILL.md',
};
const ROUTER = 'skill/shared/router.md';
const PICKUP = '.ai-task-manager/pickup-directive.md';
const RULES_DIR = 'skill/shared/rules';

const ACTIVE_DEFAULT_RULES = ['bind.md', 'state-walk.md'];

function tokens(rel) {
  const abs = path.join(REPO, rel);
  if (!existsSync(abs)) return { rel, chars: 0, tokens: 0, missing: true };
  const chars = readFileSync(abs, 'utf8').length;
  return { rel, chars, tokens: Math.ceil(chars / 4) };
}

function sum(files) {
  return files.reduce((acc, f) => acc + f.tokens, 0);
}

function fmt(label, files, budget) {
  const total = sum(files);
  const status = total <= budget ? 'OK' : 'OVER';
  const lines = [
    `${label}: ${total} tokens (budget ${budget}) [${status}]`,
    ...files.map(
      (f) => `  ${f.tokens.toString().padStart(6)}  ${f.rel}${f.missing ? '  (MISSING)' : ''}`
    ),
  ];
  return { total, status, text: lines.join('\n') };
}

function measure({ mode, adapter = 'claude', issue = null, extraRules = [] }) {
  const shim = [tokens(SHIM)];
  const invoked = [...shim, tokens(ADAPTERS[adapter]), tokens(ROUTER)];
  if (mode === 'idle') return fmt('idle', shim, BUDGETS.idle);
  if (mode === 'invoked') return fmt(`invoked (${adapter})`, invoked, BUDGETS.invoked);
  if (mode === 'active') {
    const ruleNames = [...ACTIVE_DEFAULT_RULES, ...extraRules];
    const ruleFiles = ruleNames.map((n) => tokens(path.join(RULES_DIR, n)));
    const all = [...invoked, tokens(PICKUP), ...ruleFiles];
    return fmt(`active${issue ? ` (#${issue})` : ''}`, all, BUDGETS.active);
  }
  throw new Error(`unknown mode: ${mode}`);
}

function parseArgs(argv) {
  const args = { mode: null, adapter: 'claude', issue: null, extraRules: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--idle') args.mode = 'idle';
    else if (a === '--invoked') args.mode = 'invoked';
    else if (a === '--active') {
      args.mode = 'active';
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args.issue = next.replace(/^#/, '');
        i++;
      }
    } else if (a === '--adapter') {
      args.adapter = argv[++i];
    } else if (a === '--rule') {
      args.extraRules.push(argv[++i]);
    } else if (a === '--all') {
      args.mode = 'all';
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    }
  }
  return args;
}

function help() {
  return `Usage: measure-context.mjs [--idle | --invoked | --active [N] | --all] [options]

Modes:
  --idle               Tier-0 shim only
  --invoked            shim + adapter + router
  --active [N]         invoked + pickup + typical rule files (default: bind, state-walk)
  --all                run all three modes

Options:
  --adapter <name>     claude | codex (default: claude)
  --rule <file.md>     extra Tier-2 rule file to include in --active (repeatable)
  --json               emit machine-readable JSON
  -h, --help           this text

Budgets: idle ${BUDGETS.idle}, invoked ${BUDGETS.invoked}, active ${BUDGETS.active}.`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.mode) {
    console.log(help());
    process.exit(args.help ? 0 : 2);
  }
  const modes = args.mode === 'all' ? ['idle', 'invoked', 'active'] : [args.mode];
  const results = modes.map((m) =>
    measure({ mode: m, adapter: args.adapter, issue: args.issue, extraRules: args.extraRules })
  );
  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) console.log(r.text);
  }
  const over = results.find((r) => r.status === 'OVER');
  process.exit(over ? 1 : 0);
}

export { measure, BUDGETS };

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
