// @story #721
import assert from 'node:assert/strict';

import { detectLegacyAcCitations, healVcRefs } from '../../lib/heal-vc-refs.mjs';
import { parseVerificationCommands } from '../../lib/verification-commands.mjs';

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

// --- detectLegacyAcCitations: finds only the non-citation ACs --------------
{
  const det = detectLegacyAcCitations(fixtureBody());
  assert.equal(det.affected, true, 'body with legacy ACs reports affected');
  assert.equal(det.items.length, 3, 'the three legacy (non-citation) ACs are found');
  assert.deepEqual(
    det.items.map((it) => it.commands),
    [['npm test'], ['npm run lint'], ['npm test', 'npm run format:check']],
    'each legacy item reports its embedded command(s) in order'
  );
}

// --- detectLegacyAcCitations: a fully-cited body reports not affected ------
{
  const src = [
    '## Verification Commands',
    '',
    '- [ ] `npm test`',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Already cited AC <!-- aitm-verified cmd="vc:1" -->',
    '',
  ].join('\n');
  const det = detectLegacyAcCitations(src);
  assert.equal(det.affected, false, 'fully-cited body is not affected');
  assert.deepEqual(det.items, [], 'no items reported');
}

// --- healVcRefs: dedupes against the existing VC list, appends only new ----
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
    body.includes('Already cited AC <!-- aitm-verified cmd="vc:1" -->'),
    'already-cited AC is left untouched'
  );
  assert.ok(
    body.includes('Legacy dedupe AC <!-- aitm-verified cmd="vc:1" -->'),
    'legacy AC citing an existing VC command dedupes to its index, no new VC entry'
  );
  assert.ok(
    body.includes('Legacy new-command AC <!-- aitm-verified cmd="vc:2" -->'),
    'legacy AC citing a new command cites its freshly-appended index'
  );
  assert.ok(
    body.includes('Legacy multi AC <!-- aitm-verified cmd="vc:1 vc:3" -->'),
    'legacy multi-command AC cites both the existing and newly-appended indexes'
  );
}

// --- healVcRefs: idempotent — a second pass reports no further change -----
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

console.log('heal-vc-refs.test.mjs: all assertions passed');
