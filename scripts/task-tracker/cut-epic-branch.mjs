#!/usr/bin/env node
// #905 — cut an epic branch at its correct base, by construction.
//
//   node scripts/task-tracker/cut-epic-branch.mjs <issue#>
//
// A root epic forks from trunk; a nested sub-epic forks from its parent epic's
// head. The base is never guessed — it is `resolveEpicLineage`'s `parentBranch`,
// derived from the live sub-issue graph. This is the write-side twin of the
// fail-closed guard: create it right, and the guard never has to catch it.
//
// Core (`cutEpicBranch`) is injectable (git + graph) so it unit-tests with zero
// real git; the CLI wires the real `git` shell-out and the real `gh` graph.

import { execFileSync } from 'node:child_process';

import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

// Cut `feature/epic/<issue>` from its resolved parent branch. Returns
// `{ branch, base }`. Throws if the issue does not resolve to an epic, or if git
// is not injected.
export function cutEpicBranch({ issue, deps } = {}) {
  if (issue == null) throw new Error('cut-epic-branch: issue is required');
  if (!deps || typeof deps.git !== 'function') {
    throw new Error('cut-epic-branch: deps.git(args) is required');
  }
  const lineage = resolveEpicLineage(issue, { deps });
  if (lineage.role !== 'epic') {
    throw new Error(
      `cut-epic-branch: #${issue} is not an epic (resolved role=${lineage.role}); ` +
        `only epics get an epic branch`
    );
  }
  deps.git(['branch', lineage.branch, lineage.parentBranch]);
  return { branch: lineage.branch, base: lineage.parentBranch };
}

// ---- CLI wiring (real git + real gh sub-issue graph) --------------------------

// Build the one graph node the resolver needs (parent + children of `issue`),
// pre-fetched via `gh` so the resolver itself stays synchronous.
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
    emitSelfDoc('cut-epic-branch');
    return;
  }
  const issue = Number(String(argv[0] || '').replace(/^#/, ''));
  if (!Number.isInteger(issue) || issue <= 0) {
    process.stderr.write('usage: cut-epic-branch.mjs <issue#>\n');
    process.exit(2);
  }
  const { loadConfig } = await import('./config.mjs');
  const cfg = loadConfig();
  const node = await realGraphNode(issue, cfg);
  const { branch, base } = cutEpicBranch({
    issue,
    deps: { graph: () => node, git: realGit(cfg.projectDir || process.cwd()) },
  });
  process.stdout.write(`cut ${branch} from ${base}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`cut-epic-branch: ${err.message}\n`);
    process.exit(1);
  });
}
