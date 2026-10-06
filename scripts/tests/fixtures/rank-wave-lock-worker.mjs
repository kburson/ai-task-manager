// @story #1872
// Static child entrypoint: paths and authority requests arrive as JSON data.
import { readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import { withEpicAdmissionLock } from '../../task-tracker/lib/epic-admission-lock.mjs';
import {
  executeRankWaveWrite,
  inspectRankWavePublication,
} from '../../task-tracker/lib/epic-rank-wave-store.mjs';
import { runSerializedPromote } from '../../task-tracker/verbs/promote.mjs';
import { refineExitWipBudgetGuard } from '../../task-tracker/lib/refine-exit-wip-budget-guard.mjs';
import { fileRankWaveRuntime } from './rank-wave-file-runtime.mjs';

const mode = process.argv[2];
const { projectDir, authority, events, input } = JSON.parse(readFileSync(0, 'utf8'));
if (mode === 'hold-revoke') {
  await withEpicAdmissionLock({ projectDir, epic: 107 }, async () => {
    appendFileSync(events, 'revoke:start\n');
    await new Promise((resolve) => setTimeout(resolve, 150));
    writeFileSync(authority, JSON.stringify({ revoked: true }));
    appendFileSync(events, 'revoke:end\n');
  });
} else if (mode === 'observe') {
  await withEpicAdmissionLock({ projectDir, epic: 107 }, async () => {
    const state = JSON.parse(readFileSync(authority, 'utf8'));
    appendFileSync(events, state.revoked ? 'admission:refused\n' : 'admission:allowed\n');
  });
} else if (mode === 'timeout') {
  try {
    await withEpicAdmissionLock({ projectDir, epic: 107, timeoutMs: 50 }, async () => {});
    process.exitCode = 3;
  } catch (error) {
    console.log(error.code);
  }
} else if (mode === 'publish-revoke') {
  const result = await executeRankWaveWrite({
    action: 'revoke',
    repository: 'o/r',
    epic: 107,
    now: '2026-10-04T01:01:00.000Z',
    runtime: fileRankWaveRuntime({ file: authority, projectDir, events }),
    input,
  });
  if (result.status !== 'recorded') throw new Error(JSON.stringify(result));
} else if (mode === 'promote') {
  const runtime = fileRankWaveRuntime({ file: authority, projectDir });
  const body = '<!-- aitm-last-known-state state="plan" ts="2026-10-04T01:00:00.000Z" -->';
  const result = await runSerializedPromote({
    issueNumber: 144,
    cfg: { repo: 'o/r' },
    deps: {
      projectDir,
      fetchParentIssue: async () => 107,
      withIssueLock: async (_, fn) => fn(),
      assertBound() {},
      fetchIssueBody: async () => ({ body }),
      getLiveState: async () => 'plan',
      resolveProjectDir: () => projectDir,
      sessionPolicy: {},
      epicChildren: {
        rankWaveRuntime: runtime,
        inspectRankWavePublication: (args) =>
          inspectRankWavePublication({ ...args, now: '2026-10-04T01:02:00.000Z', runtime }),
      },
      runGuards: async (_from, _to, ctx) => {
        const result = await refineExitWipBudgetGuard.run(ctx);
        return result.ok
          ? { ok: true, status: 'ready', refusals: [], humanDecision: null }
          : {
              ok: false,
              status: 'blocked',
              refusals: [
                { id: 'refine-exit-wip-budget', guardId: 'refine-exit-wip-budget', ...result },
              ],
              humanDecision: null,
            };
      },
      loadWorkflowBoundary: async () => ({ status: 'observed' }),
      runMoveState: async () => {
        appendFileSync(events, 'effect:develop\n');
        return 0;
      },
    },
  });
  if (result.decision?.refusals?.[0]?.code !== 'rank-wave-admission-refused')
    throw new Error(JSON.stringify(result));
  appendFileSync(events, 'admission:refused\n');
} else {
  throw new Error('unknown lock fixture mode');
}
