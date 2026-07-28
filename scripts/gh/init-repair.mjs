#!/usr/bin/env node
// Repair an existing .ai-task-manager/task-tracker.json by backfilling empty
// kanbanOption* fields. Auto-matches by case-insensitive option name against
// the live Status field on the configured project.
//
// Usage: node scripts/gh/init-repair.mjs
//
// Idempotent: never overwrites a populated kanbanOption* field. Reports which
// keys were filled, which were already set, and which could not be matched.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { gql } from './lib/github-projects.mjs';
import { getProjectDir } from '../task-tracker/paths.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

if (import.meta.url === `file://${process.argv[1]}` && wantsHelp(process.argv.slice(2))) {
  emitSelfDoc('init-repair');
  process.exit(0);
}

// Injectable seam (#648): production wiring defaults to the real node:fs calls,
// the shared gql binding, and getProjectDir. Tests override these to drive the
// backfill/match/write branches offline without touching the filesystem or the
// live board. Behaviour-preserving — every default is the original binding.
export const deps = {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  gql,
  getProjectDir,
  log: (s) => console.log(s),
  err: (s) => process.stderr.write(s),
  exit: (c) => process.exit(c),
};

const OPTION_KEYS = {
  kanbanOptionBacklog: 'backlog',
  kanbanOptionOnDeck: 'on deck',
  kanbanOptionRefine: 'refine',
  kanbanOptionPlan: 'plan',
  kanbanOptionDevelop: 'develop',
  kanbanOptionTest: 'test',
  kanbanOptionReview: 'review',
  kanbanOptionDone: 'done',
};

function configPath(d = deps) {
  return path.join(d.getProjectDir(), '.ai-task-manager', 'task-tracker.json');
}

export async function fetchStatusOptions(projectId, kanbanFieldId, gqlFn = deps.gql) {
  const data = await gqlFn(
    `
    query($proj: ID!) {
      node(id: $proj) {
        ... on ProjectV2 {
          fields(first: 50) {
            nodes {
              ... on ProjectV2SingleSelectField { id name options { id name } }
            }
          }
        }
      }
    }`,
    { proj: projectId }
  );
  const fields = data?.node?.fields?.nodes || [];
  const statusField =
    fields.find((f) => f && f.id === kanbanFieldId) ||
    fields.find((f) => f && (f.name || '').toLowerCase() === 'status');
  return statusField?.options || [];
}

function loadOptionsFromEnv() {
  const raw = process.env.TT_REPAIR_FAKE_OPTIONS;
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function runRepair(overrides = {}) {
  const d = { ...deps, ...overrides };
  const skipNetwork =
    overrides.skipNetwork !== undefined
      ? overrides.skipNetwork
      : process.env.TT_SKIP_NETWORK === '1';
  const fakeOptions =
    overrides.fakeOptions !== undefined ? overrides.fakeOptions : loadOptionsFromEnv();

  const cfgPath = configPath(d);
  if (!d.existsSync(cfgPath)) {
    d.err(`No config found at ${cfgPath}. Run: npx ai-task-manager init\n`);
    return d.exit(1);
  }
  const cfg = JSON.parse(d.readFileSync(cfgPath, 'utf8'));
  if (!cfg.projectId || !cfg.kanbanFieldId) {
    d.err('Config is missing projectId or kanbanFieldId. Run: npx ai-task-manager init\n');
    return d.exit(1);
  }

  const empties = Object.keys(OPTION_KEYS).filter((k) => !cfg[k]);
  if (empties.length === 0) {
    d.log('All kanbanOption* fields already populated. Nothing to repair.');
    return { filled: [], alreadySet: Object.keys(OPTION_KEYS), unmatched: [] };
  }

  let options;
  if (skipNetwork) {
    options = fakeOptions || [];
  } else {
    options = await fetchStatusOptions(cfg.projectId, cfg.kanbanFieldId, d.gql);
  }

  const byName = new Map(options.map((o) => [String(o.name || '').toLowerCase(), o.id]));
  const filled = [];
  const unmatched = [];
  for (const key of empties) {
    const id = byName.get(OPTION_KEYS[key]);
    if (id) {
      cfg[key] = id;
      filled.push(key);
    } else unmatched.push(key);
  }

  if (filled.length > 0) {
    d.mkdirSync(path.dirname(cfgPath), { recursive: true });
    d.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }

  d.log(`Filled: ${filled.length === 0 ? '(none)' : filled.join(', ')}`);
  const alreadySet = Object.keys(OPTION_KEYS).filter((k) => !empties.includes(k));
  if (alreadySet.length) d.log(`Already set: ${alreadySet.join(', ')}`);
  if (unmatched.length) {
    d.log(
      `Unmatched (no option named ${unmatched.map((k) => `"${OPTION_KEYS[k]}"`).join(', ')} on Status field): ${unmatched.join(', ')}`
    );
    d.log('  → Add the missing column(s) to the GitHub Project Status field, then re-run repair.');
  }
  return { filled, alreadySet, unmatched };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runRepair().catch((e) => {
    process.stderr.write(`Repair failed: ${e.message}\n`);
    process.exit(1);
  });
}
