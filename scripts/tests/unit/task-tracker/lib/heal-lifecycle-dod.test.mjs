// @story #819
import assert from 'node:assert/strict';

import {
  detectStaleLifecycleForm,
  healLifecycleDod,
} from '../../../../task-tracker/lib/heal-lifecycle-dod.mjs';
import { parseLifecycleItems } from '../../../../task-tracker/lib/lifecycle-dod.mjs';
import { main } from '../../../../task-tracker/heal-lifecycle-dod.mjs';

function staleBody({ checked = false } = {}) {
  return [
    '## Definition of Done',
    '',
    '### Functional',
    '',
    '- [ ] Tests pass',
    '- [ ] Lint clean',
    '',
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    `- [${checked ? 'x' : ' '}] Passed final human review`,
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {} -->',
  ].join('\n');
}

function healedBody() {
  return [
    '## Definition of Done',
    '',
    '### Functional',
    '',
    '- [ ] Tests pass',
    '- [ ] Lint clean',
    '',
    '### Lifecycle (auto-ticked at Review/Close)',
    '',
    '- [ ] Agent Review Passed',
    '- [ ] Final Review Passed',
    '- [ ] Story closed and moved to Done',
    '- [ ] Timing data flushed to issue',
    '',
    '<!-- aitm-fields: {} -->',
  ].join('\n');
}

const mkStream = () => ({
  buf: '',
  write(s) {
    this.buf += s;
  },
});

// --- detectStaleLifecycleForm: finds the old single-checkbox form ----------
{
  const det = detectStaleLifecycleForm(staleBody());
  assert.equal(det.sectionPresent, true);
  assert.equal(det.affected, true, 'old single-checkbox form is affected');
  assert.equal(det.oldChecked, false);
}

// --- detectStaleLifecycleForm: an already-healed body is not affected ------
{
  const det = detectStaleLifecycleForm(healedBody());
  assert.equal(det.affected, false, 'two-checkbox form is not affected');
}

// --- detectStaleLifecycleForm: no Lifecycle section at all -----------------
{
  const src = ['## Definition of Done', '', '### Functional', '', '- [ ] Tests pass', ''].join(
    '\n'
  );
  const det = detectStaleLifecycleForm(src);
  assert.equal(det.sectionPresent, false);
  assert.equal(det.affected, false);
}

// --- AC-1: heal rewrites the old line to the two-checkbox form, unticked ---
{
  const { body, changed } = healLifecycleDod(staleBody());
  assert.equal(changed, true, 'healing a stale body reports changed');
  assert.equal(body, healedBody(), 'body matches the canonical two-checkbox form');

  const items = parseLifecycleItems(body);
  assert.deepEqual(
    items.map((it) => it.key),
    ['agent-review-passed', 'passed-final-review', 'story-closed', 'timing-flushed'],
    'every Lifecycle key resolves after healing'
  );
}

// --- AC-1: heal preserves a ticked old box onto Final Review Passed --------
{
  const { body, changed } = healLifecycleDod(staleBody({ checked: true }));
  assert.equal(changed, true);
  assert.ok(
    body.includes('- [ ] Agent Review Passed'),
    'Agent Review Passed is inserted fresh and unticked'
  );
  assert.ok(
    body.includes('- [x] Final Review Passed'),
    'the prior tick state is preserved onto Final Review Passed'
  );
}

// --- AC-2: healLifecycleDod is idempotent — second pass is a no-op ---------
{
  const once = healLifecycleDod(staleBody()).body;
  const twice = healLifecycleDod(once);
  assert.equal(twice.changed, false, 'healing an already-healed body is a no-op');
  assert.equal(twice.body, once, 'body is byte-identical on the second pass');
}

// --- AC-3: everything outside the Lifecycle section is left untouched -----
{
  const src = staleBody();
  const { body } = healLifecycleDod(src);
  assert.ok(body.includes('### Functional\n\n- [ ] Tests pass\n- [ ] Lint clean'));
  assert.ok(body.includes('<!-- aitm-fields: {} -->'), 'trailing marker survives untouched');
  assert.ok(
    body.startsWith(src.slice(0, src.indexOf('### Lifecycle'))),
    'everything before the Lifecycle section is byte-identical'
  );
}

// --- healLifecycleDod: a body with no Lifecycle section is untouched -------
{
  const src = ['## Definition of Done', '', '### Functional', '', '- [ ] Tests pass', ''].join(
    '\n'
  );
  const { body, changed } = healLifecycleDod(src);
  assert.equal(changed, false);
  assert.equal(body, src);
}

// --- AC-4: CLI main skips a closed issue with no body mutation -------------
{
  let mutateCalls = 0;
  const out = mkStream();
  await main(['--scope', '999', '--apply'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'PJ' }),
    fetchIssueMeta: async () => ({ body: staleBody(), state: 'CLOSED' }),
    mutateIssueBody: async () => {
      mutateCalls += 1;
      return { status: 'ok' };
    },
    out,
    err: mkStream(),
    exit: () => {},
  });
  assert.equal(mutateCalls, 0, 'AC-4: a closed issue triggers no body mutation');
  assert.match(out.buf, /#999\tskipped \(closed\)/, 'AC-4: closed issue is reported as skipped');
  assert.match(out.buf, /skipped=1/, 'AC-4: skip is tallied in the summary');
}

// --- CLI dry-run reports the affected issue, writes nothing -----------------
{
  let mutateCalls = 0;
  const out = mkStream();
  await main(['--scope', '999'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'PJ' }),
    fetchIssueMeta: async () => ({ body: staleBody(), state: 'OPEN' }),
    mutateIssueBody: async () => {
      mutateCalls += 1;
      return { status: 'ok' };
    },
    out,
    err: mkStream(),
    exit: () => {},
  });
  assert.equal(mutateCalls, 0, 'a dry-run (no --apply) writes nothing');
  assert.match(out.buf, /#999\tstale Lifecycle DoD/, 'reports the affected issue');
  assert.match(out.buf, /affected=1 healed=0/, 'summary tallies the affected issue');
}

// --- CLI apply writes the healed body through mutateIssueBody --------------
{
  let mutateArgs = null;
  const out = mkStream();
  await main(['--scope', '999', '--apply'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'PJ' }),
    fetchIssueMeta: async () => ({ body: staleBody(), state: 'OPEN' }),
    mutateIssueBody: async (args) => {
      mutateArgs = args;
      return { status: 'ok' };
    },
    out,
    err: mkStream(),
    exit: () => {},
  });
  assert.ok(mutateArgs, 'AC-4: --apply calls mutateIssueBody for the affected issue');
  assert.equal(mutateArgs.issueNumber, 999);
  assert.equal(mutateArgs.mutate(staleBody()), healedBody(), 'mutate callback heals the body');
  assert.match(out.buf, /affected=1 healed=1/, 'summary tallies the healed issue');
}

console.log('heal-lifecycle-dod.test.mjs: all assertions passed');
