// @story #123
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { projectScratchDir } from '../../lib/scratch-dir.mjs';

const repoRoot = new URL('../../../..', import.meta.url).pathname;
const script = join(repoRoot, 'scripts/gh/log-issue-time.mjs');

const TIMING_COMMENT_BODY =
  '## ⏱ Timing Log\n\n' +
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description |\n' +
  '|---|---|---|---|---|---|---|\n' +
  '| 2026-05-15 09:00 +00:00 | start | — | — | — | — | started |\n' +
  '| 2026-05-15 09:45 +00:00 | end | 45 | — | 100 | 500 | done |\n';

const BODY_NO_START =
  '<!-- aitm-fields: {"schema":1,"values":{"startTime":null,"engagedTime":null,"sessionTime":null,"reviewTime":null}} -->';
const BODY_WITH_START =
  '<!-- aitm-fields: {"schema":1,"values":{"startTime":"2026-05-01 08:00 +00:00","engagedTime":null,"sessionTime":null,"reviewTime":null}} -->';

const PROJECT_ID = 'PVT_FAKE';
const START_FIELD = 'F_START';

const FIELDS_WITH_ENGAGED = [
  { id: 'F_ENGAGED', name: 'Engaged Time' },
  { id: 'F_SESSION', name: 'Session Time' },
  { id: 'F_START', name: 'Start time' },
];
const FIELDS_NO_ENGAGED = [
  { id: 'F_SESSION', name: 'Session Time' },
  { id: 'F_START', name: 'Start time' },
];

// Stateful, `-q .body`-aware `gh` shim (#409). It stores the body pushed via
// `gh issue edit --body-file -` to a state file and serves it back, so the
// write path now exercises mutateIssueBody's fetch → push → verify loop.
function makeEnv({ initialBody, fieldNodes }) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'aitm-log-time-test-'));
  const binDir = join(temp, 'bin');
  const callLog = join(temp, 'gh-calls.log');
  const stateBody = join(temp, 'body-state.txt');
  mkdirSync(binDir);
  writeFileSync(stateBody, initialBody, 'utf8');

  const shim =
    `#!/usr/bin/env node\n` +
    `import fs from 'node:fs';\n` +
    `const args = process.argv.slice(2);\n` +
    `const CALL_LOG = ${JSON.stringify(callLog)};\n` +
    `const STATE = ${JSON.stringify(stateBody)};\n` +
    `const COMMENTS = ${JSON.stringify(TIMING_COMMENT_BODY)};\n` +
    `const FIELD_NODES = ${JSON.stringify(fieldNodes)};\n` +
    `const PROJECT_ID = ${JSON.stringify(PROJECT_ID)};\n` +
    `fs.appendFileSync(CALL_LOG, args.join(' ') + '\\n');\n` +
    `const has = (f) => args.includes(f);\n` +
    `const read = () => fs.readFileSync(STATE, 'utf8');\n` +
    `if (args[0] === 'issue' && args[1] === 'view' && has('comments')) {\n` +
    `  process.stdout.write(JSON.stringify({ comments: [{ body: COMMENTS }] }));\n` +
    `  process.exit(0);\n` +
    `}\n` +
    `if (args[0] === 'issue' && args[1] === 'view' && has('body')) {\n` +
    `  if (has('-q')) process.stdout.write(read());\n` +
    `  else process.stdout.write(JSON.stringify({ body: read() }));\n` +
    `  process.exit(0);\n` +
    `}\n` +
    `if (args[0] === 'issue' && args[1] === 'edit' && has('--body-file')) {\n` +
    `  const i = args.indexOf('--body-file');\n` +
    `  const src = args[i + 1];\n` +
    `  const body = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');\n` +
    `  fs.writeFileSync(STATE, body, 'utf8');\n` +
    `  process.exit(0);\n` +
    `}\n` +
    `if (args[0] === 'issue' && args[1] === 'edit') { process.exit(0); }\n` +
    `if (args[0] === 'api' && args[1] === 'graphql') {\n` +
    `  const input = fs.readFileSync(0, 'utf8');\n` +
    `  if (input.includes('projectItems')) {\n` +
    `    process.stdout.write(JSON.stringify({ data: { repository: { issue: { projectItems: { nodes: [{ id: 'PVTI_FAKE', project: { id: PROJECT_ID } }] } } }, node: { fields: { nodes: FIELD_NODES } } } }));\n` +
    `    process.exit(0);\n` +
    `  }\n` +
    `  process.stdout.write(JSON.stringify({ data: {} }));\n` +
    `  process.exit(0);\n` +
    `}\n` +
    `process.exit(0);\n`;

  const ghMock = join(binDir, 'gh');
  writeFileSync(ghMock, shim);
  chmodSync(ghMock, 0o755);

  const aitm = join(temp, '.ai-task-manager');
  mkdirSync(aitm);
  writeFileSync(
    join(aitm, 'task-tracker.json'),
    JSON.stringify({
      repo: 'owner/repo',
      projectId: PROJECT_ID,
      fieldStartTime: START_FIELD,
      fieldIds: { startTime: START_FIELD },
    })
  );

  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  return { temp, callLog, stateBody, env };
}

// 1. --dry-run shows startTime from earliest timing row without writing
{
  const { env, stateBody } = makeEnv({
    initialBody: BODY_NO_START,
    fieldNodes: FIELDS_WITH_ENGAGED,
  });
  const result = spawnSync(process.execPath, [script, '999', '--dry-run'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `dry-run failed\n${result.stderr}`);
  assert.match(result.stdout, /Start Time.*2026-05-15 09:00/, 'dry-run shows start timestamp');
  assert.match(result.stdout, /Dry run — no writes performed/);
  assert.equal(readFileSync(stateBody, 'utf8'), BODY_NO_START, 'dry-run does not mutate the body');
  console.log('PASS: dry-run shows repaired startTime from earliest timing row');
}

// 2. Live run repairs startTime AND routes the body write through mutateIssueBody
{
  const { callLog, stateBody, env } = makeEnv({
    initialBody: BODY_NO_START,
    fieldNodes: FIELDS_WITH_ENGAGED,
  });
  const result = spawnSync(process.execPath, [script, '999'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `live run failed\n${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /Start Time \(repaired\).*2026-05-15 09:00/);
  assert.match(result.stdout, /Fields updated/);

  const calls = readFileSync(callLog, 'utf8');
  assert.ok(calls.includes('api graphql'), `should call gh api graphql for field writes\n${calls}`);
  // AC1 routing proof: the body write used mutateIssueBody's stdin form, not a
  // raw `--body-file <tmpfile>`.
  assert.ok(
    /issue edit 999 --body-file -(\s|$)/m.test(calls),
    `body write must route through mutateIssueBody (--body-file -)\n${calls}`
  );
  assert.ok(
    !/issue edit 999 .*--body-file .*\.md/.test(calls),
    `must not write via a raw tmpfile path\n${calls}`
  );

  const finalBody = readFileSync(stateBody, 'utf8');
  assert.match(finalBody, /aitm-body-version/, 'mutateIssueBody stamped a body version');
  assert.match(finalBody, /"sessionTime":45/, 'timing values landed in the field DB');
  console.log('PASS: live run repairs startTime and routes body write through mutateIssueBody');
}

// 3. No startTime repair when already set in the issue body DB
{
  const { env, callLog } = makeEnv({ initialBody: BODY_WITH_START, fieldNodes: FIELDS_NO_ENGAGED });
  const result = spawnSync(process.execPath, [script, '999'], {
    encoding: 'utf8',
    env,
    cwd: repoRoot,
  });

  assert.equal(result.status, 0, `noop run failed\n${result.stderr}\n${result.stdout}`);
  assert.ok(
    !result.stdout.includes('Start Time (repaired)'),
    'should NOT repair when startTime already set'
  );
  const calls = readFileSync(callLog, 'utf8');
  assert.ok(
    /issue edit 999 --body-file -(\s|$)/m.test(calls),
    `body write still routes through mutateIssueBody\n${calls}`
  );
  console.log('PASS: no repair when startTime already present in issue body DB');
}

console.log('All log-issue-time tests passed.');
