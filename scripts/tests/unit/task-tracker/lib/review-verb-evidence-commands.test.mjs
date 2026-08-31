// @story #226 #1089
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { STANDARD_DOD_COMMANDS } from '../../../../task-tracker/lib/evidence-markers.mjs';
import { NON_DEMONSTRABLE_TAG_RE } from '../../../../task-tracker/lib/body-invariants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const reviewVerbPath = path.resolve(__dirname, '../../../task-tracker/verbs/review.mjs');
const reviewSource = readFileSync(reviewVerbPath, 'utf8');

// ---------------------------------------------------------------------------
// #226: STANDARD_DOD_COMMANDS contract — the canonical evidence commands
// must be exported and contain the expected entries. The review verb's seed
// relies on this set; any change here is a contract change requiring review.
// ---------------------------------------------------------------------------
{
  assert.ok(STANDARD_DOD_COMMANDS instanceof Set, 'STANDARD_DOD_COMMANDS is a Set');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm test'), 'includes npm test');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run test:slow'), 'includes npm run test:slow');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run test:all'), 'includes legacy npm run test:all');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run lint'), 'includes npm run lint');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run format:check'), 'includes npm run format:check');
  assert.equal(
    STANDARD_DOD_COMMANDS.size,
    5,
    'pre-#1089 Review trust is limited to five standard commands'
  );
  console.log('PASS: STANDARD_DOD_COMMANDS contract pinned');
}

// ---------------------------------------------------------------------------
// #226: review.mjs imports STANDARD_DOD_COMMANDS — the import line must exist
// or the seed step would throw at module-load time. Source-level pin so a
// future refactor that drops the import is caught here.
// ---------------------------------------------------------------------------
{
  assert.match(
    reviewSource,
    /import\s+\{\s*STANDARD_DOD_COMMANDS\s*\}\s+from\s+['"]\.\.\/lib\/evidence-markers\.mjs['"]/,
    'review.mjs imports STANDARD_DOD_COMMANDS from lib/evidence-markers.mjs'
  );
  console.log('PASS: review.mjs imports STANDARD_DOD_COMMANDS');
}

// ---------------------------------------------------------------------------
// #1089: Review resolves exact-SHA receipt evidence before the consumer loop.
// The resolver owns the bounded legacy STANDARD_DOD_COMMANDS seed as well as
// v1 validation, so the verb must not restore an unconditional trust loop.
// ---------------------------------------------------------------------------
{
  const sandboxRefusalIdx = reviewSource.indexOf('missing `aitm-dod-verified` marker');
  const resolverIdx = reviewSource.indexOf(
    'const reviewEvidence = await resolveReviewVerificationEvidence'
  );
  const resultIdx = reviewSource.indexOf(
    'const commandResults = reviewEvidence.commandResults',
    resolverIdx
  );
  const evidenceLoopIdx = reviewSource.indexOf('evidenceCommands.filter');

  assert.ok(sandboxRefusalIdx > 0, 'sandbox-verified refusal block exists');
  assert.ok(resolverIdx > 0, 'receipt resolver call exists');
  assert.ok(resultIdx > resolverIdx, 'consumer map comes from validated evidence');
  assert.ok(evidenceLoopIdx > 0, 'evidenceCommands consumer loop exists');
  assert.ok(
    resolverIdx > sandboxRefusalIdx,
    'receipt validation runs after the marker-presence guard'
  );
  assert.ok(resultIdx < evidenceLoopIdx, 'validated results seed before evidence consumption');
  assert.doesNotMatch(
    reviewSource,
    /for \(const cmd of STANDARD_DOD_COMMANDS\)[\s\S]*commandResults\.set\(cmd, true\)/,
    'Review has no unconditional STANDARD_DOD_COMMANDS trust loop'
  );
  console.log('PASS: review.mjs validates receipt evidence before command consumption');
}

// ---------------------------------------------------------------------------
// #226: simulate the consumer-side check. Given a seeded commandResults map,
// every STANDARD_DOD_COMMANDS entry resolves as known + passed — the two
// conditions the evidenceCommands loop checks before declaring a regression
// (one for `!commandResults.has(cmd)` → unknown evidence; another for
// `commandResults.get(cmd) !== true` → failed evidence).
// ---------------------------------------------------------------------------
{
  const commandResults = new Map();
  for (const cmd of STANDARD_DOD_COMMANDS) {
    commandResults.set(cmd, true);
  }
  for (const cmd of ['npm test', 'npm run lint', 'npm run format:check']) {
    assert.ok(commandResults.has(cmd), `${cmd} is known`);
    assert.equal(commandResults.get(cmd), true, `${cmd} resolves as passed`);
  }
  // A non-standard command remains unknown — the seed does not leak.
  assert.equal(commandResults.has('npm run e2e'), false, 'non-standard command stays unknown');
  console.log('PASS: seeded commandResults satisfies the evidenceCommands consumer contract');
}

// ---------------------------------------------------------------------------
// #226: without the sandbox-verified marker, the verb refuses before reaching
// the seed step — the refusal block calls process.exit(4). Pin the refusal
// message so the gate cannot be silently weakened.
// ---------------------------------------------------------------------------
{
  assert.match(
    reviewSource,
    /BLOCKED: missing `aitm-dod-verified` marker — run `\/task test/,
    'refusal message for missing sandbox marker is unchanged'
  );
  console.log('PASS: missing-sandbox-marker refusal preserved');
}

// ---------------------------------------------------------------------------
// #384: review.mjs's inline VC/DoD command parser must tolerate a trailing
// inline `aitm-verified` proof marker (stamped by auto-tick-verified on a green
// `test` run). The pre-#384 regex `^`(.+)`$` was anchored at end-of-line, so a
// marker-suffixed VC entry failed to parse — its command never seeded
// commandResults and any AC verified by a NON-standard command was falsely
// demoted as "unknown evidence command". The fix mirrors the shared parsers
// hardened in #368 AC9: stop at the first closing backtick, no `$` anchor.
// ---------------------------------------------------------------------------
{
  // Source-level pin: the anchored form is gone, the tolerant form is present.
  assert.doesNotMatch(
    reviewSource,
    /label\.match\(\/\^`\(\.\+\)`\$\/\)/,
    'anchored `^`(.+)`$` VC-command regex removed (defeated by trailing markers)'
  );
  assert.match(
    reviewSource,
    /label\.match\(\/\^`\(\[\^`\]\+\)`\/\)/,
    'tolerant `^`([^`]+)`` VC-command regex present'
  );
  console.log('PASS: review.mjs VC-command regex tolerates trailing proof markers (source pin)');

  // Behavioral: replicate the exact regex the verb uses and confirm it extracts
  // the command from a realistic auto-ticked VC line, and still extracts a
  // plain one — while a non-command label still yields no match.
  const vcRegex = /^`([^`]+)`/;
  const marked =
    '`node scripts/tests/unit/task-tracker/review-preflight.test.mjs` ' +
    '<!-- aitm-verified verified-at="2026-06-11T19:46:35.260Z" ' +
    'evidence="sandbox exit 0" sha="sandbox" proof="none" -->';
  assert.equal(
    marked.match(vcRegex)?.[1],
    'node scripts/tests/unit/task-tracker/review-preflight.test.mjs',
    'command extracted from marker-suffixed VC label'
  );
  assert.equal(
    '`npm run test:all`'.match(vcRegex)?.[1],
    'npm run test:all',
    'command extracted from plain VC label'
  );
  assert.equal(
    'All automated tests pass <!-- aitm-verified-by: `npm test` -->'.match(vcRegex),
    null,
    'prose DoD label (no leading backtick) yields no command match'
  );
  console.log('PASS: tolerant VC-command regex extracts command across marker variants');
}

// ---------------------------------------------------------------------------
// #406/#1458: Cursor's legacy-boundary adapter must capture the structured
// `runMoveState` result and classify a genuine refusal. The verb then exits on
// the Cursor refusal before its success banner. Source-level pins prevent the
// extraction from silently restoring the old noisy-success path.
// ---------------------------------------------------------------------------
{
  // The boundary adapter captures the move result into a named binding.
  assert.match(
    reviewSource,
    /const\s+move\s*=\s*await\s+runMoveState\(target,\s*'review',\s*\{\s*silent:\s*true,\s*lifecycleEvidence:\s*reviewEvidence\.lifecycleEvidence,?\s*\}\)/,
    'review.mjs boundary adapter captures the runMoveState result'
  );

  // A genuine refusal (ok:false, not the benign done→done self-loop) gates the
  // banner: it writes a refusal and exits before any success line.
  assert.match(
    reviewSource,
    /if\s*\(move\s*&&\s*move\.ok\s*===\s*false\s*&&\s*move\.benign\s*!==\s*true\)\s*\{\s*return\s*\{\s*\.\.\.move,\s*kind:\s*'move-refused'/,
    'review.mjs classifies `ok === false && benign !== true` as move-refused'
  );

  // The classified refusal must process.exit before the success banner.
  const gateIdx = reviewSource.indexOf("cursorResult.kind === 'move-refused'");
  const exitIdx = reviewSource.indexOf('process.exit(cursorResult.exit', gateIdx);
  const bannerIdx = reviewSource.indexOf('moved to Review — all verification passed', gateIdx);
  assert.ok(gateIdx > 0, 'Cursor refusal gate exists');
  assert.ok(exitIdx > gateIdx, 'gate exits non-zero on refusal');
  assert.ok(
    bannerIdx > exitIdx,
    'success banner sits after the refusal exit (unreachable on refusal)'
  );
  console.log('PASS: review.mjs gates the success banner on the runMoveState result (#406)');

  // Behavioral: replicate the exact gate predicate the verb uses and confirm it
  // fires only on a genuine refusal — not on a benign self-loop, a success, or
  // a legacy stub returning undefined.
  const refused = (r) => Boolean(r && r.ok === false && r.benign !== true);
  assert.equal(refused({ ok: false, benign: false, status: 5 }), true, 'genuine refusal → gated');
  assert.equal(
    refused({ ok: false, benign: true }),
    false,
    'benign done→done self-loop → not gated'
  );
  assert.equal(refused({ ok: true }), false, 'successful move → not gated');
  assert.equal(refused(undefined), false, 'legacy undefined result → not gated');
  console.log('PASS: #406 refusal predicate fires only on genuine refusals');
}

// ---------------------------------------------------------------------------
// #408: the review verb must NOT issue a `test → test` self-move. Before #408
// each of the three timing/binding branches ran
// `runMoveState(target, 'test', { silent: true })` as a vestigial test-entry
// re-stamp. By the time `review` runs the issue is already in `test` (the
// `test-exit-dod-verified` guard refuses otherwise), so the call is a self-loop
// the transition matrix rejects with `illegal transition: test → test`. The
// refusal is printed by move-state.mjs and echoed again by runMoveState (its
// error path uses console.warn regardless of `silent`), producing spurious
// doubled noise on stderr of an otherwise-successful review. The fix removes all
// three self-moves; the authoritative test→review move (captured as `reviewMove`)
// is the only state change. These pins ensure the noise source cannot return.
// ---------------------------------------------------------------------------
{
  // AC1 + AC2 (source pin): no `runMoveState(target, 'test', …)` remains.
  assert.doesNotMatch(
    reviewSource,
    /runMoveState\(\s*target,\s*'test'/,
    'no review-verb test→test self-move remains (was the illegal-transition noise source)'
  );

  // The removal is documented against the issue so a future refactor sees why.
  assert.match(
    reviewSource,
    /#408 —/,
    'review.mjs carries a #408 rationale comment for the removal'
  );

  // The only runMoveState calls left target 'develop' (epic branch) and the
  // authoritative 'review' move — never 'test'.
  const moveTargets = [...reviewSource.matchAll(/runMoveState\(\s*target,\s*'([a-z]+)'/g)].map(
    (m) => m[1]
  );
  assert.deepEqual(
    [...new Set(moveTargets)].sort(),
    ['develop', 'review'],
    'review.mjs only moves to develop or review — never test'
  );
  console.log('PASS: review.mjs issues no test→test self-move (#408)');

  // AC3 (behavioral): the removed self-move was pure waste. Until #882 the matrix
  // REJECTED test→test, so it emitted `illegal transition: test → test` on every
  // successful review — that stderr noise is what #408 eliminated. #882 then made
  // a self-transition a satisfied no-op, so the same self-move is now silent but
  // still does nothing. Either way, review.mjs must not issue it: the assertion
  // above (moveTargets never includes 'test') remains the AC. Here we pin that
  // the self-move carries no effect to lose.
  const { validateTransition } =
    await import('../../../../task-tracker/lib/lifecycle-policy/index.mjs');
  const selfLoop = validateTransition('test', 'test');
  assert.equal(selfLoop.ok, true, 'test→test is a legal no-op post-#882');
  assert.equal(selfLoop.noop, true, 'and is flagged as a no-op, so it moves nothing');
  // The real move review performs (test→review) is allowed — no noise.
  const realMove = validateTransition('test', 'review');
  assert.equal(realMove.ok, true, 'test→review (the authoritative review move) is allowed');
  console.log(
    'PASS: removing the test→test self-move eliminates the illegal-transition stderr noise (#408)'
  );
}

// ---------------------------------------------------------------------------
// #679: the evidenceCheckboxes regression loop must honor the honest
// `invalid — non-demonstrable` opt-out tag, the same way
// refine-to-plan-gate.mjs and review-preflight.mjs:107 already do. Before
// #679, a zero-evidence checked box tagged non-demonstrable was flagged as a
// regression and un-ticked on every `/task review` run, permanently
// bouncing the issue back to develop with no honest way to reach Review.
// ---------------------------------------------------------------------------
{
  // Source-level pin: the short-circuit is present, positioned inside the
  // evidenceCheckboxes loop, before the zero-evidence regression check.
  assert.match(
    reviewSource,
    /import\s+\{\s*NON_DEMONSTRABLE_TAG_RE\s*\}\s+from\s+['"]\.\.\/lib\/body-invariants\.mjs['"]/,
    'review.mjs imports NON_DEMONSTRABLE_TAG_RE from lib/body-invariants.mjs'
  );
  const loopIdx = reviewSource.indexOf('for (const cb of evidenceCheckboxes)');
  const shortCircuitIdx = reviewSource.indexOf('NON_DEMONSTRABLE_TAG_RE.test(cb.label)', loopIdx);
  const zeroEvidenceIdx = reviewSource.indexOf('cb.evidenceCommands.length === 0', loopIdx);
  assert.ok(loopIdx > 0, 'evidenceCheckboxes loop exists');
  assert.ok(shortCircuitIdx > loopIdx, 'short-circuit lives inside the evidenceCheckboxes loop');
  assert.ok(
    shortCircuitIdx < zeroEvidenceIdx,
    'short-circuit runs before the zero-evidence regression check'
  );
  console.log(
    'PASS: review.mjs short-circuits on NON_DEMONSTRABLE_TAG_RE before the loop body (#679)'
  );

  // Behavioral: replicate the exact consumer-loop predicate the verb uses —
  // a checked, zero-evidence, non-demonstrable-tagged box must NOT be
  // collected as a regression; an otherwise-identical box without the tag
  // still is.
  function evaluateEvidenceCheckbox(cb) {
    const regressions = [];
    const failures = [];
    if (NON_DEMONSTRABLE_TAG_RE.test(cb.label)) return { regressions, failures };
    if (cb.evidenceCommands.length === 0) {
      if (cb.checked) regressions.push(cb.label);
      failures.push(`${cb.label} (missing automated evidence)`);
    }
    return { regressions, failures };
  }

  const taggedChecked = {
    label: 'An AC that cannot be automated <!-- aitm-non-demonstrable -->',
    checked: true,
    evidenceCommands: [],
  };
  const untaggedChecked = {
    label: 'An AC with no evidence declared',
    checked: true,
    evidenceCommands: [],
  };

  const taggedResult = evaluateEvidenceCheckbox(taggedChecked);
  assert.deepEqual(taggedResult.regressions, [], 'tagged non-demonstrable box is not a regression');
  assert.deepEqual(taggedResult.failures, [], 'tagged non-demonstrable box is not a failure');

  const untaggedResult = evaluateEvidenceCheckbox(untaggedChecked);
  assert.deepEqual(
    untaggedResult.regressions,
    [untaggedChecked.label],
    'untagged zero-evidence checked box is still flagged as a regression'
  );
  assert.equal(
    untaggedResult.failures.length,
    1,
    'untagged zero-evidence checked box is still a failure'
  );
  console.log(
    'PASS: only the tagged non-demonstrable checkbox is exempted from the regression check (#679)'
  );
}

// #774/#1131: Review must use the shared declaration resolver for canonical
// `vc-list` citations. Governed Test can preserve both a raw `cmd` attribute and
// the canonical `vc-list` on the same sandbox-stamped marker; `vc-list` must win
// even when the raw command contains no backtick spans.
test('#1131 Review gives vc-list precedence on dual-attribute sandbox markers', async () => {
  assert.match(
    reviewSource,
    /import\s+\{\s*parseVerificationCommands\s*\}\s+from\s+['"]\.\.\/lib\/verification-commands\.mjs['"]/,
    'review.mjs imports parseVerificationCommands'
  );
  assert.match(
    reviewSource,
    /import\s+\{[^}]*extractVerifiedCommands[^}]*\}\s+from\s+['"]\.\.\/lib\/proof-marker\.mjs['"]/,
    'review.mjs imports the shared declaration resolver'
  );
  assert.match(
    reviewSource,
    /extractVerifiedCommands\(label,\s*vcItems\)/,
    'review.mjs resolves AC declarations through the shared helper'
  );
  console.log('PASS: review.mjs delegates AC declaration resolution to the shared helper');

  // Behavioral: replicate the verb's parse → seed → consume path for a
  // vc-list-cited, stamped (exit=0), checked AC and confirm it is NOT flagged.
  const { parseVerificationCommands } =
    await import('../../../../task-tracker/lib/verification-commands.mjs');
  const { extractVerifiedCommands, parseProofMarker, hasExecutionProof } =
    await import('../../../../task-tracker/lib/proof-marker.mjs');

  const label =
    'Heal works <!-- aitm-verified cmd="node --test tests/stale-inline.test.mjs" exit="0" sha="abc1234" ts="2026-07-10T00:00:00.000Z" evidence="sandbox exit 0" key="deadbeef" vc-list="vc:6" -->';
  const body = [
    '## Verification Commands',
    '',
    '- [ ] `node --test tests/heal.test.mjs` <!-- id=6 -->',
    '',
    '## Acceptance Criteria',
    '',
    `- [x] ${label}`,
    '',
  ].join('\n');
  const vcItems = parseVerificationCommands(body);

  let evidenceCommands = [];
  let proofPassed = false;
  const props = parseProofMarker(label);
  try {
    evidenceCommands = extractVerifiedCommands(label, vcItems);
  } catch {
    evidenceCommands = [];
  }
  if (props && hasExecutionProof(label)) proofPassed = String(props.exit) === '0';
  assert.deepEqual(evidenceCommands, ['node --test tests/heal.test.mjs'], 'vc:6 resolves by id');
  assert.equal(proofPassed, true, 'exit=0 marker counts as passing sandbox proof');

  const commandResults = new Map();
  for (const cmd of STANDARD_DOD_COMMANDS) commandResults.set(cmd, true);
  if (proofPassed) for (const cmd of evidenceCommands) commandResults.set(cmd, true);

  const failures = [];
  if (!NON_DEMONSTRABLE_TAG_RE.test(label)) {
    if (evidenceCommands.length === 0) failures.push(`${label} (missing automated evidence)`);
    else if (evidenceCommands.some((cmd) => !commandResults.has(cmd)))
      failures.push(`${label} (unknown evidence command)`);
  }
  assert.deepEqual(failures, [], 'a vc-list-cited stamped AC produces no failure');
  console.log('PASS: #1131 dual-attribute vc-list AC survives the review evidence loop');
});

console.log('\nAll review-verb evidence-command tests passed.');
