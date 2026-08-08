// @story #1035
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runDispose } from '../../../lib/close-disposition.mjs';
import {
  writeTerminalDisposition,
  writeTerminalStatusDone,
} from '../../../lib/terminal-disposition.mjs';
import { runSupersede } from '../../../verbs/supersede.mjs';

const cfg = {
  repo: 'owner/repo',
  projectId: 'P',
  fieldDisposition: 'F_DISPOSITION',
  kanbanFieldId: 'F_STATUS',
  kanbanOptionDone: 'O_DONE',
};

function writerHarness({ itemId = 'ITEM', optionMap } = {}) {
  const writes = [];
  const deps = {
    projectItemForIssue: async () => ({ itemId }),
    fieldOptionMap: async () =>
      optionMap || {
        F_DISPOSITION: {
          Delivered: 'O_DELIVERED',
          Replaced: 'O_REPLACED',
          Discarded: 'O_DISCARDED',
          Duplicate: 'O_DUPLICATE',
        },
      },
    writeProjectFieldValue: async (input) => {
      writes.push(input);
      return true;
    },
  };
  return { deps, writes };
}

test('terminal helper writes the selected Disposition to the issue project item', async () => {
  const h = writerHarness();
  await writeTerminalDisposition({
    cfg,
    issueNumber: 1035,
    disposition: 'Delivered',
    deps: h.deps,
  });
  assert.deepEqual(h.writes, [
    {
      projectId: 'P',
      itemId: 'ITEM',
      fieldId: 'F_DISPOSITION',
      value: { singleSelectOptionName: 'Delivered' },
      optionMap: {
        F_DISPOSITION: {
          Delivered: 'O_DELIVERED',
          Replaced: 'O_REPLACED',
          Discarded: 'O_DISCARDED',
          Duplicate: 'O_DUPLICATE',
        },
      },
    },
  ]);
});

test('terminal helper fails loud for missing field, project item, or option', async () => {
  await assert.rejects(
    writeTerminalDisposition({
      cfg: { ...cfg, fieldDisposition: '', fieldIds: {} },
      issueNumber: 1,
      disposition: 'Delivered',
    }),
    /fieldDisposition/
  );
  await assert.rejects(
    writeTerminalDisposition({
      cfg,
      issueNumber: 1,
      disposition: 'Delivered',
      deps: writerHarness({ itemId: '' }).deps,
    }),
    /project item/
  );
  await assert.rejects(
    writeTerminalDisposition({
      cfg,
      issueNumber: 1,
      disposition: 'Delivered',
      deps: writerHarness({ optionMap: { F_DISPOSITION: {} } }).deps,
    }),
    /Delivered/
  );
});

test('terminal Done helper writes the configured Status option without option discovery', async () => {
  const h = writerHarness();
  await writeTerminalStatusDone({ cfg, issueNumber: 1035, deps: h.deps });
  assert.equal(h.writes[0].fieldId, 'F_STATUS');
  assert.deepEqual(h.writes[0].optionMap, { F_STATUS: { Done: 'O_DONE' } });
});

test('close-as retains the board item and writes matching terminal values', async () => {
  const events = [];
  const deps = {
    flushTiming: async () => events.push('flush'),
    mutateIssueBody: async ({ mutate }) => {
      events.push('marker');
      assert.match(mutate('body'), /aitm-closed-as/);
    },
    writeDisposition: async ({ disposition }) => events.push(`disposition:${disposition}`),
    moveToDone: async () => events.push('done'),
    pexec: async () => events.push('close'),
    postComment: async ({ body }) => {
      events.push('comment');
      assert.match(body, /retained on the project board/i);
    },
    now: () => '2026-07-29T00:00:00Z',
  };
  await runDispose({
    issueNumber: 1035,
    reason: 'not-planned',
    repo: cfg.repo,
    projectId: cfg.projectId,
    cfg,
    deps,
  });
  assert.deepEqual(events, [
    'flush',
    'marker',
    'disposition:Discarded',
    'done',
    'close',
    'comment',
  ]);
  assert.ok(!('deleteProjectV2Item' in deps));
});

test('close-as reports sequence-significant timing rows retained for retry', async () => {
  const warnings = [];
  await runDispose({
    issueNumber: 1035,
    reason: 'not-planned',
    repo: cfg.repo,
    projectId: cfg.projectId,
    cfg,
    deps: {
      flushTiming: async () => ({ delivered: 0, discarded: 1, retained: 2 }),
      warn: (message) => warnings.push(message),
      mutateIssueBody: async () => {},
      writeDisposition: async () => {},
      moveToDone: async () => {},
      pexec: async () => {},
      postComment: async () => {},
    },
  });
  assert.deepEqual(warnings, [
    'retained 2 sequence-significant timing row(s) for #1035; retry queue remains non-empty',
  ]);
});

test('supersede writes Replaced before its marker, Done bypass, and close', async () => {
  const events = [];
  const result = await runSupersede({
    deadIssue: 1030,
    byIssue: 1033,
    cfg,
    deps: {
      issueExists: async () => true,
      writeDisposition: async ({ disposition }) => events.push(`disposition:${disposition}`),
      mutateIssueBody: async () => events.push('marker'),
      runMoveState: async () => {
        events.push('done');
        return 0;
      },
      postComment: async () => events.push('comment'),
      closeNotPlanned: async () => events.push('close'),
      now: () => '2026-07-29T00:00:00Z',
    },
  });
  assert.equal(result.status, 'superseded');
  assert.deepEqual(events.slice(0, 4), ['disposition:Replaced', 'marker', 'done', 'comment']);
  assert.ok(events.indexOf('close') > events.indexOf('done'));
});

test('verified close declares a Delivered write before the terminal board move', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.resolve(here, '../../../verbs/close.mjs'), 'utf8');
  const delivered = source.indexOf("disposition: 'Delivered'");
  const preMove = source.indexOf('const preMove = await runMoveStateDone');
  assert.ok(delivered !== -1, 'close must declare the Delivered disposition');
  assert.ok(delivered < preMove, 'Delivered write must precede the irreversible terminal move');
});
