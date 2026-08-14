// @story #763
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { tickLifecycleOnClose } from '../../../../task-tracker/verbs/close.mjs';
import { projectScratchDir } from '../../../../task-tracker/lib/scratch-dir.mjs';

const BODY = [
  '## Definition of Done',
  '',
  '### Lifecycle (auto-ticked at Review/Close)',
  '',
  '- [ ] Passed final human review',
  '- [ ] Story closed and moved to Done',
  '- [ ] Timing data flushed to issue',
  '',
].join('\n');

test('tickLifecycleOnClose stays offline through the injected pexec seam', async () => {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-763-close-'));
  const spawned = join(dir, 'spawned');
  const gh = join(dir, 'gh');
  writeFileSync(gh, `#!/bin/sh\nprintf spawned > "${spawned}"\nexit 88\n`);
  chmodSync(gh, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${dir}:${previousPath || ''}`;

  let body = BODY;
  const calls = [];
  const pexec = (bin, args, options = {}) => {
    calls.push({ bin, args: [...args], options: { ...options } });
    if (args[0] === 'issue' && args[1] === 'view') {
      return Promise.resolve({ stdout: body, stderr: '' });
    }
    if (args[0] === 'issue' && args[1] === 'edit') {
      const pending = Promise.resolve({ stdout: '', stderr: '' });
      pending.child = { stdin: { end: (value) => (body = String(value)) } };
      return pending;
    }
    return Promise.reject(new Error(`unexpected command: ${bin} ${args.join(' ')}`));
  };

  try {
    const result = await tickLifecycleOnClose({
      cfg: { repo: 'o/r' },
      issueNum: '763',
      pexec,
      deps: { sleep: async () => {} },
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 3, 'real lifecycle mutation performs fetch, push, verify');
    assert.match(body, /- \[x\] Story closed and moved to Done/);
    assert.match(body, /- \[x\] Timing data flushed to issue/);
    assert.match(body, /- \[ \] Passed final human review/);
    assert.equal(existsSync(spawned), false, 'no real gh process was spawned');
  } finally {
    process.env.PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
