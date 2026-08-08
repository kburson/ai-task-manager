// @story #1130 — canonical Epic metadata convergence.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planEpicMetadata,
  reconcileEpicBody,
  reconcileEpicMetadata,
} from '../../../../../gh/lib/epic-metadata.mjs';
import { EPIC_PREFIX } from '../../../../../gh/lib/kind-prefix.mjs';

const DOD = [
  '### Functional (verified at Test)',
  '',
  '- [ ] tests <!-- dod:functional:tests --> <!-- dod:kinds exclude="epic" -->',
  '- [ ] commits <!-- dod:functional:commits --> <!-- dod:kinds include="epic" -->',
].join('\n');

const BODY = [
  '## Definition of Done',
  '',
  '### Functional (verified at Test)',
  '',
  '- [ ] tests <!-- dod:functional:tests --> <!-- dod:kinds exclude="epic" -->',
  '',
  '## AITM Progress Markers',
  '',
].join('\n');

test('plans every missing visible Epic carrier with Epic prefix precedence', () => {
  const plan = planEpicMetadata({
    title: '🐞 [BUG] Metadata drift',
    labels: ['bug'],
    body: BODY,
    forceEpic: true,
  });
  assert.equal(plan.isEpic, true);
  assert.deepEqual(plan.labelsToAdd, ['epic']);
  assert.equal(plan.desiredTitle, `${EPIC_PREFIX}Metadata drift`);
});

test('recognizes the durable marker and is idempotent once visible metadata converges', () => {
  const body = `${BODY}\n<!-- aitm-issue-kind kind="epic" -->\n`;
  const plan = planEpicMetadata({
    title: `${EPIC_PREFIX}Metadata drift`,
    labels: ['bug', 'epic'],
    body,
  });
  assert.equal(plan.isEpic, true);
  assert.deepEqual(plan.labelsToAdd, []);
  assert.equal(plan.desiredTitle, `${EPIC_PREFIX}Metadata drift`);
  assert.equal(plan.titleChanged, false);
});

test('reconciles the body marker and Epic-specific DoD idempotently', () => {
  const once = reconcileEpicBody(BODY, DOD);
  assert.match(once, /aitm-issue-kind kind="epic"/);
  assert.doesNotMatch(once, /dod:functional:tests/);
  assert.match(once, /dod:functional:commits/);
  assert.equal(reconcileEpicBody(once, DOD), once);
});

test('reconciler writes only missing carriers and verifies live readback', async () => {
  let live = { title: 'Metadata drift', labels: ['bug'], body: BODY };
  const writes = [];
  const result = await reconcileEpicMetadata({
    issueNumber: 42,
    repo: 'o/r',
    forceEpic: true,
    deps: {
      readIssue: async () => structuredClone(live),
      readDodTemplate: () => DOD,
      mutateIssueBody: async ({ mutate }) => {
        live.body = mutate(live.body);
        writes.push('body');
        return { status: 'ok' };
      },
      writeVisible: async ({ title, labelsToAdd }) => {
        live.title = title ?? live.title;
        live.labels.push(...labelsToAdd);
        writes.push('visible');
      },
    },
  });
  assert.equal(result.status, 'reconciled');
  assert.deepEqual(writes, ['body', 'visible']);
  assert.match(live.body, /aitm-issue-kind kind="epic"/);
  assert.ok(live.labels.includes('epic'));
  assert.equal(live.title, `${EPIC_PREFIX}Metadata drift`);

  writes.length = 0;
  const again = await reconcileEpicMetadata({
    issueNumber: 42,
    repo: 'o/r',
    forceEpic: true,
    deps: {
      readIssue: async () => structuredClone(live),
      readDodTemplate: () => DOD,
      mutateIssueBody: async ({ mutate }) => {
        const before = live.body;
        const next = mutate(live.body);
        if (next !== before) writes.push('body');
        live.body = next;
        return { status: next === before ? 'no-op' : 'ok' };
      },
      writeVisible: async () => writes.push('visible'),
    },
  });
  assert.equal(again.status, 'already-converged');
  assert.deepEqual(writes, []);
});

test('reconciler fails closed when readback remains incomplete', async () => {
  await assert.rejects(
    reconcileEpicMetadata({
      issueNumber: 42,
      repo: 'o/r',
      forceEpic: true,
      deps: {
        readIssue: async () => ({ title: 'Metadata drift', labels: [], body: BODY }),
        readDodTemplate: () => DOD,
        mutateIssueBody: async () => ({ status: 'ok' }),
        writeVisible: async () => {},
      },
    }),
    /readback/
  );
});
