// @story #814
// Tests for the V5 ac-dod-vc-attributes validator (#814).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../../../../task-tracker/lib/agent-review/validators/ac-dod-vc-attributes.mjs';

// A body whose every AC cites a resolvable `vc:N` and whose every stampable
// Functional-DoD item carries an `aitm-verified cmd` verifier. Derived DoD
// items (acs/checkboxes) intentionally carry no verifier.
const WELL_FORMED = `## Acceptance Criteria

- [ ] Ships the widget and proves it. <!-- aitm-verified vc-list="vc:1" -->
- [ ] Registers the widget. <!-- aitm-verified vc-list="vc:1" -->

## Verification Commands

- [ ] \`node --test scripts/foo.test.mjs\` <!-- id=1 -->

## Definition of Done

### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests -->
- [ ] Lint and format checks pass <!-- aitm-verified cmd="\`npm run lint\`" --> <!-- dod:functional:lint -->
- [ ] All changes committed <!-- aitm-verified cmd="\`git log --oneline -1\`" --> <!-- dod:functional:commits -->
- [ ] Acceptance criteria met <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

<!-- aitm-fields: {"schema":1,"values":{}} -->`;

// Swap one AC line, keeping the rest of a WELL_FORMED body intact.
function withAcLines(acLines) {
  return WELL_FORMED.replace(
    /- \[ \] Ships the widget and proves it\. <!-- aitm-verified vc-list="vc:1" -->\n- \[ \] Registers the widget\. <!-- aitm-verified vc-list="vc:1" -->/,
    acLines
  );
}

test('passes a well-formed body — every AC cited, every stampable DoD item verified', () => {
  const res = validate({ body: WELL_FORMED });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('fails an un-cited AC and names it', () => {
  const body = withAcLines('- [ ] Ships the widget but cites nothing.');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Ships the widget but cites nothing/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a dangling vc:N citation and names the AC', () => {
  const body = withAcLines('- [ ] Ships the widget. <!-- aitm-verified vc-list="vc:9" -->');
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Ships the widget/.test(f) && /vc:9|dangling/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a resolvable-but-legacy backtick-embedded-cmd AC (vc-list-only form enforced)', () => {
  // The command is runnable, but the AC cites it via the deprecated embedded
  // `cmd="`…`"` attribute instead of a `vc-list="vc:N"` reference. V5 rejects
  // the legacy form at Review even though it resolves — the corpus is
  // vc-list-only for ACs (#773). Reason must be the specific `backtick-embedded-cmd`.
  const body = withAcLines(
    '- [ ] Ships the widget. <!-- aitm-verified cmd="`node --test scripts/foo.test.mjs`" -->'
  );
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /Ships the widget/.test(f) && /backtick-embedded-cmd/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('fails a stampable DoD item missing its verifier and names it', () => {
  const body = WELL_FORMED.replace(
    '- [ ] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->',
    '- [ ] All automated tests pass <!-- dod:functional:tests -->'
  );
  const res = validate({ body });
  assert.equal(res.pass, false);
  assert.ok(
    res.failures.some((f) => /tests/.test(f)),
    JSON.stringify(res.failures)
  );
});

test('a derived DoD item (acs/checkboxes) without a verifier does NOT fail', () => {
  // The derived items already carry no verifier in WELL_FORMED; a passing body
  // is itself the proof that derived items are exempt.
  const res = validate({ body: WELL_FORMED });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.ok(!res.failures.some((f) => /acs|checkboxes/.test(f)), JSON.stringify(res.failures));
});

test('absent Acceptance Criteria / Functional sections defer (vacuous pass)', () => {
  const res = validate({ body: '## Scope\n\nNo ACs, no DoD here.\n' });
  assert.equal(res.pass, true, JSON.stringify(res.failures));
  assert.deepEqual(res.failures, []);
});

test('bootstrap registers the validator on the shared singleton', async () => {
  await import('../../../../../../task-tracker/lib/agent-review/bootstrap.mjs');
  const { registry } = await import('../../../../../../task-tracker/lib/agent-review/registry.mjs');
  assert.ok(
    registry.validators().some((v) => v.id === 'ac-dod-vc-attributes'),
    'ac-dod-vc-attributes not registered'
  );
});
