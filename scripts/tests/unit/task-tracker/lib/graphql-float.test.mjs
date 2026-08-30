#!/usr/bin/env node
// @story #31
// Regression test for issue #31: fractional Float! variables must round-trip.
//
// Before the fix, gql() flattened variables to `gh api graphql -F val=1.5`,
// which gh sent as the string "1.5" and GitHub rejected:
//   "Variable $val of type Float! was provided invalid value"
//
// After the fix, gql() sends `gh api graphql --input -` with a JSON payload
// where variables.val is a real JSON number.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const GH_LIB = path.resolve(__dir, '../../../gh/lib/github-projects.mjs');

const sandbox = mkdtempSync(path.join(projectScratchDir('test'), 'tt-graphql-float-'));
try {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const callsLog = path.join(sandbox, 'gh-calls.log');
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
let stdin = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) stdin += chunk;
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify({ argv: process.argv.slice(2), stdin }) + '\\n');
process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'ITEM_1' } } } }));
`
  );
  chmodSync(ghShim, 0o755);

  const driver = path.join(sandbox, 'driver.mjs');
  writeFileSync(
    driver,
    `
import { writeProjectFieldValue } from ${JSON.stringify(GH_LIB)};
await writeProjectFieldValue({
  projectId: 'PVT_test',
  itemId: 'ITEM_1',
  fieldId: 'FIELD_1',
  value: { number: 1.5 },
});
await writeProjectFieldValue({
  projectId: 'PVT_test',
  itemId: 'ITEM_1',
  fieldId: 'FIELD_1',
  value: { number: 0.5 },
});
await writeProjectFieldValue({
  projectId: 'PVT_test',
  itemId: 'ITEM_1',
  fieldId: 'FIELD_1',
  value: { number: 2.25 },
});
`
  );

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AITM_GH_TEST_DOUBLE_BIN: binDir,
  };

  await pexec('node', [driver], { env, timeout: 15000 });

  const lines = readFileSync(callsLog, 'utf8').trim().split('\n').filter(Boolean);
  assert.equal(lines.length, 3, `expected 3 gh invocations, got ${lines.length}`);

  const expected = [1.5, 0.5, 2.25];
  lines.forEach((line, i) => {
    const { argv, stdin } = JSON.parse(line);
    assert.deepEqual(
      argv,
      ['api', 'graphql', '--input', '-'],
      `call ${i}: argv must be JSON-on-stdin shape, got ${JSON.stringify(argv)}`
    );
    const payload = JSON.parse(stdin);
    assert.equal(
      typeof payload.variables.val,
      'number',
      `call ${i}: variables.val must be a JSON number, got ${typeof payload.variables.val}`
    );
    assert.equal(payload.variables.val, expected[i], `call ${i}: variables.val mismatch`);
    assert.match(payload.query, /\$val:\s*Float!/, `call ${i}: query must declare $val: Float!`);
  });

  console.log('graphql-float.test.mjs: all passed');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
