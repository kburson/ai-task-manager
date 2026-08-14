// @story #145
import assert from 'node:assert/strict';

import {
  parseArgs,
  validateArgs,
  buildRationaleMarker,
  applyRationaleMarker,
  runRefine,
} from '../../../../task-tracker/verbs/refine.mjs';
import {
  parseRationaleMarker,
  buildRefinementCommentBody,
} from '../../../../task-tracker/lib/apply-refinement-estimate.mjs';

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------
{
  const parsed = parseArgs([
    '133',
    '--size',
    'S',
    '--estimate',
    '2',
    '--priority',
    'p1',
    '--reason',
    'small refactor',
  ]);
  assert.equal(parsed.issueNumber, 133);
  assert.equal(parsed.size, 'S');
  assert.equal(parsed.estimate, '2');
  assert.equal(parsed.priority, 'p1');
  assert.equal(parsed.reason, 'small refactor');
  console.log('PASS: parseArgs extracts all flags');
}

{
  // `#133` form is accepted
  const parsed = parseArgs([
    '#42',
    '--size',
    'M',
    '--estimate',
    '5h',
    '--priority',
    'P0',
    '--reason',
    'x',
  ]);
  assert.equal(parsed.issueNumber, 42);
  assert.equal(parsed.estimate, '5h');
  console.log('PASS: parseArgs accepts #N and trailing-h estimate');
}

{
  assert.throws(() => parseArgs(['133', '--bogus', 'x']), /unknown argument/);
  console.log('PASS: parseArgs rejects unknown flags');
}

// ---------------------------------------------------------------------------
// validateArgs — missing-arg refusals
// ---------------------------------------------------------------------------
{
  assert.throws(
    () => validateArgs({ issueNumber: NaN, size: 'S', estimate: '2', priority: 'p1', reason: 'r' }),
    /issue#/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: null, estimate: '2', priority: 'p1', reason: 'r' }),
    /--size is required/
  );
  assert.throws(
    () =>
      validateArgs({ issueNumber: 1, size: 'HUGE', estimate: '2', priority: 'p1', reason: 'r' }),
    /--size must be one of/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: '', priority: 'p1', reason: 'r' }),
    /--estimate is required/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: 'abc', priority: 'p1', reason: 'r' }),
    /--estimate must be a positive number/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: '2', priority: null, reason: 'r' }),
    /--priority is required/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: '2', priority: 'P9', reason: 'r' }),
    /--priority must be one of/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: '2', priority: 'p1', reason: '' }),
    /--reason is required/
  );
  assert.throws(
    () => validateArgs({ issueNumber: 1, size: 'S', estimate: '2', priority: 'p1', reason: '   ' }),
    /--reason is required/
  );
  console.log('PASS: validateArgs rejects each missing/invalid field');
}

// ---------------------------------------------------------------------------
// #220: buildRationaleMarker — bucket tokens stay in their slots, reason text
// goes only in `rationale`. The pre-#220 form repeated `reason` into every
// slot; this test pins the corrected shape.
// ---------------------------------------------------------------------------
{
  const marker = buildRationaleMarker({
    size: 'S',
    estimate: 2,
    priority: 'p1',
    reason: 'tight scope',
  });
  assert.match(marker, /^<!-- aitm-refinement-rationale: \{/);
  const parsed = parseRationaleMarker(marker);
  assert.ok(parsed.ok, `expected parse ok, got: ${JSON.stringify(parsed)}`);
  assert.equal(parsed.rationale.size, 'S');
  assert.equal(parsed.rationale.estimate, '2');
  assert.equal(parsed.rationale.priority, 'p1');
  assert.equal(parsed.rationale.rationale, 'tight scope');
  console.log('PASS: buildRationaleMarker emits canonical shape and round-trips');
}

// ---------------------------------------------------------------------------
// #220: four-flag combination — the actual repro case from the bug report.
// ---------------------------------------------------------------------------
{
  const marker = buildRationaleMarker({
    size: 'S',
    estimate: '1h',
    priority: 'P1',
    reason: 'long explanation of why this is small and urgent',
  });
  const raw = marker.match(/\{[\s\S]*\}/)[0];
  const json = JSON.parse(raw);
  assert.equal(json.size, 'S');
  assert.equal(json.estimate, '1h');
  assert.equal(json.priority, 'P1');
  assert.equal(json.rationale, 'long explanation of why this is small and urgent');
  assert.equal('rank' in json, false, 'rank omitted when not supplied');
  console.log(
    'PASS: buildRationaleMarker four-flag combo lands tokens in slots, reason in rationale'
  );
}

// ---------------------------------------------------------------------------
// #220: rank flag emits as number when supplied.
// ---------------------------------------------------------------------------
{
  const marker = buildRationaleMarker({
    size: 'M',
    estimate: 4,
    priority: 'p0',
    rank: 240,
    reason: 'with rank',
  });
  const json = JSON.parse(marker.match(/\{[\s\S]*\}/)[0]);
  assert.equal(json.rank, 240);
  assert.equal(typeof json.rank, 'number');
  console.log('PASS: buildRationaleMarker emits rank as number');
}

// ---------------------------------------------------------------------------
// #220: missing/empty reason rejected.
// ---------------------------------------------------------------------------
{
  assert.throws(
    () => buildRationaleMarker({ size: 'S', estimate: 2, priority: 'p1' }),
    /reason is required/
  );
  assert.throws(
    () => buildRationaleMarker({ size: 'S', estimate: 2, priority: 'p1', reason: '   ' }),
    /reason is required/
  );
  console.log('PASS: buildRationaleMarker rejects missing/empty reason');
}

// ---------------------------------------------------------------------------
// applyRationaleMarker — replaces existing marker, prepends new
// ---------------------------------------------------------------------------
{
  const original =
    '<!-- aitm-refinement-rationale: {"size":"old","estimate":"old","priority":"old","rationale":"old"} -->\n\n## Scope\n\nHello.\n';
  const marker = buildRationaleMarker({
    size: 'S',
    estimate: 2,
    priority: 'p1',
    reason: 'fresh',
  });
  const out = applyRationaleMarker(original, marker);
  // existing marker stripped (only one instance survives)
  const matches = out.match(/aitm-refinement-rationale/g) || [];
  assert.equal(matches.length, 1);
  // new marker at top
  assert.match(out, /^<!-- aitm-refinement-rationale: /);
  // new reason present, old reason gone
  assert.match(out, /"rationale":"fresh"/);
  assert.doesNotMatch(out, /"rationale":"old"/);
  // body preserved
  assert.match(out, /## Scope/);
  console.log('PASS: applyRationaleMarker strips existing + prepends new');
}

// ---------------------------------------------------------------------------
// runRefine — happy path with stubbed deps
// ---------------------------------------------------------------------------
{
  const calls = { tether: null, fetch: 0, write: null, promote: null };

  const result = await runRefine({
    args: {
      issueNumber: 133,
      size: 'S',
      estimate: '2',
      priority: 'p1',
      reason: 'small refactor',
    },
    cfg: { repo: 'owner/repo', projectId: 'PVT_FAKE' },
    deps: {
      assertBound: () => {},
      tetherIssueToProject: async (opts) => {
        calls.tether = opts;
        return { itemId: 'ITEM_X' };
      },
      fetchBody: async () => {
        calls.fetch += 1;
        return '## Scope\n\nDo it.\n';
      },
      mutateBody: async ({ mutate }) => {
        const next = mutate('## Scope\n\nDo it.\n');
        calls.write = next;
        return { status: 'ok' };
      },
      verbPromote: async (rest /* , cfg */) => {
        calls.promote = rest;
      },
    },
  });

  assert.equal(result.status, 'refined');
  assert.equal(result.issueNumber, 133);

  // tetherIssueToProject called with priority/size/estimate
  assert.equal(calls.tether.priority, 'p1');
  assert.equal(calls.tether.size, 'S');
  assert.equal(calls.tether.estimate, 2);
  assert.equal(calls.tether.issueNumber, 133);

  // body fetched once
  assert.equal(calls.fetch, 1);

  // Backlog entry begins active Refine WIP: rationale is present, completion
  // evidence is deliberately absent until refine is run from Refine.
  assert.match(calls.write, /<!-- aitm-refinement-rationale: /);
  assert.doesNotMatch(calls.write, /<!-- aitm-refine-complete(?: ts="|: )/);
  assert.match(calls.write, /## Scope/);

  // body has no recorded state → treated as backlog entry, so verbPromote
  // IS called for the one legitimate transitive transition (#282).
  assert.deepEqual(calls.promote, ['133']);

  console.log('PASS: runRefine happy path — tether + body marker + promote');
}

// ---------------------------------------------------------------------------
// runRefine — tether failure surfaces (does not call promote)
// ---------------------------------------------------------------------------
{
  const calls = { tether: null, body: null };
  const result = await runRefine({
    args: {
      issueNumber: 1098,
      size: 'S',
      estimate: '3.13',
      priority: 'p1',
      reason: 'half-hour scheduling increment',
    },
    cfg: { repo: 'owner/repo', projectId: 'PVT_FAKE' },
    deps: {
      assertBound: () => {},
      tetherIssueToProject: async (opts) => {
        calls.tether = opts;
      },
      fetchBody: async () => '## Scope\n\nNormalize it.\n',
      mutateBody: async ({ mutate }) => {
        calls.body = mutate('## Scope\n\nNormalize it.\n');
        return { status: 'ok' };
      },
      verbPromote: async () => {},
    },
  });

  assert.equal(result.estimate, 3.5);
  assert.equal(calls.tether.estimate, 3.5);
  assert.match(calls.body, /"estimate":"3\.5"/);
  assert.match(calls.body, /"estimate":3\.5/);

  const comment = buildRefinementCommentBody({
    issueNumber: 1098,
    size: 'S',
    estimate: 3.13,
    priority: 'P1',
    rationale: { rationale: 'half-hour scheduling increment' },
  });
  assert.match(comment, /\| Estimate \| 3\.5h \|/);
  console.log('PASS: Refine converges off-grid input on the half-hour ceiling');
}

// ---------------------------------------------------------------------------
// runRefine — tether failure surfaces (does not call promote)
// ---------------------------------------------------------------------------
{
  let promoted = false;
  await assert.rejects(
    runRefine({
      args: {
        issueNumber: 9,
        size: 'M',
        estimate: '5',
        priority: 'p0',
        reason: 'x',
      },
      cfg: { repo: 'o/r', projectId: 'PVT' },
      deps: {
        assertBound: () => {},
        tetherIssueToProject: async () => {
          throw new Error('graphql boom');
        },
        fetchBody: async () => '',
        mutateBody: async ({ mutate }) => {
          mutate('');
          return { status: 'ok' };
        },
        verbPromote: async () => {
          promoted = true;
        },
      },
    }),
    /graphql boom/
  );
  assert.equal(promoted, false, 'promote should not be called when tether throws');
  console.log('PASS: runRefine surfaces tether failure and skips promote');
}

// ---------------------------------------------------------------------------
// runRefine — --rank + --labels pass through (#147)
// ---------------------------------------------------------------------------
{
  const calls = { tether: null, addLabels: null };
  await runRefine({
    args: {
      issueNumber: 200,
      size: 'S',
      estimate: '2',
      priority: 'p1',
      reason: 'r',
      rank: '5.1',
      labels: 'bug, backend , epic-107',
    },
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      assertBound: () => {},
      tetherIssueToProject: async (opts) => {
        calls.tether = opts;
      },
      addLabels: async (opts) => {
        calls.addLabels = opts;
      },
      fetchBody: async () => '',
      mutateBody: async ({ mutate }) => {
        mutate('');
        return { status: 'ok' };
      },
      verbPromote: async () => {},
    },
  });
  assert.equal(calls.tether.rank, 5.1, 'rank forwarded to tetherIssueToProject');
  assert.deepEqual(
    calls.addLabels.labels,
    ['bug', 'backend', 'epic-107'],
    'labels parsed (trimmed, split) and forwarded'
  );
  assert.equal(calls.addLabels.issueNumber, 200);
  console.log('PASS: runRefine forwards --rank + --labels');
}

// ---------------------------------------------------------------------------
// runRefine — no --sequence/--labels → no extra calls
// ---------------------------------------------------------------------------
{
  const calls = { tether: null, addLabels: null };
  await runRefine({
    args: { issueNumber: 201, size: 'S', estimate: '2', priority: 'p1', reason: 'r' },
    cfg: { repo: 'o/r', projectId: 'P' },
    deps: {
      assertBound: () => {},
      tetherIssueToProject: async (opts) => {
        calls.tether = opts;
      },
      addLabels: async (opts) => {
        calls.addLabels = opts;
      },
      fetchBody: async () => '',
      mutateBody: async ({ mutate }) => {
        mutate('');
        return { status: 'ok' };
      },
      verbPromote: async () => {},
    },
  });
  assert.equal(calls.tether.rank, undefined, 'rank omitted when not supplied');
  assert.equal(calls.addLabels, null, 'addLabels not called when labels not supplied');
  console.log('PASS: runRefine omits rank/labels when not supplied');
}

console.log('\nAll refine verb tests passed.');
