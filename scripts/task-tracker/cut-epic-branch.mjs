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
import { createRuntimeGovernedEffectAdapter } from './lib/work-lease/governed-effect.mjs';
import { withVerbMutationScope } from './lib/work-lease/verb-mutation-scope.mjs';
import { buildOwnedChildEnvironment } from './lib/work-lease/child-environment.mjs';

// Cut `feature/epic/<issue>` from its resolved parent branch. Returns
// `{ branch, base }`. Throws if the issue does not resolve to an epic, or if git
// is not injected.
export async function cutEpicBranch({ issue, deps } = {}) {
  if (issue == null) throw new Error('cut-epic-branch: issue is required');
  if (!deps || typeof deps.git !== 'function') {
    throw new Error('cut-epic-branch: deps.git(args) is required');
  }
  if (typeof deps.withGovernedEffect !== 'function') {
    throw new Error('cut-epic-branch: deps.withGovernedEffect is required');
  }
  const lineage = resolveEpicLineage(issue, { deps });
  if (lineage.role !== 'epic') {
    throw new Error(
      `cut-epic-branch: #${issue} is not an epic (resolved role=${lineage.role}); ` +
        `only epics get an epic branch`
    );
  }
  return withVerbMutationScope(
    {
      issueId: issue,
      operation: 'branch-worktree-orchestration',
      withGovernedEffect: deps.withGovernedEffect,
      heartbeat: true,
    },
    async (scope) => {
      await deps.refreshGraph?.();
      const liveLineage = resolveEpicLineage(issue, { deps });
      if (
        liveLineage.role !== 'epic' ||
        liveLineage.branch !== lineage.branch ||
        liveLineage.parentBranch !== lineage.parentBranch
      ) {
        throw new Error('cut-epic-branch: lineage changed before governed git effects');
      }
      const env = buildOwnedChildEnvironment({
        baseEnv: deps.baseEnv ?? process.env,
        leaseContext: scope.leaseContext,
        tokenEnv: deps.tokenEnv,
      });
      const fetchResult =
        typeof deps.fetch === 'function'
          ? await deps.fetch({ env, runAttempt: scope.effect })
          : undefined;
      const effectiveBase =
        !String(liveLineage.parentBranch).startsWith('feature/epic/') && fetchResult?.trunk
          ? fetchResult.trunk
          : liveLineage.parentBranch;
      await scope.effect(() => deps.git(['branch', lineage.branch, effectiveBase], { env }));
      return { branch: lineage.branch, base: effectiveBase };
    }
  );
}

// ---- CLI wiring (real git + real gh sub-issue graph) --------------------------

// Build the one graph node the resolver needs (parent + children of `issue`),
// pre-fetched via `gh` so the resolver itself stays synchronous.
async function realGraphNode(issue, cfg, { env } = {}) {
  const { fetchParentIssue } = await import('./lib/fetch-parent-issue.mjs');
  const { fetchEpicChildren } = await import('./lib/epic-children-gate.mjs');
  const parent = await fetchParentIssue({ issueNumber: issue, repo: cfg.repo, env });
  const children = await fetchEpicChildren({ cfg, parentEpicNumber: issue, env });
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
    emitSelfDoc('cut-epic-branch');
    return;
  }
  const issue = Number(String(argv[0] || '').replace(/^#/, ''));
  if (!Number.isInteger(issue) || issue <= 0) {
    process.stderr.write('usage: cut-epic-branch.mjs <issue#>\n');
    process.exit(2);
  }
  const loadConfig = overrides.loadConfig || (await import('./config.mjs')).loadConfig;
  const cfg = loadConfig();
  const projectDir = cfg.projectDir || process.cwd();
  const graphNode = overrides.realGraphNode || realGraphNode;
  const baseEnv = overrides.baseEnv ?? process.env;
  const preAuthorityEnv = buildOwnedChildEnvironment({
    baseEnv,
    leaseContext: undefined,
    tokenEnv: cfg.workLease?.tokenEnv,
  });
  let node = await graphNode(issue, cfg, { env: preAuthorityEnv });
  // #927 — a root epic forks from trunk, so cut from the resolved trunk ref
  // (default origin/trunk) after a fetch, never from a possibly-stale local
  // `trunk`. Nested sub-epics fork from their parent epic head and ignore this.
  const { resolveTrunkRef, fetchTrunk } = await import('./lib/trunk-ref.mjs');
  const trunk =
    typeof cfg.trunkRef === 'string' && cfg.trunkRef.trim() ? cfg.trunkRef.trim() : 'origin/trunk';
  const runCore = overrides.runCore || cutEpicBranch;
  const { branch, base } = await runCore({
    issue,
    deps: {
      graph: () => node,
      refreshGraph: async () => {
        node = await graphNode(issue, cfg, { env: preAuthorityEnv });
      },
      git: realGit(projectDir),
      trunk,
      fetch: async ({ env, runAttempt }) => {
        const git = (args) => realGit(projectDir)(args, { env });
        const status = await fetchTrunk({
          cfg,
          projectDir,
          deps: { git, runAttempt },
        });
        return {
          ...status,
          trunk: (await resolveTrunkRef({ cfg, projectDir, deps: { git } })) || trunk,
        };
      },
      withGovernedEffect: createRuntimeGovernedEffectAdapter({ projectDir, config: cfg }),
      baseEnv,
      tokenEnv: cfg.workLease?.tokenEnv,
    },
  });
  (overrides.write || process.stdout.write.bind(process.stdout))(`cut ${branch} from ${base}\n`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main(process.argv.slice(2)).catch((err) => {
    process.stderr.write(`cut-epic-branch: ${err.message}\n`);
    process.exit(1);
  });
}
