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

const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

const OPTION_KEYS = {
  kanbanOptionBacklog: 'backlog',
  kanbanOptionGroom: 'groom',
  kanbanOptionAnalyze: 'analyze',
  kanbanOptionDevelopment: 'development',
  kanbanOptionValidate: 'validate',
  kanbanOptionReview: 'review',
  kanbanOptionDone: 'done',
};

function configPath() {
  const dir = process.env.AI_TASK_MANAGER_PROJECT_DIR || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  return path.join(dir, '.ai-task-manager', 'task-tracker.json');
}

async function fetchStatusOptions(projectId, kanbanFieldId) {
  const data = await gql(`
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
  const statusField = fields.find(f => f && f.id === kanbanFieldId)
    || fields.find(f => f && (f.name || '').toLowerCase() === 'status');
  return statusField?.options || [];
}

function loadOptionsFromEnv() {
  const raw = process.env.TT_REPAIR_FAKE_OPTIONS;
  if (!raw) return null;
  return JSON.parse(raw);
}

export async function runRepair() {
  const cfgPath = configPath();
  if (!existsSync(cfgPath)) {
    process.stderr.write(`No config found at ${cfgPath}. Run: npx ai-task-manager init\n`);
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  if (!cfg.projectId || !cfg.kanbanFieldId) {
    process.stderr.write('Config is missing projectId or kanbanFieldId. Run: npx ai-task-manager init\n');
    process.exit(1);
  }

  const empties = Object.keys(OPTION_KEYS).filter(k => !cfg[k]);
  if (empties.length === 0) {
    console.log('All kanbanOption* fields already populated. Nothing to repair.');
    return { filled: [], alreadySet: Object.keys(OPTION_KEYS), unmatched: [] };
  }

  let options;
  if (SKIP_NETWORK) {
    options = loadOptionsFromEnv() || [];
  } else {
    options = await fetchStatusOptions(cfg.projectId, cfg.kanbanFieldId);
  }

  const byName = new Map(options.map(o => [String(o.name || '').toLowerCase(), o.id]));
  const filled = [];
  const unmatched = [];
  for (const key of empties) {
    const id = byName.get(OPTION_KEYS[key]);
    if (id) { cfg[key] = id; filled.push(key); }
    else unmatched.push(key);
  }

  if (filled.length > 0) {
    mkdirSync(path.dirname(cfgPath), { recursive: true });
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  }

  console.log(`Filled: ${filled.length === 0 ? '(none)' : filled.join(', ')}`);
  const alreadySet = Object.keys(OPTION_KEYS).filter(k => !empties.includes(k));
  if (alreadySet.length) console.log(`Already set: ${alreadySet.join(', ')}`);
  if (unmatched.length) {
    console.log(`Unmatched (no option named ${unmatched.map(k => `"${OPTION_KEYS[k]}"`).join(', ')} on Status field): ${unmatched.join(', ')}`);
    console.log('  → Add the missing column(s) to the GitHub Project Status field, then re-run repair.');
  }
  return { filled, alreadySet, unmatched };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runRepair().catch(e => {
    process.stderr.write(`Repair failed: ${e.message}\n`);
    process.exit(1);
  });
}
