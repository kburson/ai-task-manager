#!/usr/bin/env node
// @story #905 #927 #2145
import { enforceDirectGuidance } from './lib/direct-guidance-admission.mjs';
enforceDirectGuidance(import.meta.url, 'sync-epic');
import { resolveEpicLineage } from './lib/resolve-epic-lineage.mjs';
import {
  integrationHead,
  retainIntegrationHeads,
  assertIntegrationHeads,
  assertNoIncomingEvidence,
} from './lib/integration-retention.mjs';
import { runSyncEpicCli } from './lib/sync-epic-cli.mjs';
import { realGraphNode } from './merge-back.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

function requireEpic(epic, deps) {
  if (epic == null) throw new Error('sync-epic: epic issue is required');
  if (typeof deps?.git !== 'function') throw new Error('sync-epic: deps.git(args) is required');
  const lineage = resolveEpicLineage(epic, {
    deps: { ...deps, trunk: deps.trunk || 'origin/trunk' },
  });
  if (lineage.role !== 'epic')
    throw new Error(`sync-epic: #${epic} is not an epic (resolved role=${lineage.role})`);
  return lineage;
}
export function epicNeedsSync({ epic, deps } = {}) {
  const lineage = requireEpic(epic, deps);
  try {
    deps.git(['merge-base', '--is-ancestor', lineage.parentBranch, lineage.branch]);
    return false;
  } catch {
    return true;
  }
}

// Preserve original heads, merge additively, then verify the exact result before
// an ordinary push. Failed/conflicted state is retained for native recovery.
export function syncEpic({ epic, deps } = {}) {
  const lineage = requireEpic(epic, deps);
  if (typeof deps.runTests !== 'function')
    throw new Error('sync-epic: exact-head verification runner is required');
  if (
    typeof deps.assertIntegrationCheckout !== 'function' ||
    typeof deps.withIntegrationLock !== 'function'
  )
    throw new Error('sync-epic: physical integration authority is required');
  const { git } = deps;
  const targetRef = lineage.parentBranch;
  let target;
  let verifiedHead;
  deps.withIntegrationLock(() => {
    deps.assertIntegrationCheckout();
    const original = integrationHead(git, lineage.branch);
    target = integrationHead(git, targetRef);
    retainIntegrationHeads({ git, heads: [original, target] });
    assertNoIncomingEvidence(git, target.sha);
    deps.assertIntegrationCheckout();
    assertIntegrationHeads({ git, heads: [original, target] });
    if (epicNeedsSync({ epic, deps }))
      git([
        'merge',
        '--no-ff',
        target.sha,
        '-m',
        `[#${epic}] Integrate ${targetRef} while preserving original history`,
      ]);
    verifiedHead = integrationHead(git, 'HEAD').sha;
  });
  if (deps.runTests() !== true)
    throw new Error('sync-epic: exact-head verification failed; refusing publication');
  let pushed = false;
  deps.withIntegrationLock(() => {
    deps.assertIntegrationCheckout();
    assertIntegrationHeads({ git, heads: [target] });
    if (integrationHead(git, 'HEAD').sha !== verifiedHead)
      throw new Error('sync-epic: verified HEAD changed');
    if (!deps.noPushToOrigin) {
      git(['push', 'origin', `${verifiedHead}:refs/heads/${lineage.branch}`]);
      pushed = true;
    }
  });
  return { branch: lineage.branch, mergedOnto: targetRef, pushed };
}

export async function runSyncEpicCommand(argv, deps = {}) {
  return runSyncEpicCli(argv, {
    ...deps,
    syncEpic,
    loadGraph:
      deps.loadGraph ||
      (async ({ epic, cfg }) => {
        const node = await realGraphNode(epic, cfg);
        return (issue) => {
          if (Number(issue) !== epic) throw new Error('sync-epic: graph node not prefetched');
          return node;
        };
      }),
  });
}
async function main(argv) {
  if (wantsHelp(argv)) {
    emitSelfDoc('sync-epic');
    return;
  }
  const result = await runSyncEpicCommand(argv);
  process.stdout.write(
    `synced ${result.branch} with ${result.mergedOnto}${result.pushed ? ' and pushed' : ' (retained locally)'}\n`
  );
}
if (import.meta.url === `file://${process.argv[1]}`)
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`sync-epic: ${error.message}\n`);
    process.exitCode = 1;
  });
