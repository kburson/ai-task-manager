// Best-effort Disposition reconciliation for issues blocked by a newly-Done issue.
// Native relationships remain intact; each dependent is reconciled independently.

import { reconcileDependencyDisposition } from './dependency-disposition.mjs';
import { readNativeDependencies } from './native-dependencies.mjs';

export async function unparkDependents({ doneIssueNumber, cfg = {}, deps = {} } = {}) {
  const done = Number(doneIssueNumber);
  if (!Number.isSafeInteger(done) || done <= 0) return [];

  const readDependencies = deps.readNativeDependencies || readNativeDependencies;
  let graph;
  try {
    graph = await readDependencies({
      issueNumber: done,
      repo: cfg.repo,
      deps: deps.nativeDependencies,
    });
  } catch (error) {
    return [{ issue: null, error: `native dependency read failed: ${error.message}` }];
  }
  if (!Array.isArray(graph?.blocking)) {
    return [{ issue: null, error: 'native dependency read failed: blocking set unreadable' }];
  }

  const reconcile = deps.reconcileDependencyDisposition || reconcileDependencyDisposition;
  const results = [];
  for (const issue of graph.blocking) {
    try {
      const projected = await reconcile({
        issueNumber: issue,
        cfg,
        deps: deps.dependencyDisposition,
      });
      results.push({ issue, reconciled: projected.status });
    } catch (error) {
      results.push({ issue, error: error.message });
    }
  }
  return results;
}
