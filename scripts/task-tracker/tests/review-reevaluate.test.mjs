#!/usr/bin/env node
// Integration: drive `task-tracker.mjs review` against a fake `gh` shim.
// Asserts:
//   1. Body fields-block patched with new size + estimate after first review.
//   2. Re-estimate audit comment posted exactly once across two consecutive reviews
//      (idempotency — second run sees matching body fields and no-ops).
//   3. Float! mutation argv shape: --input - with JSON-on-stdin (regression for #31).
//   4. TASK_TRACKER_SKIP_REEVAL=1 posts the bypass comment and skips field writes.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', 'task-tracker.mjs');

// Body that satisfies all body-gates AND has Deep-Dive content scoring to M
// (3 files, 4 steps, 2 risks, 2 deps → score = 4 + 4.5 + 2 + 1 = 11.5 → M).
const FIXTURE_BODY = `## Acceptance Criteria

- [x] AC item

## Pickup Directive

- [x] Deep dive complete

## Deep-Dive Analysis (2026-05-09)

### Files to edit

- a.mjs — line one of detail
- b.mjs — line two of detail
- c.mjs — line three of detail

### Step-by-step plan

1. Step one detail.
2. Step two detail.
3. Step three detail.
4. Step four detail.

### Identified risks

- Risk A description
- Risk B description

### Test additions

- Test one
- Test two
- Test three

### Notes

Padding line one for gate.
Padding line two for gate.
Padding line three for gate.
Padding line four for gate.
Padding line five for gate.

## Dependency Map

Depends on: #11 (reason), #12 (reason)
Blocks: none

### Verification Commands

- [x] \`node --version\`

<!-- ai-task-manager:fields:start -->
\`\`\`json
{"schema":1,"values":{"size":"S","estimate":3.5}}
\`\`\`
<!-- ai-task-manager:fields:end -->
`;

function buildShim({ sandbox, callsLog, bodyFile, commentsLog }) {
  return `#!/usr/bin/env node
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(${JSON.stringify(callsLog)}, JSON.stringify(argv) + '\\n');

// Read JSON-on-stdin for graphql --input - calls (regression for #31)
async function readStdin() {
  return await new Promise(res => {
    let buf = '';
    if (process.stdin.isTTY) return res('');
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { buf += c; });
    process.stdin.on('end', () => res(buf));
  });
}

if (argv[0] === 'issue' && argv[1] === 'view' && argv.includes('--json')) {
  const body = existsSync(${JSON.stringify(bodyFile)}) ? readFileSync(${JSON.stringify(bodyFile)}, 'utf8') : '';
  if (argv.includes('--jq')) process.stdout.write(body);
  else process.stdout.write(JSON.stringify({ body }));
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'edit') {
  const idx = argv.indexOf('--body-file');
  if (idx >= 0 && argv[idx+1]) {
    const body = readFileSync(argv[idx+1], 'utf8');
    writeFileSync(${JSON.stringify(bodyFile)}, body);
  }
  process.exit(0);
}
if (argv[0] === 'issue' && argv[1] === 'comment') {
  const idx = argv.indexOf('--body');
  const body = idx >= 0 ? argv[idx+1] : '';
  appendFileSync(${JSON.stringify(commentsLog)}, body + '\\n---END-COMMENT---\\n');
  process.exit(0);
}
if (argv[0] === 'api' && argv[1] === 'graphql') {
  const stdin = await readStdin();
  appendFileSync(${JSON.stringify(callsLog)}, 'STDIN:' + stdin + '\\n');
  let payload = {};
  try { payload = JSON.parse(stdin); } catch {}
  const q = payload.query || '';
  // projectItemForIssue
  if (/projectItems/.test(q) && /issue\\(number/.test(q) && !/fieldValues/.test(q)) {
    process.stdout.write(JSON.stringify({ data: { repository: { issue: {
      id: 'I_test', projectItems: { nodes: [{ id: 'PVTI_test', project: { id: 'PVT_test' } }] }
    } } } }));
    process.exit(0);
  }
  // projectValuesForIssue (has fieldValues)
  if (/fieldValues/.test(q)) {
    process.stdout.write(JSON.stringify({ data: { repository: { issue: {
      projectItems: { nodes: [{ project: { id: 'PVT_test' }, fieldValues: { nodes: [] } }] }
    } } } }));
    process.exit(0);
  }
  // fieldOptionMap
  if (/ProjectV2SingleSelectField/.test(q)) {
    process.stdout.write(JSON.stringify({ data: { node: { fields: { nodes: [
      { id: 'F_size', options: [
        { id: 'O_xs', name: 'XS' }, { id: 'O_s', name: 'S' }, { id: 'O_m', name: 'M' },
        { id: 'O_l', name: 'L' }, { id: 'O_xl', name: 'XL' },
      ] },
    ] } } } }));
    process.exit(0);
  }
  // updateProjectV2ItemFieldValue
  if (/updateProjectV2ItemFieldValue/.test(q)) {
    process.stdout.write(JSON.stringify({ data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_test' } } } }));
    process.exit(0);
  }
  // Default benign envelope (move-state, sub-issue lookups, etc.)
  process.stdout.write(JSON.stringify({ data: { repository: { issue: {
    id: 'I_test', subIssues: { nodes: [] }, parent: null,
    projectItems: { nodes: [{ id: 'PVTI_test', project: { id: 'PVT_test' } }] },
    comments: { nodes: [] },
  } } } }));
  process.exit(0);
}
process.exit(0);
`;
}

function setupSandbox({ skipReeval = false } = {}) {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tt-review-reeval-'));
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({
      repo: 'test-owner/test-repo',
      projectId: 'PVT_test',
      kanbanFieldId: 'F_status',
      fieldIds: { size: 'F_size', estimate: 'F_estimate' },
    }, null, 2)
  );
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'project-fields.json'),
    JSON.stringify([
      { key: 'size', name: 'Size', type: 'single_select' },
      { key: 'estimate', name: 'Estimate', type: 'number' },
    ])
  );
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({ active: '#999', lastActive: '#999', entryStartTs: null, wordsAtEntryStart: 0 })
  );
  mkdirSync(path.join(sandbox, 'scripts'), { recursive: true });

  const bodyFile = path.join(sandbox, 'issue-body.md');
  writeFileSync(bodyFile, FIXTURE_BODY);

  const callsLog = path.join(sandbox, 'gh-calls.log');
  const commentsLog = path.join(sandbox, 'gh-comments.log');
  writeFileSync(callsLog, '');
  writeFileSync(commentsLog, '');

  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(ghShim, buildShim({ sandbox, callsLog, bodyFile, commentsLog }));
  chmodSync(ghShim, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };
  if (skipReeval) env.TASK_TRACKER_SKIP_REEVAL = '1';
  return { sandbox, bodyFile, callsLog, commentsLog, env };
}

async function runReview(env) {
  try {
    const r = await pexec('node', [CLI, 'review', '#999'], { env, timeout: 30000 });
    return { stdout: r.stdout, stderr: r.stderr, code: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.code ?? 1 };
  }
}

function reevalCommentCount(commentsLog) {
  if (!existsSync(commentsLog)) return 0;
  const txt = readFileSync(commentsLog, 'utf8');
  return (txt.match(/### 🔁 Post-Deep-Dive re-estimate/g) || []).length;
}

// Test 1: idempotency + body patch + Float! shape.
{
  const { sandbox, bodyFile, callsLog, commentsLog, env } = setupSandbox();
  try {
    await runReview(env);

    const after1 = readFileSync(bodyFile, 'utf8');
    assert.match(after1, /"size":"M"/, 'body should be patched to size M after first review');
    assert.match(after1, /"estimate":8/, 'body should be patched to estimate 8 after first review');
    assert.equal(reevalCommentCount(commentsLog), 1, 'expected exactly one re-estimate comment after first review');

    // Float! regression: graphql calls go through --input - (no -F flags)
    const calls = readFileSync(callsLog, 'utf8');
    const graphqlInvocations = calls.split('\n').filter(l => l.startsWith('[') && l.includes('"graphql"'));
    assert.ok(graphqlInvocations.length > 0, 'expected at least one graphql invocation');
    for (const line of graphqlInvocations) {
      const argv = JSON.parse(line);
      assert.ok(argv.includes('--input') && argv.includes('-'),
        `graphql invocation must use --input -, got: ${line}`);
      assert.ok(!argv.some(a => a === '-F' || a === '-f'),
        `graphql invocation must not use -F/-f flags, got: ${line}`);
    }
    // STDIN payloads must parse as JSON with a query field.
    const stdinLines = calls.split('\n').filter(l => l.startsWith('STDIN:'));
    assert.ok(stdinLines.length > 0, 'expected STDIN payloads logged');
    for (const line of stdinLines) {
      const json = line.slice('STDIN:'.length);
      if (!json) continue;
      const parsed = JSON.parse(json);
      assert.ok(typeof parsed.query === 'string', 'graphql stdin payload missing query');
    }

    // Second review: body already matches → no new comment.
    await runReview(env);
    assert.equal(reevalCommentCount(commentsLog), 1,
      'expected exactly one re-estimate comment across two reviews (idempotency)');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// Test 2: TASK_TRACKER_SKIP_REEVAL=1 posts the bypass comment, body untouched.
{
  const { sandbox, bodyFile, commentsLog, env } = setupSandbox({ skipReeval: true });
  try {
    await runReview(env);
    const after = readFileSync(bodyFile, 'utf8');
    assert.match(after, /"size":"S"/, 'body must NOT be patched when reeval bypassed');
    const comments = readFileSync(commentsLog, 'utf8');
    assert.match(comments, /Bypassed via `TASK_TRACKER_SKIP_REEVAL=1`/,
      'expected bypass audit comment');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('review-reevaluate.test.mjs: all passed');
