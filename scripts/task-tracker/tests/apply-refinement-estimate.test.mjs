#!/usr/bin/env node
// Unit: `planRefinementEstimate` + `applyRefinementEstimate` (#95, renamed #144).
// Covers AC3 (idempotent), AC4 (refuses on missing values), AC6 (first post).
// Also asserts backward-compat reads of legacy `aitm-groom-rationale` /
// `aitm-groom-estimate:` markers.

import { strict as assert } from 'node:assert';
import {
  planRefinementEstimate,
  applyRefinementEstimate,
  parseRationaleMarker,
  stripRationaleMarker,
  buildRefinementCommentBody,
  // legacy alias re-exports
  planGroomEstimate,
  applyGroomEstimate,
  buildGroomCommentBody,
  GROOM_HEADER,
  REFINEMENT_HEADER,
} from '../lib/apply-refinement-estimate.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };

const FIELD_DEFS = [
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'priority', name: 'Priority', type: 'single_select' },
];

const LEGACY_RATIONALE_BLOCK =
  '<!-- aitm-groom-rationale: {"size":"single verb extension","estimate":"~1h parser, ~1h formatter, ~1h tests, ~1h docs","priority":"QoL — no blockers"} -->';

const NEW_RATIONALE_BLOCK =
  '<!-- aitm-refinement-rationale: {"size":"single verb extension","estimate":"~1h parser, ~1h formatter, ~1h tests, ~1h docs","priority":"QoL — no blockers"} -->';

function bodyWithMarker(marker = NEW_RATIONALE_BLOCK, extra = '') {
  return `# Title\n\n${extra}${marker}\n\n## ACs\n- [ ] foo\n`;
}

function depsWithBoard(values = { size: 'S', estimate: 4, priority: 'P2' }) {
  return {
    loadProjectFieldDefs: () => FIELD_DEFS,
    projectValuesForIssue: async () => ({ ...values }),
  };
}

// --- legacy aliases -------------------------------------------------------

assert.equal(GROOM_HEADER, REFINEMENT_HEADER);
assert.equal(planGroomEstimate, planRefinementEstimate);
assert.equal(applyGroomEstimate, applyRefinementEstimate);
assert.equal(buildGroomCommentBody, buildRefinementCommentBody);

// --- parseRationaleMarker -------------------------------------------------

{
  const r = parseRationaleMarker(bodyWithMarker(NEW_RATIONALE_BLOCK));
  assert.equal(r.ok, true);
  assert.equal(r.rationale.size, 'single verb extension');
}

{
  // backward-compat: legacy marker form still parses
  const r = parseRationaleMarker(bodyWithMarker(LEGACY_RATIONALE_BLOCK));
  assert.equal(r.ok, true);
  assert.equal(r.rationale.size, 'single verb extension');
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

{
  // backward-compat strip
  const stripped = stripRationaleMarker(bodyWithMarker(LEGACY_RATIONALE_BLOCK));
  assert.ok(!stripped.includes('aitm-groom-rationale'));
}

// --- buildRefinementCommentBody ------------------------------------------

{
  const body = buildRefinementCommentBody({
    issueNumber: 95,
    size: 'S',
    estimate: 4,
    priority: 'P2',
    rationale: { size: 'a', estimate: 'b', priority: 'c' },
  });
  assert.match(body, /<!-- aitm-refined-estimate: 95 -->/);
  assert.match(body, /### 🛠 Refine estimate/);
  assert.match(body, /\| Size \| S \| a \|/);
  assert.match(body, /\| Estimate \| 4h \| b \|/);
  assert.match(body, /\| Priority \| P2 \| c \|/);
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

// --- planRefinementEstimate: backward-compat read of legacy marker -------

{
  const result = await planRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(LEGACY_RATIONALE_BLOCK),
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, true);
  // Written marker is always the new form
  assert.match(result.plan.commentBody, /<!-- aitm-refined-estimate: 95 -->/);
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
    body: '# Title\n\n## ACs\n- [ ] foo\n',
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('refine-rationale-missing')));
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
  const result = await applyRefinementEstimate({
    cfg: CFG,
    issueNumber: 95,
    plan: planResult.plan,
    scratchDir: '/tmp',
    deps: {
      listCommentBodies: async () => [],
      postComment: async ({ body }) => posts.push(body),
      writeIssueBody: async ({ body }) => writes.push(body),
    },
  });
  assert.equal(result.status, 'posted');
  assert.equal(posts.length, 1);
  assert.match(posts[0], /<!-- aitm-refined-estimate: 95 -->/);
  assert.equal(writes.length, 1);
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
      writeIssueBody: async () => {},
    },
  });
  assert.equal(result.status, 'duplicate');
  assert.equal(posts.length, 0);
}

// --- applyRefinementEstimate: idempotent on legacy-form marker (AC3) ----

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
        '<!-- aitm-groom-estimate: 95 -->\n### 🛠 Refine estimate\n...',
      ],
      postComment: async ({ body }) => posts.push(body),
      writeIssueBody: async () => {},
    },
  });
  assert.equal(result.status, 'duplicate');
  assert.equal(posts.length, 0);
}

console.log('apply-refinement-estimate: all checks passed');
