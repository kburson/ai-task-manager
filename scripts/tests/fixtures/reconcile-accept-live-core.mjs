// @story #2147 — portable core qualification, not public CLI or cache evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runReconcile } from '../../task-tracker/verbs/reconcile.mjs';

const cfg = JSON.parse(readFileSync('.ai-task-manager/task-tracker.json', 'utf8'));
assert.equal(cfg.repo, 'fixture-b1/reconcile');
assert.equal(cfg.projectId, 'PVT_71');
const result = await runReconcile({
  issueNumber: 71,
  mode: 'accept-live',
  cfg,
  // Session-cache behavior is qualified separately through genuine native Start.
  deps: { persistTrackerState: () => {} },
});
console.log(JSON.stringify({ surface: 'portable-core', result }));
if (result.status !== 'reconciled') console.error(JSON.stringify(result));
// This adapter exit is only a projection of the core result, not CLI evidence.
process.exitCode = result.status === 'reconciled' ? 0 : 1;
