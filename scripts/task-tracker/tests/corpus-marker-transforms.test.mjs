#!/usr/bin/env node
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
} from '../../maintenance/lib/corpus-marker-transforms.mjs';

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

// 12. Out-of-scope families never matched by the full chain.
{
  const untouched = [
    '<!-- aitm-fields {"priority":"P1","size":"M"} -->',
    '<!-- aitm-stage-rollup foo -->',
    '<!-- aitm-refinement-rationale: because -->',
    '<!-- aitm-full-auto-footnote:start -->',
  ];
  for (const u of untouched) {
    assert.equal(migrateBody(u), u, `out-of-scope marker must be untouched: ${u}`);
  }
}

// 13. Whole-chain idempotency on a mixed body.
{
  const body = [
    '## Issue',
    '<!-- aitm-entered-refine: 2026-06-01T00:00:00.000Z -->',
    '<!-- aitm-last-known-state: develop -->',
    '<!-- aitm-last-known-state-ts: 2026-06-02T00:00:00.000Z -->',
    '<!-- aitm-body-version: 4 -->',
    '<!-- aitm-blocked-by: #9 -->',
    '- [x] ac1 <!-- aitm-ac-evidence:ac1 cmd="t" exit=0 sha=abc1234 ts=2026-06-01T00:00:00.000Z -->',
  ].join('\n');
  const once = migrateBody(body);
  assert.equal(migrateBody(once), once, 'full chain idempotent on mixed body');
  assert.doesNotMatch(once, /aitm-entered-refine:/);
  assert.doesNotMatch(once, /aitm-last-known-state:\s/);
  assert.doesNotMatch(once, /aitm-body-version:/);
  assert.doesNotMatch(once, /aitm-blocked-by:/);
  assert.doesNotMatch(once, /aitm-ac-evidence:/);
}

// 14. migrateBodyWithFamilies reports the families that changed the body.
{
  const body = [
    '<!-- aitm-entered-refine: 2026-06-01T00:00:00.000Z -->',
    '<!-- aitm-body-version: 2 -->',
  ].join('\n');
  const { body: out, families } = migrateBodyWithFamilies(body);
  assert.deepEqual(families, ['stage-entry', 'body-version']);
  assert.equal(out, migrateBody(body));
  // clean body → no families
  const clean = migrateBodyWithFamilies('no markers here');
  assert.deepEqual(clean.families, []);
}

// 15. sha-ts NON-PAIR forms (#392/C6) — date-only, datetime-without-sha, and
//     `<ts> sha=<sha>` space-joined. None match the `<sha>:<ts>` pair RE; the
//     non-pair pass must still produce canonical `ts="…"` (+ sha when present).
{
  // 15a. date-only (#126 `aitm-dod-verified: 2026-05-19`).
  roundtrip(
    migrateShaTsPair,
    '<!-- aitm-dod-verified: 2026-05-19 -->',
    [/<!-- aitm-dod-verified ts="2026-05-19" -->/],
    /aitm-dod-verified:/
  );
  // 15b. datetime without sha.
  roundtrip(
    migrateShaTsPair,
    '<!-- aitm-test-started: 2026-05-18T13:35:00Z -->',
    [/<!-- aitm-test-started ts="2026-05-18T13:35:00Z" -->/],
    /aitm-test-started:/
  );
  // 15c. `<ts> sha=<sha>` space-joined (#169/#170).
  roundtrip(
    migrateShaTsPair,
    '<!-- aitm-dod-verified: 2026-05-18T13:35:00Z sha=8348f0b -->',
    [/aitm-dod-verified sha="8348f0b" ts="2026-05-18T13:35:00Z"/],
    /aitm-dod-verified:/
  );
  // 15d. canonical `<sha>:<ts>` pair still wins and is untouched by the non-pair
  //      pass (regression — the pair RE runs first, non-pair never re-fires).
  const pair = migrateShaTsPair('<!-- aitm-dod-verified: a1b2c3d:2026-06-01T00:00:00.000Z -->');
  assert.match(pair, /aitm-dod-verified sha="a1b2c3d" ts="2026-06-01T00:00:00\.000Z"/);
  assert.equal(migrateShaTsPair(pair), pair, 'pair form idempotent through non-pair pass');
}

// 16. legacy-keyed CONSOLIDATED proof markers (#392/C6) — a single
//     `<!-- aitm-verified ... -->` comment still carrying the legacy
//     `verified-at=` / `verified-by=` attribute names. The colon-form gate never
//     fired on these; the consolidated-legacy gate must now catch and rewrite
//     them onto cmd/sha/ts, preserving surviving evidence/proof attributes.
{
  // 16a. verified-by only (declaration form).
  {
    const line = '- [x] tests <!-- aitm-verified verified-by="npm run test:all" -->';
    const out = migrateProofMarkers(line);
    assert.match(out, /aitm-verified /, 'consolidated marker emitted');
    assert.match(out, /cmd="npm run test:all"/, 'verified-by normalized to cmd');
    assert.doesNotMatch(out, /verified-by=/, 'legacy verified-by key dropped');
    assert.equal(migrateProofMarkers(out), out, '16a idempotent');
  }
  // 16b. verified-at only with packed sha:ts + evidence/sha/proof preserved.
  {
    const line =
      '- [x] dod <!-- aitm-verified verified-at="d1c7866:2026-06-11T14:00:34.048Z" evidence="log" sha="sandbox" proof="none" -->';
    const out = migrateProofMarkers(line);
    assert.match(out, /ts="2026-06-11T14:00:34\.048Z"/, 'packed ts split out');
    // verified-at carried its own sha prefix; an explicit sha= attr already
    // present takes precedence, so sha stays "sandbox".
    assert.match(out, /sha="sandbox"/, 'explicit sha attribute preserved');
    assert.match(out, /evidence="log"/, 'evidence preserved');
    assert.match(out, /proof="none"/, 'proof preserved');
    assert.doesNotMatch(out, /verified-at=/, 'legacy verified-at key dropped');
    assert.equal(migrateProofMarkers(out), out, '16b idempotent');
  }
  // 16c. both legacy keys on one consolidated marker.
  {
    const line =
      '- [x] both <!-- aitm-verified verified-by="npm test" verified-at="abc1234:2026-06-01T00:00:00.000Z" -->';
    const out = migrateProofMarkers(line);
    const count = (out.match(/<!--\s*aitm-verified\s/g) || []).length;
    assert.equal(count, 1, `exactly one consolidated marker, got ${count}:\n${out}`);
    assert.match(out, /cmd="npm test"/);
    assert.match(out, /sha="abc1234"/, 'packed sha split out');
    assert.match(out, /ts="2026-06-01T00:00:00\.000Z"/);
    assert.doesNotMatch(out, /verified-(?:at|by)=/, 'both legacy keys dropped');
    assert.equal(migrateProofMarkers(out), out, '16c idempotent');
  }
  // 16d. an already-canonical consolidated marker (cmd/sha/ts) is left untouched.
  {
    const line =
      '- [x] clean <!-- aitm-verified cmd="npm test" sha="abc1234" ts="2026-06-01T00:00:00.000Z" -->';
    assert.equal(migrateProofMarkers(line), line, 'canonical proof marker untouched');
  }
}

// 17. prose-safe transform (#420) — `migrateProofMarkers` must NOT rewrite
//     legacy-marker grammar that appears only as documentation: inside inline-code
//     spans or fenced code blocks. Doing so corrupted prose example lines and was
//     non-idempotent (a fresh marker was appended each run).
{
  // 17a. inline-code mention — the legacy grammar lives inside a backtick span,
  //      so it is documentation, not a real declaration. Left byte-untouched.
  {
    const prose = 'The writer used to emit `<!-- aitm-verified-by: \\`cmd\\` -->` on each line.';
    assert.equal(migrateProofMarkers(prose), prose, 'inline-code mention untouched');
    assert.equal(migrateProofMarkers(prose), prose, 'inline-code mention idempotent');
  }
  // 17b. fenced code block — every line between fences is documentation.
  {
    const fenced = [
      'Example:',
      '```',
      '<!-- aitm-verified-at: abc1234:2026-06-01T00:00:00.000Z -->',
      '<!-- aitm-verified-by: `npm test` -->',
      '```',
      'end.',
    ].join('\n');
    assert.equal(migrateProofMarkers(fenced), fenced, 'fenced block untouched');
    assert.equal(migrateProofMarkers(fenced), fenced, 'fenced block idempotent');
  }
  // 17c. a genuine bare declaration on a real checklist line is STILL migrated —
  //      the prose-safety guard must not suppress real markers.
  {
    const line = '- [x] tests pass <!-- aitm-verified-by: `npm test` -->';
    const out = migrateProofMarkers(line);
    assert.match(out, /aitm-verified /, 'real declaration consolidated');
    assert.match(out, /cmd="`npm test`"/, 'cmd preserved');
    assert.doesNotMatch(out, /aitm-verified-by:/, 'legacy by stripped');
    assert.equal(migrateProofMarkers(out), out, 'real declaration idempotent');
  }
  // 17c2. double-backtick inline span — the legacy grammar is quoted inside a
  //       `` ``-delimited span (legal because the content holds single backticks).
  //       A naive single-backtick redaction stopped at the inner backticks and
  //       re-corrupted the prose every run; the run-length match must skip it.
  {
    const prose =
      '`commits` gains a marker: `` <!-- aitm-verified-by: `git log` --> `` for the audit.';
    assert.equal(migrateProofMarkers(prose), prose, 'double-backtick mention untouched');
    assert.equal(migrateProofMarkers(prose), prose, 'double-backtick mention idempotent');
  }
  // 17d. mixed body — a real checklist declaration above a fenced documentation
  //      block: only the real one is rewritten; the fenced example is preserved.
  {
    const body = [
      '- [x] real <!-- aitm-verified-by: `npm test` -->',
      '```',
      '<!-- aitm-verified-by: `example` -->',
      '```',
    ].join('\n');
    const out = migrateProofMarkers(body);
    const lines = out.split('\n');
    assert.match(lines[0], /aitm-verified /, 'real line migrated');
    assert.doesNotMatch(lines[0], /aitm-verified-by:/);
    assert.equal(lines[2], '<!-- aitm-verified-by: `example` -->', 'fenced example preserved');
    assert.equal(migrateProofMarkers(out), out, 'mixed body idempotent');
  }
}

// 18. `>`-bearing value dedup + idempotency (#420/#328) — a marker value may
//     legitimately contain `>` (e.g. a `<child>` placeholder in the command). The
//     strip regexes must tolerate it: the legacy marker is removed and ALL prior
//     consolidated copies collapse to exactly one. The old `[^>\n]` strip halted
//     at the interior `>`, leaving the legacy marker AND appending a fresh copy
//     each run (the #328 corruption: three identical consolidated markers).
{
  // 18a. legacy + three duplicate consolidated copies, all sharing a `>` value →
  //      one consolidated marker, no legacy, no duplicates.
  const dup = '<!-- aitm-verified cmd="`gh issue view <child> --json state` returned CLOSED" -->';
  const line = [
    '- [x] `#324` reaches Done.',
    '<!-- aitm-verified-by: `gh issue view <child> --json state` returned CLOSED -->',
    dup,
    dup,
    dup,
  ].join(' ');
  const out = migrateProofMarkers(line);
  assert.doesNotMatch(out, /aitm-verified-by:/, '18a legacy stripped despite > in value');
  assert.equal(
    (out.match(/<!--\s*aitm-verified\s/g) || []).length,
    1,
    '18a collapses to exactly one consolidated marker'
  );
  assert.equal(migrateProofMarkers(out), out, '18a idempotent (no append on re-run)');
}

// ---------------------------------------------------------------------------
// 19. stripSpuriousProseMarkers (#421) — remediate pre-#420 prose corruption:
//     spurious consolidated `aitm-verified` markers appended to prose lines.
// ---------------------------------------------------------------------------
{
  // 19a. a corrupted prose line — documentation sentence with a single spurious
  //      appended consolidated marker → marker removed, prose restored.
  const prose =
    'Writers emit the consolidated marker form. <!-- aitm-verified cmd="`npm test`" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'Writers emit the consolidated marker form.', '19a spurious marker stripped');
  assert.equal(stripSpuriousProseMarkers(out), out, '19a idempotent');
}
{
  // 19b. multiple appended markers (non-idempotent #390 damage) → all removed.
  const prose =
    'Documents the grammar. <!-- aitm-verified cmd="`a`" --> <!-- aitm-verified cmd="`b`" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'Documents the grammar.', '19b all spurious markers stripped');
  assert.equal(stripSpuriousProseMarkers(out), out, '19b idempotent');
}
{
  // 19c. placeholder-valued appended marker (e.g. #362/#367) is corruption here
  //      and must be stripped (unlike the residual scan, which hides placeholders).
  const prose = 'See the marker grammar. <!-- aitm-verified cmd="<short>" -->';
  const out = stripSpuriousProseMarkers(prose);
  assert.equal(out, 'See the marker grammar.', '19c placeholder-valued spurious marker stripped');
}
{
  // 19d. a genuine checklist DECLARATION/proof line must be byte-identical.
  const line =
    '- [x] All automated tests pass <!-- aitm-verified cmd="`npm run test:all`" --> <!-- dod:functional:tests -->';
  assert.equal(stripSpuriousProseMarkers(line), line, '19d genuine checklist line untouched');
}
{
  // 19e. an unchecked genuine checklist line is likewise untouched.
  const line =
    '- [ ] AC met <!-- aitm-verified cmd="`node x.mjs`" --> <!-- aitm-ac-evidence:ac1 -->';
  assert.equal(stripSpuriousProseMarkers(line), line, '19e unchecked checklist line untouched');
}
{
  // 19f. a marker quoted INSIDE an inline-code span on prose is documentation,
  //      not corruption — preserved verbatim.
  const prose = 'The marker looks like `<!-- aitm-verified cmd="x" -->` in the body.';
  assert.equal(stripSpuriousProseMarkers(prose), prose, '19f inline-code mention preserved');
}
{
  // 19g. a marker inside a fenced code block is documentation — preserved.
  const fenced = ['Example:', '```', '<!-- aitm-verified cmd="x" -->', '```', 'End.'].join('\n');
  assert.equal(stripSpuriousProseMarkers(fenced), fenced, '19g fenced mention preserved');
  assert.equal(stripSpuriousProseMarkers(fenced), fenced, '19g idempotent');
}
{
  // 19h. a prose line that is ONLY a spurious appended marker collapses to
  //      nothing and the line is dropped; pre-existing blank lines are kept.
  const body = ['Heading', '', '<!-- aitm-verified cmd="`x`" -->', 'Tail'].join('\n');
  const out = stripSpuriousProseMarkers(body);
  assert.equal(out, ['Heading', '', 'Tail'].join('\n'), '19h marker-only line dropped, blank kept');
  assert.equal(stripSpuriousProseMarkers(out), out, '19h idempotent');
}
{
  // 19i. legacy colon-form documentation TEXT (`aitm-verified-by`) is never
  //      matched — the `\s` boundary after `aitm-verified` protects it.
  const prose = 'The legacy marker was named `aitm-verified-by:` before #382.';
  assert.equal(stripSpuriousProseMarkers(prose), prose, '19i legacy-name prose untouched');
}
{
  // 19j. mixed body: corrupted prose cleaned, genuine checklist preserved, in a
  //      single pass — and the whole pass is idempotent.
  const body = [
    '## Scope',
    'Writers emit consolidated markers. <!-- aitm-verified cmd="`a`" -->',
    '',
    '- [x] tests pass <!-- aitm-verified cmd="`npm test`" --> <!-- dod:functional:tests -->',
  ].join('\n');
  const out = stripSpuriousProseMarkers(body);
  assert.match(out, /Writers emit consolidated markers\.$/m, '19j prose restored');
  assert.match(out, /- \[x\] tests pass <!-- aitm-verified/, '19j checklist preserved');
  assert.equal(
    (out.match(/<!--\s*aitm-verified\s/g) || []).length,
    1,
    '19j exactly the genuine marker remains'
  );
  assert.equal(stripSpuriousProseMarkers(out), out, '19j idempotent');
}

console.log('corpus-marker-transforms.test.mjs: all passed');
