// @story #2147 — required host qualification; cloud skips are not evidence.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
if (!process.env.CODEX_THREAD_ID || process.env.CODEX_THREAD_ID !== process.env.CODEX_SESSION_ID) {
  console.error(
    'Native reconciliation qualification requires the genuine Codex host session. No identity is supplied by this runner.'
  );
  process.exit(1);
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = execFileSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (!/^[0-9a-f]{40}$/.test(head) || dirty) {
  console.error('Native reconciliation qualification requires a clean implementation HEAD.');
  process.exit(1);
}
const parent = path.join(root, '.scratch/plan/b1', `host-qualified-${head}`);
mkdirSync(parent, { recursive: true });
const output = mkdtempSync(path.join(parent, 'run-'));
const result = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=tap',
    'scripts/tests/integration/task-tracker/reconcile-accept-live.test.mjs',
  ],
  { cwd: root, env: process.env, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 }
);
writeFileSync(path.join(output, 'stdout.log'), result.stdout ?? '');
writeFileSync(path.join(output, 'stderr.log'), result.stderr ?? '');
const requiredCases = [
  ...['reject', 'stale', 'confirm'].map((mode) => `native Start cache after ${mode}`),
  ...['audit-reject', 'audit-lost-ack', 'audit-fleeting-state', 'audit-fleeting-visit'].map(
    (mode) => `native cache after ${mode}`
  ),
  'native partial recovery',
  'native partial recovery after seed warning',
];
const names = [...(result.stdout ?? '').matchAll(/^# Subtest: (.+)$/gm)].map((m) => m[1]);
const summary = {};
let validSummary = true;
for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
  const matches = [...(result.stdout ?? '').matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))];
  if (matches.length !== 1) validSummary = false;
  else summary[key] = Number(matches[0][1]);
}
const missingCases = requiredCases.filter((name) => !names.includes(name));
const afterHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const afterDirty = execFileSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const passed =
  result.status === 0 &&
  !result.error &&
  validSummary &&
  summary.tests > 0 &&
  summary.pass === summary.tests &&
  ['fail', 'cancelled', 'skipped', 'todo'].every((key) => summary[key] === 0) &&
  missingCases.length === 0 &&
  head === afterHead &&
  !afterDirty;
const record = {
  head,
  afterHead,
  cleanAfter: !afterDirty,
  status: result.status,
  signal: result.signal,
  error: result.error?.message ?? null,
  summary,
  missingCases,
  passed,
};
writeFileSync(path.join(output, 'result.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ ...record, output }));
if (!passed)
  console.error(
    'Native reconciliation qualification failed; missing or skipped evidence cannot pass.'
  );
process.exit(passed ? 0 : 1);
