#!/usr/bin/env node
// #905 — re-sync an epic branch onto trunk (design: "Epic↔trunk re-sync").
//
//   node scripts/task-tracker/sync-epic.mjs <epic#>
//
// The epic is a long-lived integration branch. When trunk advances (a sibling
// story merged), the epic rebases onto the new trunk and republishes with
// --force-with-lease so its published history stays a clean linear descendant of
// trunk. Under a local-only / no-push regime (`noPushToOrigin`) it rebases only.
//
// `epicNeedsSync` is the opportunistic ancestor check merge-back consults before a
// child merge: if origin/trunk is not yet an ancestor of the epic, trunk moved and
// the epic wants a sync first.
//
// Core is injectable (git + graph); the CLI wires real git, the real gh graph, and
// the `noPushToOrigin` preference.

import { execFileSync } from 'node:child_process';

import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

function requireEpic(epic, deps) {
  if (epic == null) throw new Error('sync-epic: epic issue is required');
  if (!deps || typeof deps.git !== 'function') {
    throw new Error('sync-epic: deps.git(args) is required');
  }
  const lineage = resolveEpicLineage(epic, { deps });
  if (lineage.role !== 'epic') {
    throw new Error(`sync-epic: #${epic} is not an epic (resolved role=${lineage.role})`);
  }
  return lineage;
}

// True when trunk has advanced past the epic's base — i.e. origin/trunk is NOT an
// ancestor of the epic head — so the epic should re-sync before absorbing a child.
// `git merge-base --is-ancestor` signals via exit code; deps.git throws on non-zero.
export function epicNeedsSync({ epic, deps } = {}) {
  const lineage = requireEpic(epic, deps);
  const trunk = deps.trunk || 'trunk';
  const trunkRef = deps.trunkRemoteRef || `origin/${trunk}`;
  try {
    deps.git(['merge-base', '--is-ancestor', trunkRef, lineage.branch]);
    return false; // ancestor → epic already contains trunk tip
  } catch {
    return true; // not an ancestor → trunk moved ahead → needs sync
  }
}

// Rebase the epic onto trunk, then (unless noPushToOrigin) push --force-with-lease.
// Returns `{ branch, rebasedOnto, pushed }`. A rebase conflict propagates before
// any push, so a broken state is never published.
export function syncEpic({ epic, deps } = {}) {
  const lineage = requireEpic(epic, deps);
  const trunk = deps.trunk || 'trunk';
  deps.git(['rebase', trunk, lineage.branch]);
  let pushed = false;
  if (!deps.noPushToOrigin) {
    deps.git(['push', '--force-with-lease', 'origin', lineage.branch]);
    pushed = true;
  }
  return { branch: lineage.branch, rebasedOnto: trunk, pushed };
}

// ---- CLI wiring (real git + real gh sub-issue graph) --------------------------

async function realGraphNode(issue, cfg) {
  const { fetchParentIssue } = await import('./lib/fetch-parent-issue.mjs');
  const { fetchEpicChildren } = await import('./lib/epic-children-gate.mjs');
  const parent = await fetchParentIssue({ issueNumber: issue, repo: cfg.repo });
  const children = await fetchEpicChildren({ cfg, parentEpicNumber: issue });
  return { parent, children: (children || []).map((c) => Number(c.number)) };
}

function realGit(projectDir) {
  return (args) => execFileSync('git', args, { cwd: projectDir, encoding: 'utf8' }).trim();
}

async function main(argv) {
  if (wantsHelp(argv)) {
    emitSelfDoc('sync-epic');
    return;
  }
  const epic = Number(String(argv[0] || '').replace(/^#/, ''));
  if (!Number.isInteger(epic) || epic <= 0) {
    process.stderr.write('usage: sync-epic.mjs <epic#>\n');
    process.exit(2);
  }
  const { loadConfig } = await import('./config.mjs');
  const cfg = loadConfig();
  const node = await realGraphNode(epic, cfg);
  const { branch, rebasedOnto, pushed } = syncEpic({
    epic,
    deps: {
      graph: () => node,
      git: realGit(cfg.projectDir || process.cwd()),
      noPushToOrigin: !!cfg.noPushToOrigin,
    },
  });
  process.stdout.write(
    `synced ${branch} onto ${rebasedOnto}${pushed ? ' and pushed' : ' (rebase-only)'}\n`
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`sync-epic: ${err.message}\n`);
    process.exit(1);
  });
}
