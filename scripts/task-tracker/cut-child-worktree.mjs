#!/usr/bin/env node
// #905 — cut a child worktree from its epic head, by construction.
//
//   node scripts/task-tracker/cut-child-worktree.mjs <issue#> <path>
//
// This is the correct-by-construction replacement for a free-form
// `Agent({isolation:"worktree"})` cut when the child belongs to an epic: the new
// `feature/child/<N>` branch and worktree are based on the epic branch's head —
// the exact base the fail-closed guard demands — instead of trunk (the #859
// wrong-base bug). The epic base is `resolveEpicLineage`'s `epicBranch`, derived
// live from the sub-issue graph.
//
// Core (`cutChildWorktree`) is injectable (git + graph); the CLI wires real git
// and the real `gh` graph.

import { execFileSync } from 'node:child_process';

import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import { parseBranchName } from './lib/branch-name.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';
import { createRuntimeGovernedEffectAdapter } from './lib/work-lease/governed-effect.mjs';
import { withVerbMutationScope } from './lib/work-lease/verb-mutation-scope.mjs';
import { buildOwnedChildEnvironment } from './lib/work-lease/child-environment.mjs';

// Create `feature/child/<issue>` + its worktree at `path`, based on the child's
// epic head. Returns `{ branch, path, base }`. Throws if the issue is not a child
// of an epic, if path is missing, or if git is not injected.
export async function cutChildWorktree({ issue, path, deps } = {}) {
  if (issue == null) throw new Error('cut-child-worktree: issue is required');
  if (!path) throw new Error('cut-child-worktree: path is required');
  if (!deps || typeof deps.git !== 'function') {
    throw new Error('cut-child-worktree: deps.git(args) is required');
  }
  if (typeof deps.withGovernedEffect !== 'function') {
    throw new Error('cut-child-worktree: deps.withGovernedEffect is required');
  }
  const lineage = resolveEpicLineage(issue, { deps });
  if (lineage.role !== 'child' || !lineage.epicBranch) {
    throw new Error(
      `cut-child-worktree: #${issue} is not a child of an epic (resolved role=${lineage.role}); ` +
        `only epic children get an epic-based worktree`
    );
  }
  const base = lineage.epicBranch;
  const controllerIssue = parseBranchName(base).issue;
  return withVerbMutationScope(
    {
      issueId: controllerIssue,
      operation: 'branch-worktree-orchestration',
      withGovernedEffect: deps.withGovernedEffect,
      heartbeat: true,
    },
    async (scope) => {
      await deps.refreshGraph?.();
      const liveLineage = resolveEpicLineage(issue, { deps });
      if (
        liveLineage.role !== 'child' ||
        liveLineage.branch !== lineage.branch ||
        liveLineage.epicBranch !== lineage.epicBranch
      ) {
        throw new Error('cut-child-worktree: lineage changed before governed git effects');
      }
      const env = buildOwnedChildEnvironment({
        baseEnv: deps.baseEnv ?? process.env,
        leaseContext: scope.leaseContext,
        tokenEnv: deps.tokenEnv,
      });
      await scope.effect(() =>
        deps.git(['worktree', 'add', '-b', lineage.branch, path, base], { env })
      );
      return { branch: lineage.branch, path, base };
    }
  );
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
  return (args, options = {}) =>
    execFileSync('git', args, {
      cwd: projectDir,
      encoding: 'utf8',
      env: options.env,
    }).trim();
}

export async function main(argv, overrides = {}) {
  if (wantsHelp(argv)) {
    emitSelfDoc('cut-child-worktree');
    return;
  }
  const issue = Number(String(argv[0] || '').replace(/^#/, ''));
  const wtPath = argv[1];
  if (!Number.isInteger(issue) || issue <= 0 || !wtPath) {
    process.stderr.write('usage: cut-child-worktree.mjs <issue#> <path>\n');
    process.exit(2);
  }
  const loadConfig =
    overrides.loadConfig || (await import('./config.mjs')).loadConfig;
  const cfg = loadConfig();
  const graphNode = overrides.realGraphNode || realGraphNode;
  let node = await graphNode(issue, cfg);
  const projectDir = cfg.projectDir || process.cwd();
  const runCore = overrides.runCore || cutChildWorktree;
  const {
    branch,
    path: p,
    base,
  } = await runCore({
    issue,
    path: wtPath,
    deps: {
      graph: () => node,
      refreshGraph: async () => {
        node = await graphNode(issue, cfg);
      },
      git: realGit(projectDir),
      withGovernedEffect: createRuntimeGovernedEffectAdapter({ projectDir, config: cfg }),
      baseEnv: process.env,
      tokenEnv: cfg.workLease?.tokenEnv,
    },
  });
  (overrides.write || process.stdout.write.bind(process.stdout))(
    `cut ${branch} at ${p} from ${base}\n`
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`cut-child-worktree: ${err.message}\n`);
    process.exit(1);
  });
}
