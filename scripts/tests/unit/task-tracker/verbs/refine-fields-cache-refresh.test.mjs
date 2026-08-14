// @story #223
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRefine } from '../../../../task-tracker/verbs/refine.mjs';
import { parseIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';

const FIELD_DEFS = [
  { key: 'priority', name: 'Priority' },
  { key: 'size', name: 'Size' },
  { key: 'estimate', name: 'Estimate' },
  { key: 'rank', name: 'Rank' },
];

const STARTING_BODY = `## Scope

something

## Acceptance Criteria

- [ ] foo

<!-- aitm-fields: {"schema":1,"values":{"priority":null,"size":null,"estimate":null,"rank":null}} -->
`;

function makeDeps({ writtenBodyRef, fetchRef }) {
  const deps = {
    tetherIssueToProject: async () => ({}),
    fieldOptionMap: async () => ({}),
    fetchBody: async () => (fetchRef && fetchRef.value) || STARTING_BODY,
    mutateBody: async ({ mutate }) => {
      const base = (fetchRef && fetchRef.value) || STARTING_BODY;
      const next = mutate(base);
      if (next === base) return { status: 'no-op' };
      writtenBodyRef.value = next;
      return { status: 'ok' };
    },
    addLabels: async () => {},
    assertBound: () => {},
    verbPromote: async () => {},
    ensureIssueFieldDb: undefined,
    loadProjectFieldDefs: () => FIELD_DEFS,
  };
  return deps;
}

const CFG = {
  repo: 'kburson/ai-task-manager',
  projectId: 'PVT_test',
};

test('#223: refine refreshes aitm-fields cache with priority/size/estimate/rank', async () => {
  const writtenBodyRef = { value: null };
  const deps = makeDeps({ writtenBodyRef });
  await runRefine({
    args: {
      issueNumber: 223,
      size: 'S',
      estimate: 1,
      priority: 'p2',
      reason: 'unit test',
      rank: 223,
      labels: null,
    },
    cfg: CFG,
    deps,
  });
  assert.ok(writtenBodyRef.value, 'writeBody was called');
  const parsed = parseIssueFieldDb(writtenBodyRef.value);
  assert.ok(parsed.ok, `aitm-fields marker parses: ${parsed.reason || ''}`);
  assert.equal(parsed.values.priority, 'P2');
  assert.equal(parsed.values.size, 'S');
  assert.equal(parsed.values.estimate, 1);
  assert.equal(parsed.values.rank, 223);
});

test('#223: refine overrides stale prior values in aitm-fields cache', async () => {
  const writtenBodyRef = { value: null };
  const STALE_BODY = STARTING_BODY.replace(/"priority":null/, '"priority":"P0"').replace(
    /"size":null/,
    '"size":"XL"'
  );
  const fetchRef = { value: STALE_BODY };
  const deps = makeDeps({ writtenBodyRef, fetchRef });
  await runRefine({
    args: {
      issueNumber: 223,
      size: 'S',
      estimate: 2,
      priority: 'p1',
      reason: 'override stale',
      rank: null,
      labels: null,
    },
    cfg: CFG,
    deps,
  });
  const parsed = parseIssueFieldDb(writtenBodyRef.value);
  assert.ok(parsed.ok);
  assert.equal(parsed.values.priority, 'P1', 'priority overridden');
  assert.equal(parsed.values.size, 'S', 'size overridden');
  assert.equal(parsed.values.estimate, 2);
});
