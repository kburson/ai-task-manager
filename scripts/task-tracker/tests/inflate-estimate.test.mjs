// @story #124
import assert from 'node:assert/strict';

import {
  parseArgs,
  validateArgs,
  buildInflationSection,
  runInflateEstimate,
  REFINED_ESTIMATE_MARKER_RE,
} from '../verbs/inflate-estimate.mjs';

// ---------------------------------------------------------------------------
// Unit: parseArgs
// ---------------------------------------------------------------------------
{
  const parsed = parseArgs([
    '42',
    '--size',
    'M',
    '--estimate',
    '6h',
    '--reason',
    'Discovered auth complexity',
    '--item',
    'Add OAuth flow (~2h)',
    '--item',
    'Write token refresh tests (~1h)',
  ]);
  assert.equal(parsed.issueNumber, 42);
  assert.equal(parsed.size, 'M');
  assert.equal(parsed.estimate, '6h');
  assert.equal(parsed.reason, 'Discovered auth complexity');
  assert.deepEqual(parsed.items, ['Add OAuth flow (~2h)', 'Write token refresh tests (~1h)']);
  console.log('PASS: parseArgs extracts all fields');
}

// ---------------------------------------------------------------------------
// Unit: validateArgs — invalid size
// ---------------------------------------------------------------------------
{
  assert.throws(
    () => validateArgs({ size: 'HUGE', estimate: '4h', reason: 'x', items: ['a'] }),
    /must be one of/,
    'should reject unknown size bucket'
  );
  console.log('PASS: validateArgs rejects unknown size');
}

// ---------------------------------------------------------------------------
// Unit: buildInflationSection
// ---------------------------------------------------------------------------
{
  const section = buildInflationSection({
    reason: 'OAuth was harder than expected.',
    items: ['Add OAuth flow (~2h)', 'Write tests (~1h)'],
    beforeSize: 'S',
    beforeEstimate: 2,
    newSize: 'M',
    newEstimate: 6,
    date: '2026-05-15',
  });
  assert.match(section, /### Discovered work — estimate inflation \(2026-05-15\)/);
  assert.match(section, /OAuth was harder than expected\./);
  assert.match(section, /\| 1 \| Add OAuth flow \| ~2h \|/);
  assert.match(section, /\| 2 \| Write tests \| ~1h \|/);
  assert.match(section, /\| Size \| S \| M \|/);
  assert.match(section, /exceeded S ceiling of 4h/);
  assert.match(section, /\| Estimate \| 2h \| 6h \| \+4h \|/);
  console.log('PASS: buildInflationSection produces three-part format');
}

// ---------------------------------------------------------------------------
// Helpers shared by integration tests
// ---------------------------------------------------------------------------
const REFINE_BODY =
  '<!-- aitm-refined-estimate: 42 -->\n### 🛠 Refine estimate\n\n| Field | Value |\n|---|---|\n| Size | S |\n';
const ISSUE_BODY =
  '## Scope\n\nDo the thing.\n\n<!-- aitm-fields: {"schema":1,"values":{"size":"S","estimate":2}} -->\n';
const BASE_CFG = {
  repo: 'owner/repo',
  projectId: 'PVT_FAKE',
  fieldIds: { size: 'F_SIZE', estimate: 'F_EST' },
};
const FIELD_DEFS = [
  { key: 'size', name: 'Size', type: 'single_select' },
  { key: 'estimate', name: 'Estimate', type: 'number' },
];

function makeDeps({ comments = [], issueBody = ISSUE_BODY } = {}) {
  const patched = [];
  const boardWrites = [];
  const bodyWrites = [];

  return {
    deps: {
      listComments: async () => comments,
      patchComment: async ({ commentId, body }) => {
        patched.push({ commentId, body });
      },
      getIssueBody: async () => issueBody,
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(issueBody);
        if (next === issueBody) return { status: 'no-op' };
        bodyWrites.push(next);
        return { status: 'ok' };
      },
      projectValuesForIssue: async () => ({ size: 'S', estimate: 2 }),
      projectItemForIssue: async () => ({ issueId: 'ISS_FAKE', itemId: 'ITEM_FAKE' }),
      fieldOptionMap: async () => ({ F_SIZE: { S: 'opt_s', M: 'opt_m', L: 'opt_l' } }),
      writeProjectFieldValue: async (args) => {
        boardWrites.push(args);
      },
      loadProjectFieldDefs: () => FIELD_DEFS,
    },
    patched,
    boardWrites,
    bodyWrites,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Successful append
// ---------------------------------------------------------------------------
{
  const { deps, patched, boardWrites, bodyWrites } = makeDeps({
    comments: [{ id: 99, body: REFINE_BODY }],
  });

  const result = await runInflateEstimate(
    {
      issueNumber: 42,
      size: 'M',
      estimate: '6h',
      reason: 'Auth was complex.',
      items: ['OAuth flow (~2h)'],
    },
    BASE_CFG,
    deps
  );

  assert.equal(result.status, 'appended');
  assert.equal(result.boardUpdated, true);

  // Comment was patched once
  assert.equal(patched.length, 1);
  assert.equal(patched[0].commentId, 99);
  assert.match(patched[0].body, REFINED_ESTIMATE_MARKER_RE);
  assert.match(patched[0].body, /### Discovered work — estimate inflation/);
  assert.match(patched[0].body, /Auth was complex\./);

  // Board received size + estimate writes
  const sizeWrite = boardWrites.find((w) => w.fieldId === 'F_SIZE');
  const estWrite = boardWrites.find((w) => w.fieldId === 'F_EST');
  assert.ok(sizeWrite, 'size field write missing');
  assert.ok(estWrite, 'estimate field write missing');

  // Issue body was updated
  assert.equal(bodyWrites.length, 1);
  assert.match(bodyWrites[0], /aitm-fields/);

  console.log('PASS: successful append — comment patched, board updated, body updated');
}

// ---------------------------------------------------------------------------
// Test 2: Missing refine-estimate comment → no-refine-comment
// ---------------------------------------------------------------------------
{
  const { deps } = makeDeps({
    comments: [{ id: 5, body: '## Some other comment\n\nHello.' }],
  });

  const result = await runInflateEstimate(
    { issueNumber: 42, size: 'M', estimate: '6h', reason: 'x', items: ['item (~1h)'] },
    BASE_CFG,
    deps
  );

  assert.equal(result.status, 'no-refine-comment');
  console.log('PASS: missing refine-estimate comment → no-refine-comment');
}

// ---------------------------------------------------------------------------
// Test 3: Idempotent re-run — appends a second block, not overwriting
// ---------------------------------------------------------------------------
{
  const firstSection = buildInflationSection({
    reason: 'First inflation.',
    items: ['Task A (~1h)'],
    beforeSize: 'S',
    beforeEstimate: 2,
    newSize: 'M',
    newEstimate: 4,
    date: '2026-05-10',
  });
  const bodyWithFirstInflation = REFINE_BODY + firstSection;

  const { deps, patched } = makeDeps({
    comments: [{ id: 99, body: bodyWithFirstInflation }],
  });

  const result = await runInflateEstimate(
    {
      issueNumber: 42,
      size: 'L',
      estimate: '12h',
      reason: 'Second inflation.',
      items: ['Task B (~6h)'],
    },
    BASE_CFG,
    deps
  );

  assert.equal(result.status, 'appended');
  assert.equal(patched.length, 1);

  // Both inflation sections must be present
  assert.match(patched[0].body, /First inflation\./);
  assert.match(patched[0].body, /Second inflation\./);

  // Sections appear in order
  const firstIdx = patched[0].body.indexOf('First inflation.');
  const secondIdx = patched[0].body.indexOf('Second inflation.');
  assert.ok(firstIdx < secondIdx, 'first inflation should appear before second');

  console.log('PASS: idempotent re-run appends second block, preserves first');
}

console.log('\nAll inflate-estimate tests passed.');
