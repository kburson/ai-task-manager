# Timing field scope implementation plan — #2003

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for this focused prerequisite. Keep the parent #1908 inline method and its one final whole-branch review.

**Goal:** Publish timing without overwriting newer delivery authority from cached issue-body fields.

**Architecture:** Restrict the timing caller before it invokes the existing general field planner. Use its canonical four-key timing set for both known values and Unknown evidence. Keep main's separately identified start-time repair and all generic semantic writers unchanged.

**Tech Stack:** Node.js >=24, ESM, node:test, existing GitHub transport.

**Spec:** [Confirmed defect #2003 Scope, Reproduction and ACs](https://github.com/kburson/ai-task-manager/issues/2003). Discovery is the accepted #1908 census obligation under #1992; this standalone runtime follow-up preserves that seven-child plan.

## Story Intent

- **Beneficiary:** delivery owner
- **Capability:** update timing without restoring cached delivery fields
- **Need:** stale issue-body values can overwrite newer board authority during timing publication
- **Value or failure prevented:** scope growth, decomposition restrictions and current dependency disposition remain intact

## Global Constraints

- No Estimate revision or history is created by timing.
- Only engagedTime, sessionTime, reviewTime and planTime are actuals targets.
- Existing explicit startTime repair remains in main, separate from cached actuals projection.
- No threshold, schema, configuration or foreign migration change.
- Test section ceilings remain suspended through #1908 completion; actual failures and native authority protections still govern.

## Review Focus

The task's literal adapter tests cover stale low Estimate, stale BLOCKED disposition, mixed Unknown keys, valid zero/seconds and cached startTime. The final branch review should also inspect configured field aliases, missing IDs, fresh-body concurrency, the actual CLI start-time repair, and preservation of pending publication when this fix composes with #1908.

### Task 1: Restrict timing targets without changing general field synchronization

**Files:** Modify scripts/gh/log-issue-time.mjs. Create scripts/tests/unit/task-tracker/gh/log-issue-time-field-scope.test.mjs. Refresh source-derived GraphQL positions for this one runtime file if moved; do not change classes or counts.

**Interfaces:** Consume publishTimingBoardFields({cfg,itemId,fieldDefs,values,projection,resolvedFieldIds,write}) and TIMING_DURATION_FIELD_KEYS. Produce no new API; only the four legitimate timing targets may reach the injected write port. Existing main handles startTime independently.

- [ ] Step 1: Write the actual controlled-transport regression below.

```javascript
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
```

- [ ] Step 2: Run the targeted entry and observe the reported wrong EST/DISP targets before implementation.

Run: `node --test scripts/tests/unit/task-tracker/gh/log-issue-time-field-scope.test.mjs`
Expected: FAIL because the current helper emits cached delivery fields and non-timing Unknown writes.

- [ ] Step 3: Add TIMING_DURATION_FIELD_KEYS to the existing project-fields import. Restrict the unknown key list before field-ID mapping and the field definitions before generic planning.

```javascript
const unknownIds = new Set(
  projection.unknownFields
    .filter((key) => TIMING_DURATION_FIELD_KEYS.has(key))
    .map((key) => fieldIdFor(effectiveCfg, key))
    .filter(Boolean)
);
const plan = buildFieldSyncPlan({
  cfg: effectiveCfg,
  fieldDefs: fieldDefs.filter(({ key }) => TIMING_DURATION_FIELD_KEYS.has(key)),
  values,
  secondsByKey: projection.secondsByKey,
});
```

- [ ] Step 4: Verify the three literal target/value cases and existing actual CLI compatibility.

Run: `node --test scripts/tests/unit/task-tracker/gh/log-issue-time-field-scope.test.mjs scripts/tests/slow/task-tracker/lib/log-issue-time.test.mjs`
Expected: PASS; no Estimate/Size/Priority/Rank/Disposition/cached-startTime write from the actuals helper, zero/seconds and Unknown retained.

- [ ] Step 5: Run the full fast floor, lint and format; commit with [#2003], register exact native evidence, verify complete exact-head CI with ci-slow, then native Test/Review/delivery/close. Current-snapshot CLI receipts govern all transitions; no raw gh merge or close.

Run: `npm test`
Run: `npm run lint`
Run: `npm run format:check`
Expected: PASS. Any actual failure is diagnosed and recorded; no new acceptance is claimed from pre-implementation tests.

## Self-review

The single task implements all three ACs through the real timing adapter and old CLI seam. All named symbols already exist except the new test entry; no mock admission result, placeholder implementation or new policy is introduced. The general planner deliberately remains all-field. After this story is genuinely delivered, Task7 owns the pending-fence composition, complete census and operator documentation.
