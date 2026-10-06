// @story #1872
// CI-only receipt CLI; never shipped as a public package entrypoint.
import path from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { laneFiles } from '../run-tests-lanes.mjs';
import { planShards, validateShardReceipts } from '../run-tests-shards.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, lane, countText, receiptDir] = process.argv.slice(2);
  const total = Number(countText);
  const inventory = laneFiles(lane);
  const groups = planShards(inventory, total);
  if (mode === 'plan') {
    console.log(JSON.stringify({ lane, total, inventory, groups }, null, 2));
  } else if (mode === 'verify' && receiptDir) {
    const receipts = readdirSync(receiptDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map(({ name }) => {
        const dir = path.join(receiptDir, name);
        const exitText = readFileSync(path.join(dir, 'exit-code.txt'), 'utf8').trim();
        if (!/^\d+$/.test(exitText)) throw new Error('runner exit evidence invalid');
        return {
          timing: JSON.parse(readFileSync(path.join(dir, 'test-timing.json'), 'utf8')),
          exitCode: Number(exitText),
        };
      });
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const result = validateShardReceipts(receipts, { inventory, lane, commit, total });
    const receipt = {
      schema: 'aitm.ci-lane-results/v1',
      ...result,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      sourceHead: process.env.AITM_SOURCE_HEAD,
      results: receipts,
    };
    writeFileSync(
      path.join(receiptDir, 'lane-receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );
    console.log(JSON.stringify(result));
  } else {
    throw new Error('usage: test-shards.mjs plan|verify <lane> <count> [receipt-directory]');
  }
}
