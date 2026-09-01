#!/usr/bin/env node
// @story #496
// Verb-level tests for `report` (#496): the two-phase mandatory-review gate.
// Phase 1 drafts into the scratch dir and NEVER calls gh; phase 2 (--confirm)
// re-reads the draft and submits via the injected pexec exactly once, printing
// the returned issue URL. The submit is fully stubbed — no network, no real
// upstream repo.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { verbReport } from '../../../../task-tracker/verbs/report.mjs';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';

// Capture console output without leaking to the test reporter.
function capture(fn) {
  const out = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = origLog;
      console.error = origErr;
    })
    .then(() => out.join('\n'));
}

describe('verbReport two-phase gate', () => {
  let projectDir;
  before(() => {
    projectDir = mkdtempProjectIsolated('report-verb-496-');
  });
  after(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('phase 1 drafts to the scratch dir and never calls gh', async () => {
    let ghCalls = 0;
    const pexec = async () => {
      ghCalls += 1;
      return { stdout: '' };
    };
    const ctx = {
      projectDir,
      pexec,
      rest: [
        '--kind',
        'defect',
        '--from-hint',
        'promote gate refused',
        '--summary',
        'promote blew up',
      ],
    };
    const log = await capture(() => verbReport(ctx));
    assert.equal(ghCalls, 0, 'phase 1 must not submit');
    assert.match(log, /Nothing has been sent/);
    const reportDir = path.join(projectDir, '.scratch', 'report');
    const drafts = readdirSync(reportDir).filter((f) => f.endsWith('.md'));
    assert.equal(drafts.length, 1);
    const body = readFileSync(path.join(reportDir, drafts[0]), 'utf8');
    assert.match(body, /<!-- aitm-beta-defect -->/);
    assert.match(body, /gate refused/);
    assert.match(body, /`promote`/);
  });

  it('phase 2 --confirm submits exactly once and prints the URL', async () => {
    let ghArgs = null;
    let ghCalls = 0;
    const pexec = async (cmd, args) => {
      ghCalls += 1;
      ghArgs = { cmd, args };
      return { stdout: 'https://github.com/kburson/ai-task-manager/issues/999\n' };
    };
    const draftPath = path.join(projectDir, '.scratch', 'report', 'confirm-draft.md');
    writeFileSync(
      draftPath,
      '<!-- aitm-beta-defect -->\n## What happened\nit broke badly\n\n## Environment\n- ai-task-manager: 1.0.0\n'
    );
    const ctx = {
      projectDir,
      pexec,
      rest: ['--kind', 'defect', '--summary', 'it broke', '--confirm', '--draft', draftPath],
    };
    const log = await capture(() => verbReport(ctx));
    assert.equal(ghCalls, 1, 'confirm must submit exactly once');
    assert.equal(ghArgs.cmd, 'gh');
    assert.deepEqual(ghArgs.args.slice(0, 4), [
      'issue',
      'create',
      '--repo',
      'kburson/ai-task-manager',
    ]);
    assert.ok(ghArgs.args.includes('🐞 it broke'));
    assert.match(log, /issues\/999/);
  });
});
