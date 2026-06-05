#!/usr/bin/env node
// Unit: `planRefinementEstimate` + `applyRefinementEstimate` (#95, renamed #144).
// Covers AC3 (idempotent), AC4 (refuses on missing values), AC6 (first post).

import { strict as assert } from 'node:assert';
import {
  planRefinementEstimate,
  planPriorityGate,
  applyRefinementEstimate,
  parseRationaleMarker,
  stripRationaleMarker,
  buildRefinementCommentBody,
  REFINEMENT_HEADER,
} from '../lib/apply-refinement-estimate.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };

const FIELD_DEFS = [
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'priority', name: 'Priority', type: 'single_select' },
];

// #220 canonical shape: bucket tokens in bucket slots, reason text in its own
// `rationale` key.
const NEW_RATIONALE_BLOCK =
  '<!-- aitm-refinement-rationale: {"size":"S","estimate":"4h","priority":"P2","rationale":"single verb extension"} -->';

function bodyWithMarker(marker = NEW_RATIONALE_BLOCK, extra = '') {
  return `# Title\n\n${extra}${marker}\n\n## Acceptance Criteria\n- [ ] foo\n`;
}

function depsWithBoard(values = { size: 'S', estimate: 4, priority: 'P2' }) {
  return {
    loadProjectFieldDefs: () => FIELD_DEFS,
    projectValuesForIssue: async () => ({ ...values }),
  };
}

assert.equal(REFINEMENT_HEADER, '### 🛠 Refine estimate');

// --- parseRationaleMarker -------------------------------------------------

{
  // #220 canonical: bucket token in size, reason in rationale
  const r = parseRationaleMarker(bodyWithMarker(NEW_RATIONALE_BLOCK));
  assert.equal(r.ok, true);
  assert.equal(r.rationale.size, 'S');
  assert.equal(r.rationale.rationale, 'single verb extension');
}

{
  const r = parseRationaleMarker('no marker here');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
}

{
  const r = parseRationaleMarker('<!-- aitm-refinement-rationale: {not json} -->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-json');
}

{
  const r = parseRationaleMarker('<!-- aitm-refinement-rationale: {"size":"x"} -->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'incomplete');
  assert.deepEqual(r.missing, ['estimate', 'priority']);
}

// --- stripRationaleMarker -------------------------------------------------

{
  const stripped = stripRationaleMarker(bodyWithMarker(NEW_RATIONALE_BLOCK));
  assert.ok(!stripped.includes('aitm-refinement-rationale'));
}

// --- buildRefinementCommentBody ------------------------------------------

{
  // #220: rationale prose is a single field on the parsed marker; the comment
  // body renders that same text in the Rationale column for each row.
  const body = buildRefinementCommentBody({
    issueNumber: 95,
    size: 'S',
    estimate: 4,
    priority: 'P2',
    rationale: { size: 'S', estimate: '4h', priority: 'P2', rationale: 'tight scope' },
  });
  assert.match(body, /<!-- aitm-refined-estimate: 95 -->/);
  assert.match(body, /### 🛠 Refine estimate/);
  assert.match(body, /\| Size \| S \| tight scope \|/);
  assert.match(body, /\| Estimate \| 4h \| tight scope \|/);
  assert.match(body, /\| Priority \| P2 \| tight scope \|/);
}

// --- planRefinementEstimate: happy path ----------------------------------

{
  const result = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(NEW_RATIONALE_BLOCK),
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.size, 'S');
  assert.equal(result.plan.estimate, 4);
  assert.equal(result.plan.priority, 'P2');
  assert.match(result.plan.commentBody, /### 🛠 Refine estimate/);
  assert.ok(!result.plan.strippedBody.includes('aitm-refinement-rationale'));
}

// --- planRefinementEstimate: missing board values (AC4) ------------------

{
  const result = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(NEW_RATIONALE_BLOCK),
    deps: depsWithBoard({ size: null, estimate: null, priority: null }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 3);
  assert.ok(result.blockers.every((b) => b.startsWith('refine-field-missing')));
}

// --- planRefinementEstimate: missing rationale marker (AC4) --------------

{
  const result = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: '# Title\n\n## Acceptance Criteria\n- [ ] foo\n',
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('refine-rationale-missing')));
}

// --- planRefinementEstimate: empty Acceptance Criteria section (#133) ----

{
  const result = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: `# Title\n\n${NEW_RATIONALE_BLOCK}\n\n## Acceptance Criteria\n\nNo items yet.\n`,
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('refine-ac-section-empty')));
}

// --- planPriorityGate: Backlog→Refine only requires Priority (#133) ------

{
  const result = await planPriorityGate({
    cfg: CFG,
    issueNumber: 95,
    deps: depsWithBoard({ size: null, estimate: null, priority: 'P1' }),
  });
  assert.equal(result.ok, true);
}

{
  const result = await planPriorityGate({
    cfg: CFG,
    issueNumber: 95,
    deps: depsWithBoard({ size: 'S', estimate: 2, priority: null }),
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('refine-field-missing')));
}

{
  const result = await planPriorityGate({
    cfg: CFG,
    issueNumber: 95,
    deps: {
      loadProjectFieldDefs: () => FIELD_DEFS,
      projectValuesForIssue: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('refine-board-fetch-failed')));
}

// --- applyRefinementEstimate: first post (AC1+AC2) -----------------------

{
  const posts = [];
  const writes = [];
  const planResult = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(NEW_RATIONALE_BLOCK),
    deps: depsWithBoard(),
  });
  // #295 — applyRefinementEstimate now writes via `mutateIssueBody({ mutate })`.
  // The injected `mutateIssueBody` dep is invoked with `{issueNumber, repo,
  // mutate}` and the mutate closure is what computes the new body from the
  // FRESH base. The test supplies a base carrying `aitm-last-known-state: plan`
  // (the marker move-state stamped) plus the rationale; the closure must
  // preserve the former and strip the latter.
  const post = `<!-- aitm-last-known-state: plan -->\n${bodyWithMarker(NEW_RATIONALE_BLOCK)}`;
  const result = await applyRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    plan: planResult.plan,
    deps: {
      listCommentBodies: async () => [],
      postComment: async ({ body }) => posts.push(body),
      mutateIssueBody: async ({ mutate }) => {
        writes.push(mutate(post));
      },
    },
  });
  assert.equal(result.status, 'posted');
  assert.equal(posts.length, 1);
  assert.match(posts[0], /<!-- aitm-refined-estimate: 95 -->/);
  assert.equal(writes.length, 1);
  assert.ok(!writes[0].includes('aitm-refinement-rationale'));
  // The write must preserve the post-transition marker, not regress it.
  assert.ok(writes[0].includes('aitm-last-known-state: plan'));
}

// --- applyRefinementEstimate #210: does not regress last-known-state marker --

{
  // Regression: pre-fix, applyRefinementEstimate wrote `plan.strippedBody`
  // (computed from a pre-moveState body). That clobbered the
  // `aitm-last-known-state: plan` marker that move-state had just stamped,
  // regressing it to `refine` and causing the next promote's preflight to
  // refuse with `human-move`. Fix: re-fetch the body before stripping.
  const writes = [];
  const planResult = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 210,
    body: bodyWithMarker(NEW_RATIONALE_BLOCK),
    deps: depsWithBoard(),
  });
  // Simulate: planResult.plan.strippedBody is stale (marker=refine). The fresh
  // base passed into the mutate closure carries `aitm-last-known-state: plan`.
  // Apply must write the fresh-stripped form, not the stale plan.strippedBody.
  const post = `<!-- aitm-last-known-state: plan -->\n${bodyWithMarker(NEW_RATIONALE_BLOCK)}`;
  const result = await applyRefinementEstimate({
    cfg: CFG,
    issueNumber: 210,
    plan: planResult.plan,
    deps: {
      listCommentBodies: async () => [],
      postComment: async () => {},
      mutateIssueBody: async ({ mutate }) => {
        writes.push(mutate(post));
      },
    },
  });
  assert.equal(result.status, 'posted');
  assert.equal(writes.length, 1);
  assert.ok(writes[0].includes('aitm-last-known-state: plan'));
  assert.ok(!writes[0].includes('aitm-refinement-rationale'));
}

// --- applyRefinementEstimate: idempotent on new-form marker (AC3) -------

{
  const posts = [];
  const planResult = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(NEW_RATIONALE_BLOCK),
    deps: depsWithBoard(),
  });
  const result = await applyRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    plan: planResult.plan,
    scratchDir: '/tmp',
    deps: {
      listCommentBodies: async () => [
        'some old comment',
        '<!-- aitm-refined-estimate: 95 -->\n### 🛠 Refine estimate\n...',
      ],
      postComment: async ({ body }) => posts.push(body),
      mutateIssueBody: async () => {},
    },
  });
  assert.equal(result.status, 'duplicate');
  assert.equal(posts.length, 0);
}

console.log('apply-refinement-estimate: all checks passed');
