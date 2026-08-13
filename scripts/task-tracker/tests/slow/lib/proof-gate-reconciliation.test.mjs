#!/usr/bin/env node
// @story #383
// #383 — end-to-end slow-lane test proving the #345 evidence gate and the #362
// checkbox-proof invariant are reconciled: a verifier-declaring AC carrying a
// canonical `aitm-ac-evidence` stamp can be ticked through the REAL write path.
//
// This is the regression that the pre-existing `ac-evidence-gate.test.mjs`
// test 2 could not catch. That test's `gh` shim recognized only `--jq` (the
// diagnostic fetch path in check.mjs), so the write-path fetch in
// `versioned-issue-write.mjs::ghFetchBody` (which uses `-q .body`) received
// malformed JSON, the line-anchored `toggleChecklistLine` never matched inside
// the single escaped-JSON line, and the mutate silently no-op'd — meaning
// #362 was NEVER exercised and the body was never actually written. The test
// proved only the diagnostic gate, producing a false green.
//
// This test uses a STATEFUL shim that persists the pushed body and serves the
// current body on `--jq`, `-q`, AND the JSON form, and saves stdin on
// `issue edit --body-file -`. It therefore drives `mutateIssueBody`'s
// `guardedMutate` through a real `- [ ]` → `- [x]` transition:
//   - Pre-fix: exit non-zero, `CheckboxProofMissingError` — #362 rejects the
//     `aitm-ac-evidence` marker it does not recognize.
//   - Post-fix: exit 0, and the PERSISTED body shows the AC ticked `- [x]`.

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../../lib/scratch-dir.mjs';
import { acKeyForLabel } from '../../../lib/ac-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const CLI = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

const AC_LABEL_VISIBLE = 'reconciled gate ticks a stamped verifier line';
const AC_LINE_VERIFY = '<!-- aitm-verified cmd="`npm test`" -->';
const FULL_LABEL = `${AC_LABEL_VISIBLE} ${AC_LINE_VERIFY}`;
const KEY = acKeyForLabel(AC_LABEL_VISIBLE);
const STAMP = ` <!-- aitm-ac-evidence:${KEY} cmd="npm test" exit=0 sha=abc1234 ts=2026-06-10T00:00:00.000Z -->`;

function baseBody() {
  return [
    '<!-- aitm-body-version: 1 -->',
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL_VISIBLE} ${AC_LINE_VERIFY}${STAMP}`,
    '- [ ] A plain criterion with no verifier',
    '',
    '## Pickup Directive',
    '',
    '- [x] Deep dive complete',
    '',
  ].join('\n');
}

function writeConfig(sandbox) {
  mkdirSync(path.join(sandbox, '.ai-task-manager'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker.json'),
    JSON.stringify({ repo: 'test-owner/test-repo', projectId: 'PVT_test' }, null, 2)
  );
}

function writeState(sandbox, issueNum) {
  // #573: the global ledger lives under `.tmp/aitm/state/`.
  mkdirSync(path.join(sandbox, '.tmp', 'aitm', 'state'), { recursive: true });
  writeFileSync(
    path.join(sandbox, '.tmp', 'aitm', 'state', 'task-tracker-state.json'),
    JSON.stringify({
      active: `#${issueNum}`,
      lastActive: `#${issueNum}`,
      entryStartTs: null,
      wordsAtEntryStart: 0,
    })
  );
}

// Stateful gh shim. Persists the issue body to `bodyStatePath` and serves the
// CURRENT body on every fetch form: `--jq .body`, `-q .body` (both raw), or
// the default JSON `{"body": "..."}`. On `issue edit --body-file -` it reads
// stdin and overwrites the persisted body. Everything else succeeds silently.
function makeGhShim(sandbox, bodyStatePath) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const STATE = ${JSON.stringify(bodyStatePath)};
const argv = process.argv.slice(2);
function currentBody() {
  try { return fs.readFileSync(STATE, 'utf8'); } catch { return ''; }
}
if (argv[0] === 'api' && argv[1] === 'user') {
  fs.writeSync(1, 'kburson');
  process.exit(0);
} else if (argv[0] === 'api' && argv[1] === 'graphql') {
  fs.writeSync(1, JSON.stringify({ data: { repository: { issue: {
    assignees: { nodes: [{ login: 'kburson' }] },
    projectItems: {
      nodes: [{ project: { id: 'PVT_test' }, fieldValueByName: { name: 'Develop' } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  } } } }));
  process.exit(0);
} else if (argv[0] === 'issue' && argv[1] === 'view') {
  const raw = argv.includes('--jq') || argv.includes('-q');
  const body = currentBody();
  if (raw) { fs.writeSync(1, body); }
  else { fs.writeSync(1, JSON.stringify({ body })); }
  process.exit(0);
} else if (argv[0] === 'issue' && argv[1] === 'edit' && argv.includes('--body-file')) {
  let data = '';
  process.stdin.on('data', (d) => { data += d; });
  process.stdin.on('end', () => { fs.writeFileSync(STATE, data); process.exit(0); });
} else {
  // Any other path (comment, api, label edits): succeed silently.
  process.exit(0);
}
`
  );
  chmodSync(ghShim, 0o755);
  return binDir;
}

async function run(sandbox, binDir, args) {
  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    AI_TASK_MANAGER_PROJECT_DIR: sandbox,
    TT_SKIP_NETWORK: '',
  };
  try {
    const r = await pexec('node', [CLI, ...args], { env, cwd: sandbox, timeout: 30000 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

// ─── Real-write: stamped AC tick persists `- [x]` through the write path ─────
{
  const sandbox = mkdtempProjectIsolated('tt-proof-gate-383-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 383);
    const bodyStatePath = path.join(sandbox, 'issue-body.md');
    writeFileSync(bodyStatePath, baseBody());
    const binDir = makeGhShim(sandbox, bodyStatePath);

    const r = await run(sandbox, binDir, ['check', `${FULL_LABEL}${STAMP}`]);

    assert.equal(
      r.code,
      0,
      `expected exit 0 (reconciled gate); stdout:\n${r.stdout}\nstderr:\n${r.stderr}`
    );
    assert.doesNotMatch(
      r.stderr,
      /CheckboxProofMissingError/,
      `#362 must accept aitm-ac-evidence; stderr:\n${r.stderr}`
    );

    // The body must have actually been written: the AC line now ticked.
    const persisted = readFileSync(bodyStatePath, 'utf8');
    const acLine = persisted.split('\n').find((l) => l.includes(AC_LABEL_VISIBLE));
    assert.ok(acLine, `AC line missing from persisted body:\n${persisted}`);
    assert.match(
      acLine,
      /^- \[x\]/,
      `AC line must be persisted as ticked; got:\n${acLine}\nfull:\n${persisted}`
    );
    console.log('proof-gate real-write passed: stamped AC ticked and persisted via write path');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('proof-gate-reconciliation.test.mjs: all passed');
