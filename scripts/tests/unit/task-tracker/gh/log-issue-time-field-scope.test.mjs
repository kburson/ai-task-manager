// @story #2003
import assert from 'node:assert/strict';
import test from 'node:test';
import { publishTimingBoardFields } from '../../../../gh/log-issue-time.mjs';
import { loadProjectFieldDefs } from '../../../../task-tracker/project-fields.mjs';

function fixture() {
  const board = {
    EST: 25,
    SIZE: 'L',
    PRI: 'P0',
    RANK: 5,
    DISP: 'Delivered',
    START: 'current start',
  };
  const calls = [];
  return {
    board,
    calls,
    args: {
      cfg: {
        projectId: 'PVT_FIXTURE',
        fieldIds: {
          estimate: 'EST',
          size: 'SIZE',
          priority: 'PRI',
          rank: 'RANK',
          disposition: 'DISP',
          startTime: 'START',
          engagedTime: 'ENG',
          sessionTime: 'SES',
          reviewTime: 'REV',
          planTime: 'PLAN',
        },
      },
      itemId: 'ITEM_FIXTURE',
      fieldDefs: loadProjectFieldDefs(),
      values: {
        estimate: 10,
        size: 'S',
        priority: 'P2',
        rank: 1,
        disposition: 'BLOCKED',
        startTime: 'stale start',
        engagedTime: 1,
        sessionTime: 2,
        reviewTime: 3,
        planTime: 4,
      },
      projection: {
        unknownFields: [],
        secondsByKey: { engagedTime: 60, sessionTime: 120, reviewTime: 180, planTime: 240 },
      },
      write: async (input) => {
        calls.push(input);
        board[input.fieldId] =
          input.value.number ?? input.value.singleSelectOptionName ?? input.value.text;
      },
    },
  };
}

test('timing publication preserves newer delivery fields instead of projecting stale body cache', async () => {
  const f = fixture();
  await publishTimingBoardFields(f.args);
  assert.deepEqual(
    f.calls.map(({ fieldId }) => fieldId),
    ['ENG', 'SES', 'REV', 'PLAN']
  );
  assert.deepEqual(
    {
      EST: f.board.EST,
      SIZE: f.board.SIZE,
      PRI: f.board.PRI,
      RANK: f.board.RANK,
      DISP: f.board.DISP,
      START: f.board.START,
    },
    { EST: 25, SIZE: 'L', PRI: 'P0', RANK: 5, DISP: 'Delivered', START: 'current start' }
  );
  assert.equal(f.board.ENG, '00d 00h 01m 00s');
});

test('unknown timing evidence cannot send Unknown to non-timing fields', async () => {
  const f = fixture();
  f.args.projection.unknownFields = ['estimate', 'disposition', 'engagedTime'];
  await publishTimingBoardFields(f.args);
  assert.deepEqual(
    f.calls.map(({ fieldId }) => fieldId),
    ['SES', 'REV', 'PLAN', 'ENG']
  );
  assert.match(f.board.ENG, /^Unknown/);
  assert.equal(f.board.EST, 25);
  assert.equal(f.board.DISP, 'Delivered');
});

test('timing targets retain valid zero and true second precision while cached startTime is untouched', async () => {
  const f = fixture();
  f.args.values.engagedTime = 0;
  f.args.projection.secondsByKey = {
    engagedTime: 0,
    sessionTime: 1,
    reviewTime: 60,
    planTime: 86461,
  };
  await publishTimingBoardFields(f.args);
  assert.deepEqual(
    f.calls.map(({ fieldId }) => fieldId),
    ['ENG', 'SES', 'REV', 'PLAN']
  );
  assert.deepEqual(
    [f.board.ENG, f.board.SES, f.board.REV, f.board.PLAN],
    ['00d 00h 00m 00s', '00d 00h 00m 01s', '00d 00h 01m 00s', '01d 00h 01m 01s']
  );
  assert.equal(f.board.START, 'current start');
});
