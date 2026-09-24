// @story #1731
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { projectFunctionalDod } from '../../../../task-tracker/lib/functional-dod-project.mjs';
import {
  parseFunctionalDodKeys,
  stampEvidenceMarker,
} from '../../../../task-tracker/lib/functional-dod-evidence.mjs';
import { canonicalRecordJson } from '../../../../task-tracker/lib/github-records/canonical-json.mjs';

const HEAD = 'a'.repeat(40);
const FIRST_TIME = '2026-09-21T10:00:00Z';

function body({
  acChecked = true,
  acsChecked = false,
  checkboxesChecked = false,
  extra = '',
} = {}) {
  return [
    '<!-- aitm-body-version version="7" -->',
    '## Scope',
    '',
    'Read-only Functional DoD projection for a lifecycle action.',
    '',
    '## Deep-Dive Analysis',
    '',
    'The derive pass must leave lifecycle and housekeeping boxes untouched.',
    '',
    '## Acceptance Criteria',
    '',
    `- [${acChecked ? 'x' : ' '}] Required behavior`,
    '- [x] Existing evidence remains attributable',
    '- [x] Explanation has no write adapter',
    '',
    '## Definition of Done',
    '',
    '### Functional (verified at Test)',
    '',
    '- [x] All automated tests pass <!-- dod:functional:tests -->',
    '- [x] Lint and format checks pass <!-- dod:functional:lint -->',
    '- [x] All changes committed <!-- dod:functional:commits -->',
    `- [${acsChecked ? 'x' : ' '}] Acceptance criteria met <!-- dod:functional:acs -->`,
    `- [${checkboxesChecked ? 'x' : ' '}] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->`,
    extra,
    '### Lifecycle (verified at Review)',
    '',
    '- [ ] Agent Review Passed',
    '',
    '### Housekeeping (verified at Close)',
    '',
    '- [ ] Story closed and moved to Done',
    '',
  ].join('\n');
}

test('projects ordered v2 acs and checkboxes intent without writing', () => {
  const original = body();
  const result = projectFunctionalDod({ body: original, head: HEAD, evaluatedAt: FIRST_TIME });
  assert.equal(result.normalization.normalizerId, 'functional-dod-derived/v1');
  assert.equal(result.normalization.disposition, 'persist-on-execute');
  assert.deepEqual(result.normalization.decisions, [
    { key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: true },
    { key: 'checkboxes', derivationRule: 'derive-checkboxes/v1', stamp: true, tick: true },
  ]);
  assert.equal(
    result.normalization.decisionDigest,
    `sha256:${createHash('sha256')
      .update(
        canonicalRecordJson({
          normalizerId: 'functional-dod-derived/v1',
          decisions: [
            { key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: true },
            { key: 'checkboxes', derivationRule: 'derive-checkboxes/v1', stamp: true, tick: true },
          ],
        })
      )
      .digest('hex')}`
  );
  assert.match(result.normalization.inputDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.body, /cmd="derive:all-acceptance-criteria-ticked"/);
  assert.match(result.body, /cmd="derive:all-non-self-non-lifecycle-checkboxes-ticked"/);
  assert.equal(body(), original, 'the input fixture remains unchanged');
});

test('keeps intent stable across evaluation times and is idempotent on projected body', () => {
  const original = body();
  const first = projectFunctionalDod({ body: original, head: HEAD, evaluatedAt: FIRST_TIME });
  const later = projectFunctionalDod({
    body: original,
    head: HEAD,
    evaluatedAt: '2026-09-21T11:00:00Z',
  });
  assert.deepEqual(first.normalization.decisions, later.normalization.decisions);
  assert.equal(first.normalization.decisionDigest, later.normalization.decisionDigest);
  assert.notEqual(first.body, later.body, 'actual marker timestamps remain execution-specific');
  assert.equal(
    projectFunctionalDod({ body: first.body, head: HEAD, evaluatedAt: FIRST_TIME }).normalization,
    null
  );
});

test('incomplete acceptance and unrelated unchecked requirements do not fabricate derived proof', () => {
  const incomplete = projectFunctionalDod({
    body: body({ acChecked: false }),
    head: HEAD,
    evaluatedAt: FIRST_TIME,
  });
  assert.equal(incomplete.normalization, null);
  const unrelated = projectFunctionalDod({
    body: body({ extra: '- [ ] Additional required check' }),
    head: HEAD,
    evaluatedAt: FIRST_TIME,
  });
  assert.deepEqual(
    unrelated.normalization.decisions.map((decision) => decision.key),
    ['acs']
  );
  assert.equal(
    parseFunctionalDodKeys(unrelated.body).find((item) => item.key === 'checkboxes').checked,
    false
  );
});

test('marker-present unticked keys are ticked without restamping', () => {
  let marked = body();
  for (const [key, cmd] of [
    ['acs', 'derive:all-acceptance-criteria-ticked'],
    ['checkboxes', 'derive:all-non-self-non-lifecycle-checkboxes-ticked'],
  ]) {
    marked = stampEvidenceMarker(marked, key, {
      cmd,
      sha: 'b'.repeat(40),
      ts: '2026-09-20T10:00:00Z',
      exit: 0,
    });
  }
  const projected = projectFunctionalDod({ body: marked, head: HEAD, evaluatedAt: FIRST_TIME });
  assert.deepEqual(projected.normalization.decisions, [
    { key: 'acs', derivationRule: 'derive-acs/v1', stamp: false, tick: true },
    { key: 'checkboxes', derivationRule: 'derive-checkboxes/v1', stamp: false, tick: true },
  ]);
  assert.doesNotMatch(projected.body, new RegExp(HEAD));
});

test('checked unstamped keys receive markers without another tick', () => {
  const projected = projectFunctionalDod({
    body: body({ acsChecked: true, checkboxesChecked: true }),
    head: HEAD,
    evaluatedAt: FIRST_TIME,
  });
  assert.deepEqual(projected.normalization.decisions, [
    { key: 'acs', derivationRule: 'derive-acs/v1', stamp: true, tick: false },
    { key: 'checkboxes', derivationRule: 'derive-checkboxes/v1', stamp: true, tick: false },
  ]);
  assert.equal(parseFunctionalDodKeys(projected.body).filter((item) => item.checked).length, 5);
});

test('independently complete checked and marked body has no pending normalization', () => {
  let complete = body({ acsChecked: true, checkboxesChecked: true });
  complete = stampEvidenceMarker(complete, 'acs', {
    cmd: 'derive:all-acceptance-criteria-ticked',
    sha: HEAD,
    ts: FIRST_TIME,
    exit: 0,
  });
  complete = stampEvidenceMarker(complete, 'checkboxes', {
    cmd: 'derive:all-non-self-non-lifecycle-checkboxes-ticked',
    sha: HEAD,
    ts: FIRST_TIME,
    exit: 0,
  });
  const projected = projectFunctionalDod({
    body: complete,
    head: 'b'.repeat(40),
    evaluatedAt: '2026-09-21T12:00:00Z',
  });
  assert.equal(projected.body, complete);
  assert.equal(projected.normalization, null);
});

test('changed HEAD produces fresh marker bytes despite equal decision intent', () => {
  const original = body();
  const first = projectFunctionalDod({ body: original, head: HEAD, evaluatedAt: FIRST_TIME });
  const changed = projectFunctionalDod({
    body: original,
    head: 'b'.repeat(40),
    evaluatedAt: FIRST_TIME,
  });
  assert.equal(first.normalization.decisionDigest, changed.normalization.decisionDigest);
  assert.notEqual(first.body, changed.body);
  assert.match(changed.body, /sha="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"/);
});

test('projected body bytes match the pinned pre-refactor legacy output', () => {
  const original = body();
  // Captured from the effectful transform before #1731 delegated it to this
  // projector. The issue-body writer's separate version bump is not part of
  // this pure transform; the entire projected body is compared here.
  const expected = original
    .replace(
      '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
      '- [x] Acceptance criteria met <!-- dod:functional:acs --> <!-- aitm-verified cmd="derive:all-acceptance-criteria-ticked" exit="0" sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-09-21T10:00:00Z" -->'
    )
    .replace(
      '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
      '- [x] Issue body checkboxes ticked <!-- dod:functional:checkboxes --> <!-- aitm-verified cmd="derive:all-non-self-non-lifecycle-checkboxes-ticked" exit="0" sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" ts="2026-09-21T10:00:00Z" -->'
    );
  const projected = projectFunctionalDod({ body: original, head: HEAD, evaluatedAt: FIRST_TIME });
  assert.equal(projected.body, expected);
});
