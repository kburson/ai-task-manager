// #282 — Stage-completion marker for the Refine stage.
//
// Covers the six ACs from the deep-dive test surface:
//   1. refine on a Refine-state issue does NOT call verbPromote
//   2. refine on a Refine-state issue is idempotent (re-stamps marker)
//   3. refine writes the aitm-refine-complete marker
//   4. promote refuses refine→plan when marker is absent
//   5. refusal message names the marker AND the verb that produces it
//   6. full-auto promote chain works (backlog→done via explicit promote calls)

import assert from 'node:assert/strict';

import {
  runRefine,
  stampRefineCompleteMarker,
  REFINE_COMPLETE_MARKER_RE,
} from '../verbs/refine.mjs';
import { runPromote } from '../verbs/promote.mjs';

const baseCfg = { repo: 'owner/repo', projectId: 'PVT_FAKE' };

function bodyWithState(state) {
  return `<!-- aitm-last-known-state: ${state} -->\n<!-- aitm-last-known-state-ts: 2026-05-10T00:00:00Z -->\n\n## Issue\n\nbody.\n`;
}

// ---------------------------------------------------------------------------
// #1 — refine-no-forward-promote
// ---------------------------------------------------------------------------
{
  let promoteCalled = false;
  const result = await runRefine({
    args: {
      issueNumber: 700,
      size: 'S',
      estimate: '2',
      priority: 'p1',
      reason: 'idempotent re-refine',
    },
    cfg: baseCfg,
    deps: {
      tetherIssueToProject: async () => ({ itemId: 'X' }),
      fetchBody: async () => bodyWithState('refine'),
      writeBody: async () => {},
      verbPromote: async () => {
        promoteCalled = true;
      },
    },
  });
  assert.equal(result.status, 'refined');
  assert.equal(result.promoted, false, 'promoted=false on a Refine-state issue');
  assert.equal(
    promoteCalled,
    false,
    'verbPromote MUST NOT be called when issue is already in Refine'
  );
  console.log('PASS: refine on Refine-state issue does not call verbPromote (#282)');
}

// ---------------------------------------------------------------------------
// #2 — refine-idempotent-on-state (two runs, both stay at Refine, marker re-stamped)
// ---------------------------------------------------------------------------
{
  const writes = [];
  let promoteCount = 0;
  let currentBody = bodyWithState('refine');
  const deps = {
    tetherIssueToProject: async () => ({ itemId: 'X' }),
    fetchBody: async () => currentBody,
    writeBody: async ({ body }) => {
      writes.push(body);
      currentBody = body;
    },
    verbPromote: async () => {
      promoteCount += 1;
    },
  };
  await runRefine({
    args: { issueNumber: 701, size: 'S', estimate: '2', priority: 'p1', reason: 'first' },
    cfg: baseCfg,
    deps,
  });
  await runRefine({
    args: { issueNumber: 701, size: 'M', estimate: '4', priority: 'p1', reason: 'second' },
    cfg: baseCfg,
    deps,
  });
  assert.equal(promoteCount, 0, 'no promote calls when state remains refine');
  assert.equal(writes.length, 2, 'body written twice');
  // Only one aitm-refine-complete marker should ever exist in the body.
  const matches = writes[1].match(/<!--\s*aitm-refine-complete:/g) || [];
  assert.equal(matches.length, 1, 're-stamp replaces, not duplicates, the marker');
  console.log('PASS: refine is idempotent on a Refine-state issue (#282)');
}

// ---------------------------------------------------------------------------
// #3 — refine-complete-marker is written
// ---------------------------------------------------------------------------
{
  let captured = null;
  await runRefine({
    args: { issueNumber: 702, size: 'S', estimate: '2', priority: 'p1', reason: 'stamp it' },
    cfg: baseCfg,
    deps: {
      tetherIssueToProject: async () => ({ itemId: 'X' }),
      fetchBody: async () => bodyWithState('refine'),
      writeBody: async ({ body }) => {
        captured = body;
      },
      verbPromote: async () => {},
    },
  });
  assert.match(captured, /<!--\s*aitm-refine-complete:\s*\d{4}-/);
  console.log('PASS: refine stamps aitm-refine-complete marker (#282)');
}

// ---------------------------------------------------------------------------
// stampRefineCompleteMarker — idempotent helper unit test
// ---------------------------------------------------------------------------
{
  const before = 'hello\n';
  const once = stampRefineCompleteMarker(before, '2026-06-03T00:00:00Z');
  const twice = stampRefineCompleteMarker(once, '2026-06-03T00:00:01Z');
  const matches = twice.match(REFINE_COMPLETE_MARKER_RE) || [];
  assert.equal(matches.length, 1, 'single marker after two stamps');
  assert.match(twice, /aitm-refine-complete: 2026-06-03T00:00:01Z/);
  console.log('PASS: stampRefineCompleteMarker is idempotent');
}

// ---------------------------------------------------------------------------
// #4 — promote refuses refine→plan when marker is absent
// ---------------------------------------------------------------------------
{
  const body = bodyWithState('refine');
  const r = await runPromote({
    issueNumber: 703,
    cfg: baseCfg,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async () => {},
      getLiveState: async () => 'refine',
    },
  });
  assert.equal(r.status, 'refine-exit-refused');
  assert.ok(
    r.blockers.some((b) => /aitm-refine-complete/.test(b)),
    'blocker names the missing marker'
  );
  console.log('PASS: promote refuses refine→plan when aitm-refine-complete absent (#282)');
}

// ---------------------------------------------------------------------------
// #5 — refusal message names the verb that produces the marker
// ---------------------------------------------------------------------------
{
  const body = bodyWithState('refine');
  const r = await runPromote({
    issueNumber: 704,
    cfg: baseCfg,
    deps: {
      fetchIssueBody: async () => ({ body }),
      writeIssueBody: async () => {},
      getLiveState: async () => 'refine',
    },
  });
  assert.match(r.message, /run `\/task refine`/);
  assert.ok(
    r.blockers.some((b) => /run `\/task refine`/.test(b)),
    'blocker text names the producing verb'
  );
  console.log('PASS: promote refusal message names the producing verb (#282)');
}

// ---------------------------------------------------------------------------
// #6 — auto-mode-promote-chain: each forward step under TT_FULL_AUTO=1 still
// needs an explicit promote call; the marker check passes once stamped.
// ---------------------------------------------------------------------------
{
  // First: refine→plan refused with no marker even under full-auto.
  const prev = process.env.TT_FULL_AUTO;
  process.env.TT_FULL_AUTO = '1';
  try {
    const noMarker = await runPromote({
      issueNumber: 705,
      cfg: baseCfg,
      deps: {
        fetchIssueBody: async () => ({ body: bodyWithState('refine') }),
        writeIssueBody: async () => {},
        getLiveState: async () => 'refine',
      },
    });
    assert.equal(noMarker.status, 'refine-exit-refused');

    // Now: refine→plan with marker present passes the new check (deeper
    // gates would still need to pass too, but those are covered elsewhere).
    let deeperGateCalled = false;
    const withMarker = await runPromote({
      issueNumber: 706,
      cfg: baseCfg,
      deps: {
        fetchIssueBody: async () => ({
          body: bodyWithState('refine') + '<!-- aitm-refine-complete: 2026-06-03T00:00:00Z -->\n',
        }),
        writeIssueBody: async () => {},
        getLiveState: async () => 'refine',
        refinementEstimate: {
          loadProjectFieldDefs: () => [],
          projectValuesForIssue: async () => {
            deeperGateCalled = true;
            return {};
          },
        },
      },
    });
    // The marker check is past; we expect the deeper refine-gate to run
    // (and refuse here because we stubbed empty project values). The point:
    // the run got past the new marker check.
    assert.equal(withMarker.status, 'refine-gate-refused');
    assert.equal(deeperGateCalled, true, 'deeper gate ran once marker was present');
  } finally {
    if (prev === undefined) delete process.env.TT_FULL_AUTO;
    else process.env.TT_FULL_AUTO = prev;
  }
  console.log('PASS: full-auto promote chain still requires explicit marker (#282)');
}

console.log('\nAll #282 stage-completion-marker tests passed.');
