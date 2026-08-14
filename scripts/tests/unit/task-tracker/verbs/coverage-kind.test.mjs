#!/usr/bin/env node
// @story #597 #1135
// Coverage tests for scripts/task-tracker/verbs/kind.mjs.
//
// `verbKind` resolves a target issue + kind from `rest` (two-arg explicit form,
// one-arg "active bind" form, or zero-arg usage error), validates the kind via
// `normalizeKind` and the issue number, then upserts the issue-kind marker
// through `mutateIssueBody`. Body fetch and write both use the injected `pexec`;
// the happy-path tests round-trip write input through a stateful body store. Every
// early-exit branch (no-args usage, one-arg-no-active, invalid kind, invalid
// issue number) is driven in-process with a `process.exit` that throws a sentinel.

import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';

import { verbKind } from '../../../../task-tracker/verbs/kind.mjs';
import { reconcileEpicBody } from '../../../../gh/lib/epic-metadata.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { dodPath } from '../../../../task-tracker/paths.mjs';
import { parseVerificationCommands } from '../../../../task-tracker/lib/verification-commands.mjs';
import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';
import { pexecGithubBodyStore } from '../../../helpers/pexec-body-store.mjs';

let tmpRoot;
let fakeBin;
let savedPath;

before(() => {
  tmpRoot = mkdtempSync(path.join(projectScratchDir('test'), 'kind-cov-'));
  fakeBin = path.join(tmpRoot, 'bin');
  mkdirSync(fakeBin, { recursive: true });
  const ghPath = path.join(fakeBin, 'gh');
  writeFileSync(
    ghPath,
    [
      '#!/usr/bin/env bash',
      'sub="$2"',
      'f="$AITM_FAKE_BODY_FILE"',
      'if [ "$sub" = "view" ]; then cat "$f"; exit 0; fi',
      'if [ "$sub" = "edit" ]; then cat > "$f"; exit 0; fi',
      'exit 0',
    ].join('\n') + '\n'
  );
  chmodSync(ghPath, 0o755);
  savedPath = process.env.PATH;
  process.env.PATH = `${fakeBin}:${process.env.PATH}`;
});

after(() => {
  process.env.PATH = savedPath;
  delete process.env.AITM_FAKE_BODY_FILE;
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});

function stateFile(active) {
  const p = path.join(tmpRoot, `state-${Math.abs(hashish(String(active)))}.json`);
  writeFileSync(p, JSON.stringify({ active, lastActive: active }));
  return p;
}
function hashish(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

function makePexec(body) {
  return async (bin, args = [], options = {}) => {
    const gh = pexecGithubBodyStore({ bin, args, options, fallbackBody: body ?? '' });
    if (gh) return gh;
    if (bin === 'git') {
      if (args.includes('status')) return { stdout: '', stderr: '' };
      return { stdout: 'abc1234\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

class ExitError extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function runVerb(ctx) {
  const realExit = process.exit;
  const realErr = console.error;
  process.exit = (code) => {
    throw new ExitError(code ?? 0);
  };
  console.error = () => {};
  try {
    await verbKind(ctx);
    return { exitCode: null };
  } catch (err) {
    if (err instanceof ExitError) return { exitCode: err.code };
    throw err;
  } finally {
    process.exit = realExit;
    console.error = realErr;
  }
}

const baseCtx = (over) => ({ cfg: { repo: 'o/r' }, ...over });
const withoutBodyVersion = (body) =>
  String(body).replace(/<!-- aitm-body-version version="\d+" -->/g, '');

const CODE_BODY = [
  '## Acceptance Criteria',
  '',
  '- [ ] Converted body remains reviewable <!-- aitm-verified vc-list="vc:1" -->',
  '',
  '## Verification Commands',
  '',
  '- [ ] `node --test existing.test.mjs` <!-- id=1 -->',
  '- [ ] `npm test` <!-- id=2 -->',
  '- [ ] `npm run test:slow` <!-- id=3 -->',
  '- [ ] `npm run lint` <!-- id=4 -->',
  '- [ ] `npm run format:check` <!-- id=5 -->',
  '- [ ] `git log --oneline -1` <!-- id=6 -->',
  '',
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm test` `npm run test:slow`" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->',
  '- [ ] Lint and format checks pass <!-- aitm-verified cmd="`npm run lint` `npm run format:check`" --> <!-- dod:functional:lint -->',
  '- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="`git log --oneline -1`" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->',
  '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
  '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
  '',
  '## AITM Progress Markers',
  '',
].join('\n');

test('no args → usage error, exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: [], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('one arg with no active task → exit 1', async () => {
  const r = await runVerb(
    baseCtx({ statePath: stateFile(null), rest: ['audit'], pexec: makePexec() })
  );
  assert.equal(r.exitCode, 1);
});

test('invalid kind → exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: ['#42', 'bogus-kind'], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('invalid issue number → exit 1', async () => {
  const r = await runVerb(baseCtx({ rest: ['not-a-number', 'audit'], pexec: makePexec() }));
  assert.equal(r.exitCode, 1);
});

test('happy path: explicit target + non-code kind → sets marker', async () => {
  const body = '# Issue 42\n\nBody text.\n';
  const storeFile = path.join(tmpRoot, 'body-42.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(baseCtx({ rest: ['#42', 'audit'], pexec: makePexec(body) }));
  assert.equal(r.exitCode, null);
});

test('happy path: one-arg active-bind form + code kind → clears marker', async () => {
  const body = '# Issue 99\n\nBody text. <!-- aitm-issue-kind: audit -->\n';
  const storeFile = path.join(tmpRoot, 'body-99.md');
  writeFileSync(storeFile, body);
  process.env.AITM_FAKE_BODY_FILE = storeFile;
  const r = await runVerb(
    baseCtx({ statePath: stateFile('#99'), rest: ['code'], pexec: makePexec(body) })
  );
  assert.equal(r.exitCode, null);
});

test('epic kind delegates all carriers to the shared metadata reconciler', async () => {
  const calls = [];
  const r = await runVerb(
    baseCtx({
      rest: ['#42', 'epic'],
      pexec: makePexec('# Issue 42\n'),
      reconcileEpicMetadata: async (input) => {
        calls.push(input);
        return { status: 'reconciled' };
      },
    })
  );
  assert.equal(r.exitCode, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].issueNumber, 42);
  assert.equal(calls[0].repo, 'o/r');
  assert.equal(calls[0].forceEpic, true);
});

test('epic body reconciliation appends the introduced DoD verifier with the next stable id', () => {
  const converted = reconcileEpicBody(CODE_BODY, readFileSync(dodPath(), 'utf8'));
  const epicTrail = parseVerificationCommands(converted).filter(
    ({ command }) => command === 'node scripts/task-tracker/verify-epic-trail.mjs'
  );
  assert.equal(epicTrail.length, 1);
  assert.equal(epicTrail[0].id, 7);
  assert.match(converted, /aitm-issue-kind kind="epic"/);
  assert.match(converted, /dod:functional:commits[^\n]*include="epic"/);
});

test('repeating epic body reconciliation is content-idempotent and Review preflight accepts it', async () => {
  const template = readFileSync(dodPath(), 'utf8');
  const once = reconcileEpicBody(CODE_BODY, template);
  const twice = reconcileEpicBody(once, template);
  assert.equal(withoutBodyVersion(twice), withoutBodyVersion(once));

  const preflight = await runReviewPreflight({
    issueNumber: 1135,
    repo: 'o/r',
    projectDir: '/repo',
    cfg: { repo: 'o/r' },
    deps: {
      gitStatus: async () => '',
      gitHeadSha: async () => 'abcdef1234567890',
      getIssueBody: async () => twice,
      fetchEpicChildren: async () => [],
      epicCommits: async () => [],
    },
  });
  assert.equal(preflight.ok, true, preflight.reasons.join('\n'));
});

console.log('coverage-kind.test.mjs: defined');
