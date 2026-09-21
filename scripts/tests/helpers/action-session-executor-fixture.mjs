// @story #1750
// Runs the production preflight and resume verb in a disposable project dir.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [projectDir, mode] = process.argv.slice(2);
if (!projectDir || !['offline', 'freeze'].includes(mode)) throw new Error('fixture args');
process.env.AI_TASK_MANAGER_PROJECT_DIR = projectDir;
process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR = path.join(projectDir, 'transcripts');
process.env.AI_TASK_MANAGER_SESSION_ID = 'session-parity-1750';
process.env.TT_SKIP_NETWORK = '1';
mkdirSync(process.env.AI_TASK_MANAGER_TRANSCRIPT_DIR, { recursive: true });

const { runPreflight } = await import('../../task-tracker/lib/verb-preflight.mjs');
const { verbResume } = await import('../../task-tracker/verbs/resume.mjs');
const { loadState } = await import('../../task-tracker/state.mjs');

const statePath = path.join(projectDir, 'state.json');
writeFileSync(statePath, JSON.stringify({ active: null, lastActive: null }), 'utf8');
const effects = [];
const verdict = await runPreflight({
  stateBefore: loadState(statePath),
  target: '#1750',
  cfg: null,
  deps: { migrationFreezeActive: () => mode === 'freeze' },
});
if (verdict.ok) {
  await verbResume({
    rest: ['#1750'],
    verb: 'resume',
    cfg: {},
    statePath,
    projectDir,
    role: 'agent',
    drainQueueIfAny: async () => {},
    safePostTiming: async (issue, row) => effects.push({ kind: 'timing', issue, event: row.event }),
    nowIso: () => new Date().toISOString(),
    claimBindingOccupancy: () => ({ status: 'unchanged' }),
    resolveWorktreeBinding: () => ({
      worktreePath: projectDir,
      worktreeBranch: 'feature/child/1750',
      worktreeResolvedAt: new Date().toISOString(),
    }),
    reconcileDependencyDisposition: async () => {},
  });
}
process.stdout.write(
  `FIXTURE_RESULT ${JSON.stringify({ preflight: { ok: verdict.ok, kind: verdict.kind ?? null, code: verdict.code ?? null }, active: loadState(statePath).active, effects })}\n`
);
