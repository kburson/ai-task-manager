// @story #1873
// Repository-only bridge: validate genuine CI artifacts; core records the real command.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { laneFiles } from '../run-tests-lanes.mjs';
import { validateShardReceipts } from '../run-tests-shards.mjs';

const LANES = ['unit', 'integration', 'slow'];
function fail(reason) {
  throw new Error(`cloud-receipt:${reason}`);
}
export function validateCloudRun(run, { head, repository }) {
  if (
    run?.repository?.full_name !== repository ||
    run.head_sha !== head ||
    run.path !== '.github/workflows/ci.yml' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !['pull_request', 'push', 'workflow_dispatch', 'schedule'].includes(run.event) ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1
  )
    fail('run identity or outcome');
  return run;
}
export function validateCloudLanes(records, { head, commit, run, inventories }) {
  if (records.length !== LANES.length || new Set(records.map((r) => r.lane)).size !== LANES.length)
    fail('missing or duplicate lane');
  let count = 0;
  for (const lane of LANES) {
    const record = records.find((r) => r.lane === lane);
    const total = lane === 'unit' ? 1 : 3;
    if (
      !record ||
      record.schema !== 'aitm.ci-lane-results/v1' ||
      record.sourceHead !== head ||
      record.commit !== commit ||
      record.runId !== String(run.id) ||
      record.runAttempt !== String(run.run_attempt) ||
      record.shards !== total ||
      record.count !== inventories[lane].length
    )
      fail('lane identity');
    const result = validateShardReceipts(record.results, {
      inventory: inventories[lane],
      lane,
      commit,
      total,
    });
    for (const { timing } of record.results) {
      if (
        timing.runnerProfile.platform !== 'linux' ||
        Object.values(timing.files).some((file) => !Number.isFinite(file.wallMs) || file.wallMs < 0)
      )
        fail('cloud timing');
    }
    count += result.count;
  }
  return { sourceHead: head, commit, runId: run.id, runAttempt: run.run_attempt, count };
}
function json(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
export function verifyCurrentCloudReceipts({ projectDir = process.cwd() } = {}) {
  const execute = (command, args) =>
    execFileSync(command, args, { cwd: projectDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const api = (route) => JSON.parse(execute('gh', ['api', route]));
  const head = execute('git', ['rev-parse', 'HEAD']).trim();
  if (!/^[a-f0-9]{40}$/.test(head)) fail('source head');
  if (execute('git', ['status', '--porcelain', '--untracked-files=no']).trim())
    fail('dirty source');
  const repository = json(path.join(projectDir, '.ai-task-manager/task-tracker.json')).repo;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) fail('repository');
  const remote = execute('git', ['config', '--get', 'remote.origin.url']).trim();
  if (
    ![
      `https://github.com/${repository}.git`,
      `https://github.com/${repository}`,
      `git@github.com:${repository}.git`,
    ].includes(remote)
  )
    fail('origin identity');
  const runs = api(
    `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${head}&per_page=100`
  ).workflow_runs;
  const run = runs.find((r) => r.status === 'completed' && r.conclusion === 'success');
  if (!run) fail('no successful exact-head CI run');
  validateCloudRun(run, { head, repository });
  const attempt = run.run_attempt;
  const names = [
    'ci-unit-1',
    ...['1', '2', '3'].map((i) => `ci-integration-${i}`),
    ...['1', '2', '3'].map((i) => `ci-slow-group-${i}`),
    'ci-fast-receipts',
    'ci-slow-receipt',
  ].map((n) => `${n}-${attempt}`);
  const artifacts = api(`repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
  if (artifacts.total_count > artifacts.artifacts.length) fail('incomplete artifact inventory');
  for (const name of names) {
    const matches = artifacts.artifacts.filter((a) => a.name === name);
    if (matches.length !== 1 || matches[0].expired)
      fail('missing, duplicate or expired artifact ' + name);
  }
  const root = path.join(projectDir, '.scratch', 'ci-receipts');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, `${run.id}-${attempt}-`));
  writeFileSync(
    path.join(dir, 'provenance.json'),
    JSON.stringify({ head, repository, run, artifacts }, null, 2) + '\n'
  );
  const marker = path.join(dir, 'ci-fast-receipts-' + attempt, 'unit', 'lane-receipt.json');
  execute('gh', [
    'run',
    'download',
    String(run.id),
    '--repo',
    repository,
    '--dir',
    dir,
    ...names.flatMap((name) => ['--name', name]),
  ]);
  const records = [
    json(marker),
    json(path.join(dir, 'ci-fast-receipts-' + attempt, 'integration', 'lane-receipt.json')),
    json(path.join(dir, 'ci-slow-receipt-' + attempt, 'lane-receipt.json')),
  ];
  const commit = records[0].commit;
  if (!/^[a-f0-9]{40}$/.test(commit)) fail('tested commit');
  if (commit !== head) {
    const object = api(`repos/${repository}/git/commits/${commit}`);
    if (
      run.event !== 'pull_request' ||
      object.sha !== commit ||
      object.parents.length !== 2 ||
      !object.parents.some((p) => p.sha === head)
    )
      fail('tested merge provenance');
  }
  const inventories = Object.fromEntries(LANES.map((lane) => [lane, laneFiles(lane)]));
  const result = validateCloudLanes(records, { head, commit, run, inventories });
  for (const record of records) {
    for (const aggregate of record.results) {
      const i = aggregate.timing.shard?.index ?? 1;
      const name =
        record.lane === 'slow'
          ? `ci-slow-group-${i}-${attempt}`
          : `ci-${record.lane}-${i}-${attempt}`;
      const worker = path.join(dir, name);
      const timing = json(path.join(worker, 'test-timing.json'));
      const exitText = readFileSync(path.join(worker, 'exit-code.txt'), 'utf8').trim();
      if (exitText !== '0' || JSON.stringify(timing) !== JSON.stringify(aggregate.timing))
        fail('worker/aggregate disagreement');
      const output = readFileSync(path.join(worker, 'test-output.log'), 'utf8');
      if (!output.trim()) fail('missing raw output');
    }
  }
  return { ...result, runUrl: run.html_url, artifactDirectory: dir };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) fail('usage: node scripts/maintenance/verify-ci-receipts.mjs');
  console.log(JSON.stringify(verifyCurrentCloudReceipts(), null, 2));
}
