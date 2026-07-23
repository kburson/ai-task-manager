#!/usr/bin/env node
// @story #301
// #301 — `assertDeepDiveAppendixClean` rejects gate-bearing sub-section
// headings (Acceptance Criteria / Verification Commands / Definition of Done)
// before any write. `buildDeepDiveBlock` calls it so the failure surfaces at
// the call site (TypeError naming the banned heading) rather than at the
// `gh-edit-guard` chokepoint.

import { strict as assert } from 'node:assert';
import { assertDeepDiveAppendixClean, buildDeepDiveBlock } from '../../../lib/deep-dive.mjs';

// ── assertDeepDiveAppendixClean ─────────────────────────────────────────────
{
  // Clean appendix — no throw.
  assert.doesNotThrow(() => assertDeepDiveAppendixClean('plain prose\n\n## Risks\n\n- one\n'));
  assert.doesNotThrow(() => assertDeepDiveAppendixClean(''));
  assert.doesNotThrow(() => assertDeepDiveAppendixClean(null));

  // Each banned heading throws TypeError naming it.
  for (const name of ['Acceptance Criteria', 'Verification Commands', 'Definition of Done']) {
    assert.throws(
      () => assertDeepDiveAppendixClean(`prose\n\n### ${name}\n- [ ] foo\n`),
      (err) => {
        assert.equal(err.name, 'TypeError');
        assert.match(err.message, new RegExp(name));
        assert.match(err.message, /root-level section/);
        return true;
      },
      `should throw for ${name}`
    );
  }

  // H2, H3, H4 all rejected.
  for (const hashes of ['##', '###', '####']) {
    assert.throws(() => assertDeepDiveAppendixClean(`prose\n\n${hashes} Acceptance Criteria\n`));
  }

  // False positive: banned heading text inside fenced code block → allow.
  assert.doesNotThrow(() =>
    assertDeepDiveAppendixClean('prose\n\n```md\n### Acceptance Criteria\n```\n')
  );
  assert.doesNotThrow(() =>
    assertDeepDiveAppendixClean('prose\n\n~~~\n## Verification Commands\n~~~\n')
  );

  // False positive: heading at the start of a line that is similar but not
  // banned → allow.
  assert.doesNotThrow(() => assertDeepDiveAppendixClean('### Acceptance Criteria Notes\n'));
}

// ── buildDeepDiveBlock delegates to the validator ───────────────────────────
{
  const ts = '2026-06-08T20:00:00.000Z';
  // Clean appendix — produces a block as before.
  const block = buildDeepDiveBlock({ ts, appendix: 'prose' });
  assert.match(block, /## Deep-Dive Analysis \(2026-06-08\)/);

  // Banned appendix — throws TypeError, no block returned.
  assert.throws(
    () => buildDeepDiveBlock({ ts, appendix: 'prose\n\n### Definition of Done\n- [ ] x\n' }),
    (err) => {
      assert.equal(err.name, 'TypeError');
      assert.match(err.message, /Definition of Done/);
      return true;
    }
  );
}

console.log('deep-dive-appendix-validation.test.mjs: all passed');
