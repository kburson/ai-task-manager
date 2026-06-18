// @story #310
// Unit tests for scripts/maintenance/lib/corpus-marker-transforms.mjs (#389/C3).
//
// Per-family: (a) legacy → canonical conversion; (b) idempotency — a second
// pass is a byte-for-byte no-op; (c) the deep-dive-complete JSON-payload guard
// leaves structured relics untouched; (d) out-of-scope families never match.

import { strict as assert } from 'node:assert';
import {
  migrateStageEntry,
  migrateReentryAudit,
  migrateBackfill,
  migrateLifecycleTs,
  migrateBodyVersion,
  migrateShaTsPair,
  migrateLastKnownState,
  migrateEvidence,
  migrateBlockedBy,
  migrateCommits,
  migrateFullAutoApproved,
  migrateHumanReviewer,
  migrateProofMarkers,
  stripSpuriousProseMarkers,
  migrateBody,
  migrateBodyWithFamilies,
} from '../../../maintenance/lib/corpus-marker-transforms.mjs';

// Assert: transform converts `legacy` to something containing each of `expects`,
// the converted body still contains no legacy colon residue matching `legacyRe`,
// and a second pass is identical (idempotent).
function roundtrip(fn, legacy, expects, legacyRe) {
  const once = fn(legacy);
  for (const e of expects) assert.match(once, e, `expected ${e} in:\n${once}`);
  if (legacyRe) assert.doesNotMatch(once, legacyRe, `legacy residue left:\n${once}`);
  const twice = fn(once);
  assert.equal(twice, once, `not idempotent:\n--1--\n${once}\n--2--\n${twice}`);
  return once;
}

// 1. stage-entry — base + visit-numbered.
{
  roundtrip(
    migrateStageEntry,
    '<!-- aitm-entered-refine: 2026-06-01T00:00:00.000Z -->',
    [/<!-- aitm-entered-refine ts="2026-06-01T00:00:00\.000Z" -->/],
    /aitm-entered-refine:/
  );
  roundtrip(
    migrateStageEntry,
    '<!-- aitm-entered-develop-2: 2026-06-02T00:00:00.000Z -->',
    [/<!-- aitm-entered-develop-2 ts="2026-06-02T00:00:00\.000Z" -->/],
    /aitm-entered-develop-2:/
  );
}

// 1b. Adjacent stage markers on consecutive lines do NOT swallow each other.
{
  const legacy =
    '<!-- aitm-entered-plan: 2026-06-01T00:00:00.000Z -->\n<!-- aitm-entered-develop: 2026-06-02T00:00:00.000Z -->';
  const out = migrateStageEntry(legacy);
  assert.match(out, /aitm-entered-plan ts="2026-06-01T00:00:00\.000Z"/);
  assert.match(out, /aitm-entered-develop ts="2026-06-02T00:00:00\.000Z"/);
  assert.equal(out.split('\n').length, 2);
}

// 2. re-entry audit.
{
  roundtrip(
    migrateReentryAudit,
    '<!-- aitm-reentry-audit: develop-3 -->',
    [/<!-- aitm-reentry-audit stage="develop" visit="3" -->/],
    /aitm-reentry-audit:/
  );
}

// 3. backfill (stage:reason:ts).
{
  roundtrip(
    migrateBackfill,
    '<!-- aitm-backfill: refine:heal_missing_marker:2026-06-01T00:00:00.000Z -->',
    [
      /aitm-backfill /,
      /stage="refine"/,
      /reason="heal_missing_marker"/,
      /ts="2026-06-01T00:00:00\.000Z"/,
    ],
    /aitm-backfill:/
  );
}

// 4. lifecycle timestamp — each name.
{
  for (const name of [
    'plan-approved',
    'review-approved',
    'deep-dive-posted',
    'deep-dive-complete',
    'refine-complete',
  ]) {
    roundtrip(
      migrateLifecycleTs,
      `<!-- aitm-${name}: 2026-06-01T00:00:00.000Z -->`,
      [new RegExp(`<!-- aitm-${name} ts="2026-06-01T00:00:00\\.000Z" -->`)],
      new RegExp(`aitm-${name}:`)
    );
  }
}

// 4b. JSON-payload guard — structured deep-dive-complete relic untouched.
{
  const relic = '<!-- aitm-deep-dive-complete: {"verdict":"ok","score":3} -->';
  assert.equal(migrateLifecycleTs(relic), relic, 'JSON relic must be byte-untouched');
  assert.equal(migrateBody(relic), relic, 'JSON relic untouched through full chain');
}

// 5. body-version.
{
  roundtrip(
    migrateBodyVersion,
    '<!-- aitm-body-version: 7 -->',
    [/<!-- aitm-body-version version="7" -->/],
    /aitm-body-version:/
  );
}

// 6. sha:ts pair — both names.
{
  roundtrip(
    migrateShaTsPair,
    '<!-- aitm-dod-verified: a1b2c3d:2026-06-01T00:00:00.000Z -->',
    [/aitm-dod-verified sha="a1b2c3d" ts="2026-06-01T00:00:00\.000Z"/],
    /aitm-dod-verified: [0-9a-f]/
  );
  roundtrip(
    migrateShaTsPair,
    '<!-- aitm-test-started: deadbeef:2026-06-01T00:00:00.000Z -->',
    [/aitm-test-started sha="deadbeef" ts="2026-06-01T00:00:00\.000Z"/],
    /aitm-test-started: [0-9a-f]/
  );
}

// 7. last-known-state pair-merge (adjacent, with newline gap).
{
  roundtrip(
    migrateLastKnownState,
    '<!-- aitm-last-known-state: develop -->\n<!-- aitm-last-known-state-ts: 2026-06-01T00:00:00.000Z -->',
    [/aitm-last-known-state state="develop" ts="2026-06-01T00:00:00\.000Z"/],
    /aitm-last-known-state:\s/
  );
  // single combined marker emitted (the -ts half is consumed)
  const out = migrateLastKnownState(
    '<!-- aitm-last-known-state: test -->\n<!-- aitm-last-known-state-ts: 2026-06-02T00:00:00.000Z -->'
  );
  assert.doesNotMatch(out, /aitm-last-known-state-ts:/);
}

// 8. evidence full-quote — ac + dod.
{
  roundtrip(
    migrateEvidence,
    '<!-- aitm-ac-evidence:ac1 cmd="npm test" exit=0 sha=abc1234 ts=2026-06-01T00:00:00.000Z -->',
    [
      /aitm-ac-evidence key="ac1"/,
      /cmd="npm test"/,
      /exit="0"/,
      /sha="abc1234"/,
      /ts="2026-06-01T00:00:00\.000Z"/,
    ],
    /aitm-ac-evidence:/
  );
  roundtrip(
    migrateEvidence,
    '<!-- aitm-dod-evidence:lint cmd="npm run lint" exit=1 sha=def5678 ts=2026-06-01T00:00:00.000Z -->',
    [/aitm-dod-evidence key="lint"/, /exit="1"/],
    /aitm-dod-evidence:/
  );
}

// 9. blocked-by CSV-list.
{
  roundtrip(
    migrateBlockedBy,
    '<!-- aitm-blocked-by: #5, #6 -->',
    [/<!-- aitm-blocked-by refs="#5, #6" -->/],
    /aitm-blocked-by:/
  );
}

// 10. full-auto-approved — ISO-rich payload split via C1-fixed parser.
{
  const out = roundtrip(
    migrateFullAutoApproved,
    '<!-- aitm-full-auto-approved: 2026-06-01T00:00:00.000Z:env=ci,reviewer-unset -->',
    [/aitm-full-auto-approved ts="2026-06-01T00:00:00\.000Z"/, /signals="env=ci,reviewer-unset"/],
    /aitm-full-auto-approved:/
  );
  assert.ok(out.includes('signals='), 'signals preserved');
}

// 11. proof marker (#382) — legacy at/by consolidate, packed sha split.
{
  const legacy =
    '- [x] thing <!-- aitm-verified-at: abc1234:2026-06-01T00:00:00.000Z --> <!-- aitm-verified-by: `npm test` -->';
  const out = migrateProofMarkers(legacy);
  assert.match(out, /aitm-verified /, 'consolidated marker emitted');
  assert.match(out, /ts="2026-06-01T00:00:00\.000Z"/);
  assert.match(out, /sha="abc1234"/);
  assert.match(out, /cmd="`npm test`"/);
  assert.doesNotMatch(out, /aitm-verified-at:/, 'legacy at stripped');
  assert.doesNotMatch(out, /aitm-verified-by:/, 'legacy by stripped');
  assert.match(out, /^- \[x\] thing /, 'label text preserved');
  assert.equal(migrateProofMarkers(out), out, 'proof migration idempotent');
}

// 11a. proof marker — legacy-by BESIDE an existing canonical marker collapses
//      to ONE consolidated marker (no duplicate aitm-verified).
{
  const line =
    '- [x] tests pass <!-- aitm-verified-by: `npm test` --> <!-- aitm-verified cmd="npm test" sha="abc1234" ts="2026-06-01T00:00:00.000Z" -->';
  const out = migrateProofMarkers(line);
  const count = (out.match(/<!--\s*aitm-verified\s/g) || []).length;
  assert.equal(count, 1, `expected exactly one consolidated marker, got ${count}:\n${out}`);
  assert.doesNotMatch(out, /aitm-verified-by:/);
  assert.match(out, /sha="abc1234"/);
  assert.equal(migrateProofMarkers(out), out, 'collapse idempotent');
}

// 11b. human-reviewer — `<handle> @ <ts>` and handle-only.
{
  roundtrip(
    migrateHumanReviewer,
    '<!-- aitm-human-reviewer: alice @ 2026-06-01T00:00:00.000Z -->',
    [/aitm-human-reviewer handle="alice" ts="2026-06-01T00:00:00\.000Z"/],
    /aitm-human-reviewer:/
  );
  const out = migrateHumanReviewer('<!-- aitm-human-reviewer: bob -->');
  assert.match(out, /aitm-human-reviewer handle="bob" ts=""/);
}

// 11c. commits CSV-list.
{
  roundtrip(
    migrateCommits,
    '<!-- aitm-commits: abc1234,def5678 -->',
    [/<!-- aitm-commits shas="abc1234,def5678" -->/],
    /aitm-commits:/
  );
}
