// @story #1873
// Canonical local TIA; complete-lane escalation is verified by genuine cloud CI.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  selectAffectedTests,
  formatTestImpactReport,
} from '../task-tracker/lib/test-impact-selector.mjs';
import { createTestFileEnvironment } from '../run-tests-pool.mjs';
import { verifyCurrentCloudReceipts } from './verify-ci-receipts.mjs';

const planOnly = process.argv.length === 3 && process.argv[2] === '--plan';
if (process.argv.length !== 2 && !planOnly)
  throw new Error('usage: affected verification [--plan]');
const projectDir = process.cwd();
const changedPaths = execFileSync('git', ['diff', '--name-only', 'origin/trunk'], {
  cwd: projectDir,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
  cwd: projectDir,
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const selection = selectAffectedTests({
  projectDir,
  changedPaths: [...new Set([...changedPaths, ...untracked])],
});
if (planOnly) {
  console.log(JSON.stringify(selection, null, 2));
  process.exit(0);
}
console.log(formatTestImpactReport(selection));
if (selection.escalated) {
  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: projectDir,
    encoding: 'utf8',
  });
  if (dirty.trim())
    throw new Error(
      'affected verification requires committed source before complete-lane cloud verification'
    );
  console.log(JSON.stringify(verifyCurrentCloudReceipts({ projectDir }), null, 2));
} else {
  for (const file of selection.tests) {
    const result = spawnSync(process.execPath, ['--test', file], {
      cwd: projectDir,
      env: createTestFileEnvironment(process.env),
      stdio: 'inherit',
      timeout: 600000,
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
