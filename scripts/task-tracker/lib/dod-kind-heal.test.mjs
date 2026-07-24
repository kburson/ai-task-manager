#!/usr/bin/env node
// @story #899
// `reconcileDodForKind` re-filters a LIVE Functional-DoD block against the
// template for a NEW kind, the re-render `filterDodForKind` never gets a
// chance to do because it only runs once, at issue-creation time. Reproduced
// live on #860: a PBI-born epic kept the `git log --oneline -1` commits item
// and never gained the epic-only derived-trail item.
//
// This file is the verifier bound to all three ACs of #899:
//   AC1  kind-swap re-render: commits item swaps from the code alternative to
//        the epic alternative; every other item (and its evidence marker) is
//        byte-identical
//   AC2  idempotency: running the reconcile twice is a byte-identical no-op
//   AC3  every body-invariant marker survives a full-body reconcile (no
//        MarkerLossError via `findLostMarkers`)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileDodForKind } from './dod-kind-filter.mjs';
import { locateFunctionalSection } from './lifecycle-dod.mjs';
import { findLostMarkers } from './body-invariants.mjs';

// Mirrors the shape of `.ai-task-manager/templates/definition-of-done.md`'s
// Functional subsection (kind-blind, both `commits` alternatives present).
const TEMPLATE_DOD = `### Functional (verified at Test)

- [ ] All automated tests pass <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests --> <!-- dod:kinds exclude="spike,research" -->
- [ ] Lint and format checks pass <!-- aitm-verified cmd="\`npm run lint\` \`npm run format:check\`" --> <!-- dod:functional:lint -->
- [ ] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="\`git log --oneline -1\`" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->
- [ ] All children's commits are present on this branch (derived epic trail) <!-- aitm-verified cmd="\`node scripts/task-tracker/verify-epic-trail.mjs\`" --> <!-- dod:functional:commits --> <!-- dod:kinds include="epic" -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->

### Lifecycle (auto-ticked at Review/Close)
`;

// A `code`-shaped live block, as `preflight-issue.mjs` would have rendered it
// pre-#883 (or as `filterDodForKind` renders it for `code` today): the
// git-log commits alternative, no derived-trail line. `lint` and `commits`
// already carry stamped evidence — the exact state #860 was in.
const CODE_SHAPED_FUNCTIONAL = `
- [ ] All automated tests pass <!-- aitm-verified cmd="\`npm run test:all\`" --> <!-- dod:functional:tests -->
- [x] Lint and format checks pass <!-- aitm-verified cmd="\`npm run lint\` \`npm run format:check\`" exit="0" sha="abc123f" ts="2026-07-01T00:00:00Z" --> <!-- dod:functional:lint -->
- [x] All changes committed; commit messages follow project convention <!-- aitm-verified cmd="\`git log --oneline -1\`" exit="0" sha="abc123f" ts="2026-07-01T00:00:00Z" --> <!-- dod:functional:commits --> <!-- dod:kinds exclude="epic" -->
- [ ] Acceptance criteria met (including additions from deep dive) <!-- dod:functional:acs -->
- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->
`;

describe('AC1: kind-swap re-render (commits item, code -> epic)', () => {
  it('drops the git-log line, adds the derived-trail line, leaves everything else byte-identical', () => {
    const reconciled = reconcileDodForKind(CODE_SHAPED_FUNCTIONAL, TEMPLATE_DOD, 'epic');

    assert.doesNotMatch(reconciled, /git log --oneline -1/);
    assert.match(reconciled, /verify-epic-trail\.mjs/);
    assert.match(reconciled, /dod:kinds\s+include="epic"/);

    // The swapped-in item is the FRESH template line — no stale evidence marker
    // survives an item whose kind-membership actually changed.
    assert.doesNotMatch(reconciled, /verify-epic-trail\.mjs[^\n]*sha="abc123f"/);

    // Every other item — including its stamped evidence marker — is untouched.
    assert.match(reconciled, /\[x\] Lint and format checks pass[^\n]*sha="abc123f"/);
    assert.match(reconciled, /dod:functional:acs/);
    assert.match(reconciled, /dod:functional:checkboxes/);
  });

  it('code -> code (no kind change) is a byte-identical no-op', () => {
    const reconciled = reconcileDodForKind(CODE_SHAPED_FUNCTIONAL, TEMPLATE_DOD, 'code');
    assert.equal(reconciled, CODE_SHAPED_FUNCTIONAL);
  });
});

describe('AC2: idempotency', () => {
  it('reconciling twice produces byte-identical output', () => {
    const first = reconcileDodForKind(CODE_SHAPED_FUNCTIONAL, TEMPLATE_DOD, 'epic');
    const second = reconcileDodForKind(first, TEMPLATE_DOD, 'epic');
    assert.equal(second, first);
  });

  it('a block that already matches its kind reconciles to itself', () => {
    const epicShaped = reconcileDodForKind(CODE_SHAPED_FUNCTIONAL, TEMPLATE_DOD, 'epic');
    const reReconciled = reconcileDodForKind(epicShaped, TEMPLATE_DOD, 'epic');
    assert.equal(reReconciled, epicShaped);
  });
});

describe('AC3: every body-invariant marker survives the heal', () => {
  it('splicing the reconciled block back into a full body loses no invariant marker', () => {
    const before = [
      '<!-- aitm-fields: {"schema":1,"values":{}} -->',
      '<!-- aitm-body-version version="7" -->',
      '<!-- aitm-refine-complete ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-plan-approved ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-deep-dive-posted ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-deep-dive-complete ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-last-known-state state="develop" ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-entered-develop ts="2026-07-01T00:00:00Z" -->',
      '<!-- aitm-issue-kind kind="code" -->',
      '',
      '## Definition of Done',
      '',
      TEMPLATE_DOD.replace('### Lifecycle (auto-ticked at Review/Close)\n', '').trimEnd(),
      CODE_SHAPED_FUNCTIONAL.trim(),
      '',
      '### Lifecycle (auto-ticked at Review/Close)',
      '',
      '- [ ] Agent Review Passed',
      '- [ ] Final Review Passed',
      '- [ ] Story closed and moved to Done',
      '- [ ] Timing data flushed to issue',
      '',
    ].join('\n');

    const loc = locateFunctionalSection(before);
    assert.ok(loc, 'Functional section must be locatable in the synthetic body');
    const reconciled = reconcileDodForKind(loc.section, TEMPLATE_DOD, 'epic');
    const after = loc.before + reconciled + loc.after;

    assert.notEqual(after, before, 'sanity: the reconcile actually changed something');
    assert.deepEqual(findLostMarkers(before, after), []);
  });
});
