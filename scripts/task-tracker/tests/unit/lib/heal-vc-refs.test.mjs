// @story #721
// @story #774
import assert from 'node:assert/strict';

import { detectLegacyAcCitations, healVcRefs, planVcRefHeal } from '../../../lib/heal-vc-refs.mjs';
import { parseVerificationCommands } from '../../../lib/verification-commands.mjs';
import { main } from '../../../heal-vc-refs.mjs';

function fixtureBody() {
  return [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Already cited AC <!-- aitm-verified cmd="vc:1" -->',
    '- [ ] Legacy dedupe AC <!-- aitm-verified cmd="`npm test`" -->',
    '- [ ] Legacy new-command AC <!-- aitm-verified cmd="`npm run lint`" -->',
    '- [ ] Legacy multi AC <!-- aitm-verified cmd="`npm test` `npm run format:check`" -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
}

const mkStream = () => ({
  buf: '',
  write(s) {
    this.buf += s;
  },
});

// --- detectLegacyAcCitations: finds BOTH forbidden forms (ordinal + embedded)
{
  const det = detectLegacyAcCitations(fixtureBody());
  assert.equal(det.affected, true, 'body with legacy ACs reports affected');
  assert.equal(det.items.length, 4, 'both the ordinal-cmd AC and the three embedded ACs are found');
  assert.deepEqual(
    det.items.map((it) => it.commands),
    [['npm test'], ['npm test'], ['npm run lint'], ['npm test', 'npm run format:check']],
    'each legacy item reports its resolved command(s) in order'
  );
}

// --- detectLegacyAcCitations: a body already in vc-list form is not affected -
{
  const src = [
    '## Verification Commands',
    '',
    '- [ ] `npm test` <!-- id=1 -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Already migrated AC <!-- aitm-verified vc-list="vc:1" -->',
    '',
  ].join('\n');
  const det = detectLegacyAcCitations(src);
  assert.equal(det.affected, false, 'by-id vc-list body is not affected');
  assert.deepEqual(det.items, [], 'no items reported');
}

// --- AC-1: heal converts legacy cmd markers to by-id vc-list + stamps VC ids -
{
  const { body, changed } = healVcRefs(fixtureBody());
  assert.equal(changed, true, 'healing a legacy body reports changed');

  const vcItems = parseVerificationCommands(body);
  assert.deepEqual(
    vcItems.map((it) => it.command),
    ['npm test', 'npm run lint', 'npm run format:check'],
    'VC list gains exactly the two genuinely-new commands, in first-seen order'
  );
  assert.ok(
    vcItems.every((it) => Number.isInteger(it.id)),
    'every VC entry is id-stamped so by-id resolution engages section-wide'
  );
  assert.deepEqual(
    vcItems.map((it) => it.id),
    [1, 2, 3],
    'existing entry keeps the lowest id; appended commands take the next ids'
  );

  assert.ok(
    body.includes('Already cited AC <!-- aitm-verified vc-list="vc:1" -->'),
    'ordinal cmd="vc:1" citation is migrated to the by-id vc-list form'
  );
  assert.ok(
    body.includes('Legacy dedupe AC <!-- aitm-verified vc-list="vc:1" -->'),
    'embedded AC citing an existing VC command dedupes to its id, no new VC entry'
  );
  assert.ok(
    body.includes('Legacy new-command AC <!-- aitm-verified vc-list="vc:2" -->'),
    'embedded AC citing a new command cites its freshly-appended id'
  );
  assert.ok(
    body.includes('Legacy multi AC <!-- aitm-verified vc-list="vc:1 vc:3" -->'),
    'multi-command AC cites both the existing and newly-appended ids by id'
  );
  assert.ok(!/cmd="/.test(body), 'the forbidden cmd attribute is dropped from every healed AC');
}

// --- healVcRefs: idempotent — a second pass reports no further change -------
{
  const once = healVcRefs(fixtureBody()).body;
  const twice = healVcRefs(once);
  assert.equal(twice.changed, false, 'healing an already-healed body is a no-op');
  assert.equal(twice.body, once, 'body is byte-identical on the second pass');
}

// --- healVcRefs: a body with no legacy ACs is untouched ---------------------
{
  const src = ['## Acceptance Criteria', '', '- [ ] Plain AC with no verifier', ''].join('\n');
  const { body, changed } = healVcRefs(src);
  assert.equal(changed, false, 'body with no legacy ACs reports unchanged');
  assert.equal(body, src, 'body returned byte-identical');
}

// --- AC-3: a stamped (run-props) AC is left intact, never rewritten ---------
{
  const src = [
    '## Verification Commands',
    '',
    '- [ ] `npm test` <!-- id=1 -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [x] Verified AC <!-- aitm-verified cmd="`npm test`" exit="0" sha="abc1234" ts="2026-07-09T00:00:00Z" -->',
    '',
  ].join('\n');
  const det = detectLegacyAcCitations(src);
  assert.equal(det.affected, false, 'AC-3: a stamped (run-props) AC is not detected as legacy');
  const { body, changed } = healVcRefs(src);
  assert.equal(changed, false, 'AC-3: heal refuses to rewrite a stamped proof marker');
  assert.equal(body, src, 'AC-3: body byte-identical');
}

// --- planVcRefHeal: reports the conversions without mutating ----------------
{
  const plan = planVcRefHeal(fixtureBody());
  assert.equal(plan.affected, true, 'plan flags the affected body');
  assert.deepEqual(plan.appendedCommands, ['npm run lint', 'npm run format:check']);
  assert.deepEqual(plan.stampedIds, [1, 2, 3], 'every id is freshly stamped (none pre-existed)');
  assert.deepEqual(
    plan.conversions.map((c) => c.vcList),
    ['vc:1', 'vc:1', 'vc:2', 'vc:1 vc:3'],
    'each legacy AC maps to its by-id citation'
  );
}

// --- AC-2: CLI main skips a closed issue with no body mutation --------------
{
  let mutateCalls = 0;
  const out = mkStream();
  await main(['--scope', '999', '--apply'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'PJ' }),
    fetchIssueMeta: async () => ({ body: fixtureBody(), state: 'CLOSED' }),
    mutateIssueBody: async () => {
      mutateCalls += 1;
      return { status: 'ok' };
    },
    out,
    err: mkStream(),
    exit: () => {},
  });
  assert.equal(mutateCalls, 0, 'AC-2: a closed issue triggers no body mutation');
  assert.match(out.buf, /#999\tskipped \(closed\)/, 'AC-2: closed issue is reported as skipped');
  assert.match(out.buf, /skipped=1/, 'AC-2: skip is tallied in the summary');
}

// --- AC-4: CLI dry-run reports planned conversions, writes nothing ----------
{
  let mutateCalls = 0;
  const out = mkStream();
  await main(['--scope', '999'], {
    loadConfig: () => ({ repo: 'o/r', projectId: 'PJ' }),
    fetchIssueMeta: async () => ({ body: fixtureBody(), state: 'OPEN' }),
    mutateIssueBody: async () => {
      mutateCalls += 1;
      return { status: 'ok' };
    },
    out,
    err: mkStream(),
    exit: () => {},
  });
  assert.equal(mutateCalls, 0, 'AC-4: a dry-run (no --apply) writes nothing');
  assert.match(out.buf, /#999\tlegacy ACs: 4/, 'AC-4: reports the affected AC count');
  assert.match(out.buf, /→ vc-list="vc:1"/, 'AC-4: reports a planned per-AC conversion');
  assert.match(out.buf, /→ vc-list="vc:1 vc:3"/, 'AC-4: reports the multi-command conversion');
  assert.match(out.buf, /stamping VC ids: 1, 2, 3/, 'AC-4: reports the VC ids it would stamp');
}

console.log('heal-vc-refs.test.mjs: all assertions passed');
