#!/usr/bin/env node
// @story #345
// #345 — end-to-end slow-lane test for the Acceptance Criteria evidence gate.
//
// Drives the real `task-tracker.mjs check` CLI against a `gh` shim that serves
// a controlled issue body containing an AC line carrying an `aitm-verified-by`
// marker. Two paths:
//   1. Refusal: ticking the AC with no `aitm-ac-evidence` stamp → non-zero exit
//      with an `EVIDENCE_REQUIRED:` prefix that names the missing key + verifier.
//   2. Pass: once the body carries the matching `aitm-ac-evidence:<key>` stamp,
//      the same tick is allowed (exit 0).
//
// Also asserts the Functional DoD evidence gate is unaffected by routing through
// the new generalized `gateEvidenceTick` (a marked DoD line is still served and
// the check verb does not crash on it).

import { strict as assert } from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { mkdtempProjectIsolated } from '../../lib/scratch-dir.mjs';
import { acKeyForLabel } from '../../lib/ac-evidence.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dir, '..', '..', 'task-tracker.mjs');

const AC_LABEL_VISIBLE = 'check refuses to tick verified lines without a stamp';
const AC_LINE_VERIFY = '<!-- aitm-verified cmd="`npm test`" -->';
// The operator ticks by the full line text (the trailing marker is part of the
// line; `toggleChecklistLine` is line-anchored). The gate strips markers before
// matching, so the full label still resolves to the stripped AC label.
const FULL_LABEL = `${AC_LABEL_VISIBLE} ${AC_LINE_VERIFY}`;
const KEY = acKeyForLabel(AC_LABEL_VISIBLE);

function baseBody(extraOnAc = '') {
  return [
    '## Acceptance Criteria',
    '',
    `- [ ] ${AC_LABEL_VISIBLE} ${AC_LINE_VERIFY}${extraOnAc}`,
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
    JSON.stringify({ repo: 'test-owner/test-repo' }, null, 2)
  );
}

function writeState(sandbox, issueNum) {
  writeFileSync(
    path.join(sandbox, '.ai-task-manager', 'task-tracker-state.json'),
    JSON.stringify({
      active: `#${issueNum}`,
      lastActive: `#${issueNum}`,
      entryStartTs: null,
      wordsAtEntryStart: 0,
    })
  );
}

// gh shim: `issue view --json body --jq .body` returns the RAW body string
// (mirrors real `gh`'s --jq extraction). Any write path is a no-op success.
function makeGhShim(sandbox, body) {
  const binDir = path.join(sandbox, 'bin');
  mkdirSync(binDir, { recursive: true });
  const ghShim = path.join(binDir, 'gh');
  writeFileSync(
    ghShim,
    `#!/usr/bin/env node
import fs from 'node:fs';
const argv = process.argv.slice(2);
if (argv[0] === 'issue' && argv[1] === 'view') {
  const wantsJq = argv.includes('--jq');
  if (wantsJq) { fs.writeSync(1, ${JSON.stringify(body)}); }
  else { fs.writeSync(1, JSON.stringify({ body: ${JSON.stringify(body)} })); }
  process.exit(0);
}
// Any mutate/comment/api path: succeed silently.
process.exit(0);
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
    const r = await pexec('node', [CLI, ...args], { env, timeout: 30000 });
    return { code: 0, stdout: r.stdout, stderr: r.stderr };
  } catch (err) {
    return { code: err.code ?? 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

// ─── Test 1: tick AC with no stamp → refusal, EVIDENCE_REQUIRED, names key ───
{
  const sandbox = mkdtempProjectIsolated('tt-ac-gate-1-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 345);
    const binDir = makeGhShim(sandbox, baseBody());
    const r = await run(sandbox, binDir, ['check', FULL_LABEL]);
    assert.notEqual(
      r.code,
      0,
      `expected non-zero exit; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`
    );
    assert.match(r.stderr, /EVIDENCE_REQUIRED:/, `stderr:\n${r.stderr}`);
    assert.match(r.stderr, new RegExp(`aitm-ac-evidence:${KEY}`), `stderr:\n${r.stderr}`);
    assert.match(r.stderr, /ac-stamp/, `stderr:\n${r.stderr}`);
    assert.match(r.stderr, /npm test/, `stderr:\n${r.stderr}`);
    console.log('test 1 passed: unstamped AC tick refused with EVIDENCE_REQUIRED + key + verifier');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ─── Test 2: with the aitm-ac-evidence stamp present → tick allowed (exit 0) ──
{
  const sandbox = mkdtempProjectIsolated('tt-ac-gate-2-');
  try {
    writeConfig(sandbox);
    writeState(sandbox, 345);
    const stamp = ` <!-- aitm-ac-evidence:${KEY} cmd="npm test" exit=0 sha=abc1234 ts=2026-06-10T00:00:00.000Z -->`;
    const binDir = makeGhShim(sandbox, baseBody(stamp));
    const r = await run(sandbox, binDir, ['check', `${FULL_LABEL}${stamp}`]);
    assert.equal(r.code, 0, `expected exit 0; stdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /EVIDENCE_REQUIRED:/, `stderr:\n${r.stderr}`);
    console.log('test 2 passed: stamped AC tick allowed');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

console.log('ac-evidence-gate.test.mjs: all passed');
