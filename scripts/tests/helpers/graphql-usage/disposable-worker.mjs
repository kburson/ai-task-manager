// @story #1839
// Retained disposable worker; invoked only by the explicit opt-in live test.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const [configFile, workerId] = process.argv.slice(2);
const cfg = JSON.parse(await fs.readFile(configFile, 'utf8'));
const me = cfg.workers.find((w) => w.id === workerId);
const local = JSON.parse(
  await fs.readFile(path.join(process.cwd(), '.ai-task-manager/task-tracker.json'), 'utf8')
);
if (
  !me ||
  local.repo !== cfg.repository ||
  local.projectId !== cfg.projectId ||
  path.resolve(process.cwd()) !== me.worktree
)
  throw Error('target mismatch');
const context = JSON.parse(process.env.AITM_GRAPHQL_USAGE_CONTEXT);
const evidence = {
  workerId,
  commonRootId: context.commonRootId,
  worktreeId: context.worktreeId,
  sessionId: context.sessionId,
  enrollmentId: context.enrollmentId,
  enrolledAt: new Date(context.probedAt).toISOString(),
  collectorStartedAt: new Date().toISOString(),
  collectorEndedAt: null,
  workflows: [],
  commands: [],
};
const out = path.join(cfg.output, workerId + '.json');
const persist = () => fs.writeFile(out, JSON.stringify(evidence, null, 2) + '\n');
await persist();
const waitUntil = async (date) => {
  while (Date.now() < Date.parse(date))
    await new Promise((r) => setTimeout(r, Math.min(1000, Date.parse(date) - Date.now())));
};
async function command(label, args, target, stage) {
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AITM_GRAPHQL_USAGE_DISPATCH_CONTEXT: JSON.stringify({
        repository: cfg.repository,
        ...target,
        lifecycleState: stage,
        stateSource: 'argument',
      }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (b) => (stdout += b));
  child.stderr.on('data', (b) => (stderr += b));
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  const endedAt = new Date().toISOString();
  const record = { label, startedAt, endedAt, exitCode };
  evidence.commands.push(record);
  await fs.writeFile(
    path.join(cfg.output, workerId + '-' + evidence.commands.length + '.log'),
    stdout + '\n' + stderr
  );
  await persist();
  console.log(JSON.stringify({ workerId, ...record }));
  if (exitCode !== 0) throw Error(label + ' failed (' + exitCode + ')');
  return { stdout, stderr, ...record };
}
await waitUntil(cfg.startedAt);
try {
  for (let n = 0; n < cfg.repetitions; n++) {
    await waitUntil(
      new Date(Date.parse(cfg.startedAt) + n * cfg.spacingSeconds * 1000).toISOString()
    );
    const id = workerId + '-' + (n + 1),
      target = { draftId: id };
    const files = ['scope', 'ac', 'origin', 'story', 'plan', 'vc'].map((s) =>
      path.join(cfg.recipe, s + '.md')
    );
    const created = await command(
      'create',
      [
        path.join(cfg.source, 'scripts/gh/create-issue.mjs'),
        '--shape',
        'solo',
        '--title',
        cfg.titlePrefix + ' ' + id,
        '--scope-file',
        files[0],
        '--ac-file',
        files[1],
        '--story-origin-file',
        files[2],
        '--user-story-file',
        files[3],
        '--plan-metadata-file',
        files[4],
        '--verification-commands-file',
        files[5],
        '--assignee',
        cfg.assignee,
        '--priority',
        'p2',
        '--label',
        'documentation',
      ],
      target,
      'backlog'
    );
    const issueNumber = Number(
      (created.stdout + '\n' + created.stderr).match(/AITM_CREATED_ISSUE=(\d+)/)?.[1]
    );
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1)
      throw Error('creation result missing issue identity');
    const item = {
      id,
      issueNumber,
      worktreeId: context.worktreeId,
      sessionId: context.sessionId,
      steps: [
        { name: 'create', startedAt: created.startedAt, endedAt: created.endedAt, exitCode: 0 },
      ],
    };
    evidence.workflows.push(item);
    await persist();
    const bin = path.join(cfg.source, 'bin/aitm.mjs');
    await command(
      'bind',
      [bin, 'start', String(issueNumber), '--role', 'agent', '--allow-foreign-worktree'],
      { issueNumber },
      'backlog'
    );
    const refineArgs = [
      bin,
      'refine',
      String(issueNumber),
      '--size',
      'S',
      '--estimate',
      '1',
      '--priority',
      'p2',
      '--rank',
      String(n + 1),
      '--reason',
      'Human-authorized disposable controlled benchmark',
      '--allow-foreign-worktree',
    ];
    const entered = await command('refine', refineArgs, { issueNumber }, 'backlog');
    item.steps.push({
      name: 'refine',
      startedAt: entered.startedAt,
      endedAt: entered.endedAt,
      exitCode: 0,
    });
    await persist();
    const ready = await command('ready-for-plan', refineArgs, { issueNumber }, 'refine');
    item.steps.push({
      name: 'ready-for-plan',
      startedAt: ready.startedAt,
      endedAt: ready.endedAt,
      exitCode: 0,
    });
    await persist();
    const planned = await command(
      'plan',
      [bin, 'plan', String(issueNumber), '--allow-foreign-worktree'],
      { issueNumber },
      'ready-for-plan'
    );
    item.steps.push({
      name: 'plan',
      startedAt: planned.startedAt,
      endedAt: planned.endedAt,
      exitCode: 0,
    });
    await persist();
    await command('stop', [bin, 'stop', '--allow-foreign-worktree'], { issueNumber }, 'plan');
  }
} catch (error) {
  evidence.failure = String(error.message);
  await persist();
}
await waitUntil(cfg.endedAt);
evidence.collectorEndedAt = new Date().toISOString();
await persist();
console.log(JSON.stringify({ workerId, finished: true, failure: evidence.failure || null }));
if (evidence.failure) process.exitCode = 1;
