// @story #1916
// Actual public rollback and original bounded recording/audit behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { rollbackRecordedState } from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
import { readLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  budget,
  qualify,
  discoverOriginalCases,
  qualifyOriginalCases,
} from '../../../helpers/criteria-revision-transition-profiles.mjs';

for (const auditSucceeded of [true, false]) {
  test(`exhausted actual rollback reports failure when audit ${auditSucceeded ? 'succeeds' : 'fails'}`, async () => {
    const directory = mkdtempProjectIsolated('aitm-1916-compensation-');
    const capture = path.join(directory, 'audit.json');
    const fakeGh = path.join(directory, 'gh');
    fs.writeFileSync(
      fakeGh,
      `#!${process.execPath}\n` +
        `const fs=require('node:fs');\n` +
        `const args=process.argv.slice(2);\n` +
        `if(args[0]!=='issue'||args[1]!=='comment'||args[2]!=='1916')process.exit(91);\n` +
        `fs.writeFileSync(process.env.TASK_COMP_AUDIT_CAPTURE,JSON.stringify(args));\n` +
        `process.exit(process.env.TASK_COMP_AUDIT_FAIL==='1'?7:0);\n`,
      { mode: 0o755 }
    );
    const prior = {
      PATH: process.env.PATH,
      TASK_COMP_AUDIT_CAPTURE: process.env.TASK_COMP_AUDIT_CAPTURE,
      TASK_COMP_AUDIT_FAIL: process.env.TASK_COMP_AUDIT_FAIL,
    };
    process.env.PATH = directory + path.delimiter + prior.PATH;
    process.env.TASK_COMP_AUDIT_CAPTURE = capture;
    process.env.TASK_COMP_AUDIT_FAIL = auditSucceeded ? '0' : '1';
    const originalBody =
      '<!-- aitm-last-known-state state="test" ts="2026-10-06T10:00:00.010Z" -->\n## Scope\nKeep this text.\n\n<!-- aitm-body-version version="5" -->\n';
    let editAttempts = 0;
    const ctx = {
      issueArg: '1916',
      cfg: { repo: 'o/r' },
      pexec: async (file, args) => {
        assert.equal(file, 'gh');
        assert.deepEqual(args, ['issue', 'view', '1916', '-R', 'o/r', '--json', 'body']);
        return { stdout: JSON.stringify({ body: originalBody }) };
      },
      gh: async (args) => {
        editAttempts++;
        assert.deepEqual(args.slice(0, 6), ['issue', 'edit', '1916', '-R', 'o/r', '--body-file']);
        const bytes = fs.readFileSync(args[6], 'utf8');
        assert.equal(readLastKnownState(bytes).state, 'develop');
        assert.ok(bytes.includes('Keep this text.'));
        throw new Error(`original rollback write failed ${editAttempts}`);
      },
    };
    try {
      const result = await rollbackRecordedState(ctx, 'develop');
      assert.equal(editAttempts, 2, 'the actual original bounded program ran both attempts');
      const audit = JSON.parse(fs.readFileSync(capture, 'utf8'));
      assert.deepEqual(audit.slice(0, 6), ['issue', 'comment', '1916', '-R', 'o/r', '--body']);
      assert.match(audit[6], /aitm-state-recording-failed/);
      assert.match(audit[6], /original rollback write failed 2/);
      assert.equal(result.rolledBack, false);
      assert.equal(result.reason, 'state-recording-failed');
      assert.equal(result.priorState, 'develop');
      assert.deepEqual(result.recording, {
        status: 'failed',
        attempts: 2,
        error: 'original rollback write failed 2',
        auditPosted: auditSucceeded,
      });
    } finally {
      for (const [key, value] of Object.entries(prior)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
}

test(
  'complete original recording retry, board readback and marker atomicity profiles',
  { timeout: budget },
  (t) =>
    qualify(
      [
        'scripts/tests/unit/task-tracker/lib/coverage-state-recording.test.mjs',
        'scripts/tests/unit/task-tracker/lib/marker-write-retry.test.mjs',
        'scripts/tests/slow/task-tracker/lib/move-state/board-field-readback.test.mjs',
        'scripts/tests/unit/task-tracker/lib/move-state/move-state-board-marker-atomicity.test.mjs',
      ],
      31,
      t
    )
);

const related = discoverOriginalCases().filter(({ mode }) => mode.startsWith('compensation'));
const transport = related.filter(({ mode }) =>
  ['compensation', 'compensation-return-custody'].includes(mode)
);
test('independent compensation descriptors retain positive and all eight intent/body fault points', (t) => {
  assert.equal(related.length, 22);
  assert.equal(transport.length, 10);
  assert.equal(transport.filter(({ mode }) => mode === 'compensation-return-custody').length, 1);
  const faults = transport.filter(({ fault }) => fault !== null);
  assert.deepEqual(
    faults.map(({ fault }) => `${fault.when}:${fault.suffix}`).sort(),
    ['failBefore', 'failAfter']
      .flatMap((when) =>
        ['intent-write', 'intent-readback', 'body-effect-write', 'body-effect-readback'].map(
          (suffix) => `${when}:${suffix}`
        )
      )
      .sort()
  );
  assert.equal(related.filter(({ mode }) => mode === 'compensation-audit').length, 10);
  assert.deepEqual(
    related
      .filter(
        ({ mode }) =>
          !['compensation', 'compensation-return-custody', 'compensation-audit'].includes(mode)
      )
      .map(({ mode }) => mode)
      .sort(),
    ['compensation-late-config', 'compensation-late-read']
  );
  t.diagnostic(JSON.stringify(transport));
});
test(
  'actual original exhausted board and complete bounded compensation fault matrix',
  { timeout: budget, concurrency: true },
  (t) => qualifyOriginalCases(transport, t)
);
