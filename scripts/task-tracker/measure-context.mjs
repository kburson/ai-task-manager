#!/usr/bin/env node
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'measure-context');
// Measure the agent-context cost of the task skill in named scenarios:
//
// Foundational modes (back-compat with Epic #114):
//   --idle               Tier-0 shim only (no /task call this session)
//   --invoked            shim + active adapter + router (first /task call)
//   --active [N]         invoked + pickup-directive + bind/state-walk (default scenario)
//
// Named scenarios (#202):
//   --scenario bind                       alias for --active (pickup + bind + state-walk)
//   --scenario bind+review+close          invoked + pickup + bind + state-walk + review +
//                                         close + commit-trail (full single-issue lifecycle)
//   --scenario parallel-orchestration     invoked + pickup + parallel + bind + state-walk
//                                         (orchestrator fanning out to sub-agents)
//
//   --all                Runs historical and fixed release scenarios for the selected adapter.
//                        Non-zero exit if any scenario breaches its budget.
//
// Token estimate: chars / 4 (industry-standard rough approximation for English).
//
// Pickup-directive source: prefers runtime `.ai-task-manager/templates/pickup-directive.md`
// (installed by `ai-task-manager init`) and falls back to `templates/pickup-directive.md`
// (source-of-truth), so CI and pre-install checks both work.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { RUNTIME_REL } from './paths.mjs';
import {
  GUIDANCE_CONTEXT_BUDGETS,
  HISTORICAL_CONTEXT_BUDGETS as BUDGETS,
  HISTORICAL_SCENARIO_BUDGETS as SCENARIO_BUDGETS,
} from './lib/context-budgets.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dir, '..', '..');

const SHIM = 'skill/SKILL.md';
const ADAPTERS = {
  claude: 'skill/adapters/claude/SKILL.md',
  codex: 'skill/adapters/codex/SKILL.md',
};
const ROUTER = 'skill/shared/router.md';
const RULES_DIR = 'skill/shared/rules';

// Pickup-directive candidates, in preference order: runtime install, then source template.
const PICKUP_CANDIDATES = [RUNTIME_REL.pickupDirective, 'templates/pickup-directive.md'];

// Scenario definitions: rule files (under skill/shared/rules) loaded alongside the
// pickup directive. Add new scenarios here.
const SCENARIOS = {
  bind: ['bind.md', 'state-walk.md'],
  'bind+review+close': ['bind.md', 'state-walk.md', 'review.md', 'close.md', 'commit-trail.md'],
  'parallel-orchestration': ['parallel.md', 'bind.md', 'state-walk.md'],
};

const SCENARIO_NAMES = Object.keys(SCENARIOS);
const RELEASE_SCENARIOS = Object.freeze({
  'invoked+pickup': 'routerPlusPickup',
  'bind+review+close': 'fullLifecycle',
});

function resolvePickup() {
  for (const rel of PICKUP_CANDIDATES) {
    const abs = path.join(REPO, rel);
    if (existsSync(abs)) return rel;
  }
  return PICKUP_CANDIDATES[PICKUP_CANDIDATES.length - 1];
}

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
  const headroom = budget - total;
  const headroomPct = budget > 0 ? ((headroom / budget) * 100).toFixed(1) : '0.0';
  const lines = [
    `${label}: ${total} tokens (budget ${budget}, headroom ${headroom} / ${headroomPct}%) [${status}]`,
    ...files.map(
      (f) => `  ${f.tokens.toString().padStart(6)}  ${f.rel}${f.missing ? '  (MISSING)' : ''}`
    ),
  ];
  return { label, total, budget, headroom, status, files, text: lines.join('\n') };
}

function fmtRelease(label, files, { absolute, working }) {
  if (![absolute, working].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error(`invalid release budget for ${label}`);
  }
  const total = sum(files);
  const missingFiles = files.filter((file) => file.missing).map((file) => file.rel);
  const status = missingFiles.length === 0 && total <= working && total <= absolute ? 'OK' : 'OVER';
  const headroom = working - total;
  return {
    label,
    total,
    budget: working,
    absolute,
    working,
    headroom,
    status,
    missingFiles,
    files,
    text: [
      `${label}: ${total} tokens (working ${working}, absolute ${absolute}, headroom ${headroom}) [${status}]`,
      ...files.map(
        (file) =>
          `  ${file.tokens.toString().padStart(6)}  ${file.rel}${file.missing ? '  (MISSING)' : ''}`
      ),
    ].join('\n'),
  };
}

function buildInvoked(adapter) {
  return [tokens(SHIM), tokens(ADAPTERS[adapter]), tokens(ROUTER)];
}

function buildScenarioFiles(adapter, scenario) {
  const ruleNames = SCENARIOS[scenario];
  if (!ruleNames) throw new Error(`unknown scenario: ${scenario}`);
  const pickupRel = resolvePickup();
  return [
    ...buildInvoked(adapter),
    tokens(pickupRel),
    ...ruleNames.map((n) => tokens(path.join(RULES_DIR, n))),
  ];
}

function measure({
  mode,
  adapter = 'claude',
  scenario = null,
  issue = null,
  extraRules = [],
  budgets = GUIDANCE_CONTEXT_BUDGETS,
}) {
  const shim = [tokens(SHIM)];
  if (mode === 'idle') return fmt('idle', shim, BUDGETS.idle);
  if (mode === 'invoked') {
    return fmt(`invoked (${adapter})`, buildInvoked(adapter), BUDGETS.invoked);
  }
  if (mode === 'active') {
    // Back-compat: legacy --active maps to scenario "bind", with the legacy active budget
    // and optional --rule additions. Keep the label "active" so old greps still work.
    const ruleNames = [...SCENARIOS.bind, ...extraRules];
    const pickupRel = resolvePickup();
    const all = [
      ...buildInvoked(adapter),
      tokens(pickupRel),
      ...ruleNames.map((n) => tokens(path.join(RULES_DIR, n))),
    ];
    return fmt(`active${issue ? ` (#${issue})` : ''} (${adapter})`, all, BUDGETS.active);
  }
  if (mode === 'scenario') {
    if (!scenario || !SCENARIOS[scenario]) {
      throw new Error(
        `unknown scenario: ${scenario || '(none)'}. Known: ${SCENARIO_NAMES.join(', ')}`
      );
    }
    const files = buildScenarioFiles(adapter, scenario);
    const budget = SCENARIO_BUDGETS[adapter]?.[scenario];
    if (typeof budget !== 'number') {
      throw new Error(`no budget defined for adapter=${adapter} scenario=${scenario}`);
    }
    return fmt(`scenario:${scenario} (${adapter})`, files, budget);
  }
  if (mode === 'release-static') {
    const category = RELEASE_SCENARIOS[scenario];
    if (!category) throw new Error(`unknown release-static scenario: ${scenario || '(none)'}`);
    const files =
      scenario === 'invoked+pickup'
        ? [...buildInvoked(adapter), tokens(resolvePickup())]
        : buildScenarioFiles(adapter, 'bind+review+close');
    return fmtRelease(`release-static:${scenario} (${adapter})`, files, budgets[category]);
  }
  throw new Error(`unknown mode: ${mode}`);
}

function parseArgs(argv) {
  const args = {
    mode: null,
    adapter: 'claude',
    issue: null,
    extraRules: [],
    scenario: null,
  };
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
    } else if (a === '--scenario') {
      args.mode = 'scenario';
      args.scenario = argv[++i];
    } else if (a === '--release-static') {
      args.mode = 'release-static';
      args.scenario = argv[++i];
    } else if (a === '--adapter') {
      args.adapter = argv[++i];
    } else if (a === '--rule') {
      args.extraRules.push(argv[++i]);
    } else if (a === '--all') {
      args.mode = 'all';
    } else if (a === '--list-scenarios') {
      args.listScenarios = true;
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    }
  }
  return args;
}

function help() {
  return `Usage: measure-context.mjs [mode] [options]

Modes:
  --idle                       Tier-0 shim only
  --invoked                    shim + adapter + router
  --active [N]                 invoked + pickup + bind/state-walk (legacy)
  --scenario <name>            invoked + pickup + scenario rules (see --list-scenarios)
  --release-static <name>      fixed invoked+pickup or bind+review+close instruction subset
  --all                        historical and fixed release scenarios for the selected adapter

Options:
  --adapter <name>             claude | codex (default: claude)
  --rule <file.md>             extra Tier-2 rule file to include in --active (repeatable)
  --list-scenarios             print known scenario names and per-adapter budgets, then exit
  --json                       emit machine-readable JSON
  -h, --help                   this text

Foundational budgets: idle ${BUDGETS.idle}, invoked ${BUDGETS.invoked}, active ${BUDGETS.active}.
Scenario budgets are per-adapter; see --list-scenarios.`;
}

function listScenarios() {
  const lines = ['Known scenarios:'];
  for (const name of SCENARIO_NAMES) {
    lines.push(`  ${name}`);
    lines.push(`    rules: ${SCENARIOS[name].join(', ')}`);
    for (const ad of Object.keys(SCENARIO_BUDGETS)) {
      lines.push(`    budget (${ad}): ${SCENARIO_BUDGETS[ad][name]}`);
    }
  }
  for (const [name, category] of Object.entries(RELEASE_SCENARIOS)) {
    lines.push(`  release-static:${name} (fixed ${category} budget)`);
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help || wantsHelp(argv)) {
    emitSelfDoc('measure-context');
    console.log(help());
    process.exit(0);
  }
  if (args.listScenarios) {
    console.log(listScenarios());
    process.exit(0);
  }
  if (!args.mode) {
    console.log(help());
    process.exit(2);
  }

  let results;
  if (args.mode === 'all') {
    // Historical scenarios remain separately labeled; fixed release subsets
    // use the same limits as the captured lifecycle report.
    results = [
      measure({ mode: 'idle', adapter: args.adapter }),
      measure({ mode: 'invoked', adapter: args.adapter }),
      ...SCENARIO_NAMES.map((name) =>
        measure({ mode: 'scenario', adapter: args.adapter, scenario: name })
      ),
      ...Object.keys(RELEASE_SCENARIOS).map((name) =>
        measure({ mode: 'release-static', adapter: args.adapter, scenario: name })
      ),
    ];
  } else {
    results = [
      measure({
        mode: args.mode,
        adapter: args.adapter,
        scenario: args.scenario,
        issue: args.issue,
        extraRules: args.extraRules,
      }),
    ];
  }

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) console.log(r.text);
  }
  const over = results.find((r) => r.status === 'OVER');
  process.exit(over ? 1 : 0);
}

export {
  measure,
  fmtRelease as formatReleaseMeasurement,
  BUDGETS,
  SCENARIO_BUDGETS,
  SCENARIOS,
  SCENARIO_NAMES,
  RELEASE_SCENARIOS,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
