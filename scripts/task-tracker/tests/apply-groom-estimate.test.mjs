#!/usr/bin/env node
// Unit: `planGroomEstimate` + `applyGroomEstimate` (#95).
// Covers AC3 (idempotent), AC4 (refuses on missing values), AC6 (first post).

import { strict as assert } from 'node:assert';
import {
  planGroomEstimate,
  applyGroomEstimate,
  parseRationaleMarker,
  stripRationaleMarker,
  buildGroomCommentBody,
} from '../lib/apply-groom-estimate.mjs';

const CFG = { repo: 'test/repo', projectId: 'PVT_test' };

const FIELD_DEFS = [
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
  { key: 'priority', name: 'Priority', type: 'single_select' },
];

const RATIONALE_BLOCK =
  '<!-- aitm-groom-rationale: {"size":"single verb extension","estimate":"~1h parser, ~1h formatter, ~1h tests, ~1h docs","priority":"QoL — no blockers"} -->';

function bodyWithMarker(extra = '') {
  return `# Title\n\n${extra}${RATIONALE_BLOCK}\n\n## ACs\n- [ ] foo\n`;
}

function depsWithBoard(values = { size: 'S', estimate: 4, priority: 'P2' }) {
  return {
    loadProjectFieldDefs: () => FIELD_DEFS,
    projectValuesForIssue: async () => ({ ...values }),
  };
}

// --- parseRationaleMarker -------------------------------------------------

{
  const r = parseRationaleMarker(bodyWithMarker());
  assert.equal(r.ok, true);
  assert.equal(r.rationale.size, 'single verb extension');
}

{
  const r = parseRationaleMarker('no marker here');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'missing');
}

{
  const r = parseRationaleMarker('<!-- aitm-groom-rationale: {not json} -->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-json');
}

{
  const r = parseRationaleMarker('<!-- aitm-groom-rationale: {"size":"x"} -->');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'incomplete');
  assert.deepEqual(r.missing, ['estimate', 'priority']);
}

// --- stripRationaleMarker -------------------------------------------------

{
  const stripped = stripRationaleMarker(bodyWithMarker());
  assert.ok(!stripped.includes('aitm-groom-rationale'));
}

// --- buildGroomCommentBody -----------------------------------------------

{
  const body = buildGroomCommentBody({
    issueNumber: 95,
    size: 'S',
    estimate: 4,
    priority: 'P2',
    rationale: { size: 'a', estimate: 'b', priority: 'c' },
  });
  assert.match(body, /<!-- aitm-groom-estimate: 95 -->/);
  assert.match(body, /### 🛠 Refine estimate/);
  assert.match(body, /\| Size \| S \| a \|/);
  assert.match(body, /\| Estimate \| 4h \| b \|/);
  assert.match(body, /\| Priority \| P2 \| c \|/);
}

// --- planGroomEstimate: happy path ---------------------------------------

{
  const result = await planGroomEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(),
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.size, 'S');
  assert.equal(result.plan.estimate, 4);
  assert.equal(result.plan.priority, 'P2');
  assert.match(result.plan.commentBody, /### 🛠 Refine estimate/);
  assert.ok(!result.plan.strippedBody.includes('aitm-groom-rationale'));
}

// --- planGroomEstimate: missing board values (AC4) -----------------------

{
  const result = await planGroomEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(),
    deps: depsWithBoard({ size: null, estimate: null, priority: null }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.blockers.length, 3);
  assert.ok(result.blockers.every((b) => b.startsWith('groom-field-missing')));
}

// --- planGroomEstimate: missing rationale marker (AC4) -------------------

{
  const result = await planGroomEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: '# Title\n\n## ACs\n- [ ] foo\n',
    deps: depsWithBoard(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.blockers.some((b) => b.startsWith('groom-rationale-missing')));
}

// --- applyGroomEstimate: first post (AC1+AC2) ----------------------------

{
  const posts = [];
  const writes = [];
  const planResult = await planGroomEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(),
    deps: depsWithBoard(),
  });
  const result = await applyGroomEstimate({
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
  assert.match(posts[0], /<!-- aitm-groom-estimate: 95 -->/);
  assert.equal(writes.length, 1);
  assert.ok(!writes[0].includes('aitm-groom-rationale'));
}

// --- applyGroomEstimate: idempotent (AC3) --------------------------------

{
  const posts = [];
  const planResult = await planGroomEstimate({
    cfg: CFG,
    issueNumber: 95,
    body: bodyWithMarker(),
    deps: depsWithBoard(),
  });
  const result = await applyGroomEstimate({
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

console.log('apply-groom-estimate: all checks passed');
