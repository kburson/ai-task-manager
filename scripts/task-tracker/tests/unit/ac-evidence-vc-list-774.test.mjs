#!/usr/bin/env node
// @story #774
// @story #804
// #774 — the AC-evidence runner must consume the canonical by-id `vc-list`
// citation (the form #773's Refine-exit guardrail mandates), not just the
// legacy embedded/ordinal `cmd`. These cases pin the three read-sites that were
// widened to resolve `props['vc-list']`: extractCommands (via parseEvidenceAcs/
// findEvidenceAc) and parseAcEvidence (recognizing a stamped vc-list marker).

import { strict as assert } from 'node:assert';
import test from 'node:test';
import { parseEvidenceAcs, findEvidenceAc, stampAcEvidenceMarker } from '../../lib/ac-evidence.mjs';

const VC_LIST_BODY = [
  '## Verification Commands',
  '',
  '- [ ] `node --test x.test.mjs` <!-- id=1 -->',
  '- [ ] `npm run lint` <!-- id=3 -->',
  '',
  '## Acceptance Criteria',
  '',
  '- [ ] Runner resolves a by-id vc-list citation <!-- aitm-verified vc-list="vc:1" -->',
  '- [ ] Multi-command by-id citation <!-- aitm-verified vc-list="vc:1 vc:3" -->',
  '',
  '## Definition of Done',
  '',
].join('\n');

test('#774 parseEvidenceAcs resolves a vc-list citation to its VC command(s)', () => {
  const acs = parseEvidenceAcs(VC_LIST_BODY);
  assert.equal(acs.length, 2, 'both vc-list ACs are gated');
  assert.deepEqual(
    acs[0].evidenceCommands,
    ['node --test x.test.mjs'],
    'single vc-list citation resolves by id'
  );
  assert.deepEqual(
    acs[1].evidenceCommands,
    ['node --test x.test.mjs', 'npm run lint'],
    'multi vc-list citation resolves each id in order'
  );
});

test('#804 an empty vc-list on a verified AC THROWS at resolution — no silent zero-command green', () => {
  const EMPTY_VC_LIST_BODY = [
    '## Verification Commands',
    '',
    '- [ ] `node --test x.test.mjs` <!-- id=1 -->',
    '',
    '## Acceptance Criteria',
    '',
    '- [ ] Verified AC with an empty citation <!-- aitm-verified vc-list="" -->',
    '',
    '## Definition of Done',
    '',
  ].join('\n');
  assert.throws(
    () => parseEvidenceAcs(EMPTY_VC_LIST_BODY),
    /no resolvable verification command/,
    'the code-complete resolver fails loudly instead of reading the AC as satisfied'
  );
});

test('#804 a valid vc-list still resolves and stays gated (strictness does not over-fire)', () => {
  const acs = parseEvidenceAcs(VC_LIST_BODY);
  assert.equal(acs.length, 2, 'both real vc-list ACs remain gated after the strict change');
});

test('#774 findEvidenceAc locates a vc-list-declared AC by its stripped label', () => {
  const ac = findEvidenceAc(VC_LIST_BODY, 'Runner resolves a by-id vc-list citation');
  assert.ok(ac, 'the vc-list AC is found (extractCommands no longer returns [])');
  assert.deepEqual(ac.evidenceCommands, ['node --test x.test.mjs']);
});

test('#774 stamping a vc-list AC preserves vc-list and yields recognized evidence', () => {
  const label = 'Runner resolves a by-id vc-list citation';
  const stamped = stampAcEvidenceMarker(VC_LIST_BODY, label, {
    cmd: 'node --test x.test.mjs',
    sha: 'abc1234',
    ts: '2026-07-09T00:00:00.000Z',
    exit: 0,
  });
  assert.ok(
    stamped.includes('vc-list="vc:1"'),
    'the vc-list declaration is preserved by the stamp'
  );
  assert.ok(!/ cmd="/.test(stamped), 'no forbidden cmd attribute is introduced');
  const target = findEvidenceAc(stamped, label);
  assert.ok(
    target && target.evidenceMarker,
    'the stamped vc-list marker is recognized as evidence'
  );
  assert.equal(target.evidenceMarker.cmd, 'vc:1', 'evidence surfaces the vc-list citation as cmd');
  assert.equal(target.evidenceMarker.exit, 0);
  assert.equal(target.evidenceMarker.sha, 'abc1234');
});
