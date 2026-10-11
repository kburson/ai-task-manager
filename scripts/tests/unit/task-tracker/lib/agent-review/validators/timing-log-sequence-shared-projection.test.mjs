// @story #1994
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../../../../task-tracker/lib/agent-review/validators/timing-log-sequence.mjs';
const HEADER =
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Δ Words (full) |';
const SEP = '|---|---|---|---|---|---|---|---|';
const entered = (...stages) => stages.map((stage) => ({ stage }));

const SHARED_RESUME_MOVE = 'move:ab931417-450c-417c-9a0f-6ac6292a9c37';
const DEPARTED_ACTOR = 'v1:bb731a253adc24bfa2206627349b837db6ab2b6618968e61e4dde8d71ff2d04b';
const RETURNED_ACTOR = 'v1:113a9c97b4c9976edbec7c9293141773cffe3cf3b8f2feff7d4998a534330133';

async function mixedLifecycleRows() {
  // Stored historical fixtures exercise the reader, not the live row writer.
  const { timingActorMarker, timingEngagementMarker } =
    await import('../../../../../../task-tracker/lib/timing-actor.mjs');
  const row = (clock, event, extra = {}) => {
    const {
      actorKey,
      engagement,
      wordMarker = 3403,
      fullWordMarker = 202476,
      activeSec = 0,
      idleSec = 0,
      deltaWords = 0,
    } = extra;
    const suffix = actorKey
      ? timingActorMarker(actorKey) + (engagement ? timingEngagementMarker(engagement) : '')
      : ' <!-- row-sec: a=0 i=0 -->';
    return `| 2026-10-11 ${clock} -05:00 | ${event} | ${activeSec === null ? 'Unknown' : ''} | ${idleSec === null ? 'Unknown' : ''} | ${deltaWords} | ${wordMarker.toLocaleString('en-US')} | ${event} | ${fullWordMarker.toLocaleString('en-US')} |${suffix}`;
  };
  const projection = (clock, event, move = SHARED_RESUME_MOVE, extra = {}) =>
    row(clock, event, extra).replace(
      ' <!-- row-sec:',
      ` <!-- aitm-transition move="${move}" --> <!-- row-sec:`
    );
  const interval = (start, end, wordStart, wordEnd, fullWordStart, fullWordEnd) => ({
    startMs: Date.parse(`2026-10-11T${start}-05:00`),
    endMs: Date.parse(`2026-10-11T${end}-05:00`),
    activeEstimateSec: null,
    wordStart,
    wordEnd,
    fullWordStart,
    fullWordEnd,
  });
  return [
    row('11:19:40', 'start', {
      actorKey: DEPARTED_ACTOR,
      wordMarker: 3402,
      fullWordMarker: 202463,
    }),
    projection('11:19:58', 'ready-for-plan:started', 'move:9064b6b3-501a-4b88-b6a7-d0fc2d15b880', {
      wordMarker: 3402,
      fullWordMarker: 202463,
    }),
    row('11:20:15', 'switch-out:#1987', {
      actorKey: DEPARTED_ACTOR,
      activeSec: null,
      idleSec: null,
      deltaWords: 1,
      engagement: interval('11:19:40', '11:20:15', 3402, 3403, 202463, 202476),
    }),
    projection('12:51:11', 'resumed'),
    projection('12:51:11', 'plan:started'),
    row('12:52:17', 'start', {
      actorKey: RETURNED_ACTOR,
      wordMarker: 52,
      fullWordMarker: 4110,
    }),
    row('12:53:00', 'stop', {
      actorKey: RETURNED_ACTOR,
      activeSec: null,
      idleSec: null,
      wordMarker: 52,
      fullWordMarker: 4110,
      engagement: interval('12:52:17', '12:53:00', 52, 52, 4110, 4110),
    }),
  ];
}

function mixedLifecycleContext(rows, stages = entered('ready-for-plan', 'plan')) {
  return {
    comments: [{ body: ['## ⏱ Timing Log', HEADER, SEP, ...rows].join('\n') }],
    markers: { enteredStages: stages },
  };
}

test('#1994: actual actor departure and shared resumed/plan projection pass without source mutation', async () => {
  const ctx = mixedLifecycleContext(await mixedLifecycleRows());
  const before = structuredClone(ctx);
  assert.deepEqual(validate(ctx), { pass: true, failures: [] });
  assert.deepEqual(ctx, before);
  assert.match(ctx.comments[0].body, /switch-out:#1987 \| Unknown \| Unknown/);
  assert.match(ctx.comments[0].body, /active=unknown/);
});

test('#1994: only a complete zero-work producer projection avoids legacy doubled-return checks', async (t) => {
  const { replaceTimingRowCells } =
    await import('../../../../../../task-tracker/lib/timing-row-reader.mjs');
  const cell = (index, value) => (rows) => {
    rows[3] = replaceTimingRowCells(rows[3], { [index]: ` ${value} ` });
  };
  const variants = [
    [
      'missing move',
      (rows) => {
        rows[3] = rows[3].replace(/<!-- aitm-transition[^>]+-->/, '');
      },
    ],
    [
      'malformed move',
      (rows) => {
        rows[3] = rows[3].replace(SHARED_RESUME_MOVE, 'move:bad');
      },
    ],
    [
      'mismatched move',
      (rows) => {
        rows[4] = rows[4].replace(SHARED_RESUME_MOVE, 'move:9064b6b3-501a-4b88-b6a7-d0fc2d15b880');
      },
    ],
    [
      'duplicated move',
      (rows) => {
        rows[3] = rows[3].replace(
          '<!-- row-sec:',
          `<!-- aitm-transition move="${SHARED_RESUME_MOVE}" --> <!-- row-sec:`
        );
      },
    ],
    [
      'mismatched clock',
      (rows) => {
        rows[4] = rows[4].replace('12:51:11', '12:51:12');
      },
    ],
    [
      'mismatched word cursor',
      (rows) => {
        rows[4] = replaceTimingRowCells(rows[4], { 6: ' 3,404 ' });
      },
    ],
    [
      'mismatched full cursor',
      (rows) => {
        rows[4] = replaceTimingRowCells(rows[4], { 8: ' 202,477 ' });
      },
    ],
    ['malformed word cursor', cell(6, 'broken')],
    ['malformed full cursor', cell(8, 'broken')],
    ['visible active work', cell(3, '1s')],
    ['visible idle time', cell(4, '1s')],
    ['unknown duration', cell(3, 'Unknown')],
    ['nonzero delta', cell(5, '1')],
    ['malformed delta', cell(5, 'broken')],
    ['missing delta', cell(5, '')],
    [
      'nonzero active seconds',
      (rows) => {
        rows[3] = rows[3].replace('row-sec: a=0 i=0', 'row-sec: a=1 i=0');
      },
    ],
    [
      'nonzero idle seconds',
      (rows) => {
        rows[4] = rows[4].replace('row-sec: a=0 i=0', 'row-sec: a=0 i=1');
      },
    ],
    [
      'missing seconds',
      (rows) => {
        rows[3] = rows[3].replace('<!-- row-sec: a=0 i=0 -->', '');
      },
    ],
    [
      'malformed seconds',
      (rows) => {
        rows[3] = rows[3].replace('row-sec: a=0 i=0', 'row-sec: a=bad i=0');
      },
    ],
    [
      'unpaired return',
      (rows) => {
        rows.splice(4, 1);
      },
    ],
    [
      'no actor departure',
      (rows) => {
        rows.splice(2, 1);
      },
    ],
    [
      'non-entry companion',
      (rows) => {
        rows[4] = rows[4].replace('plan:started', 'plan:completed');
      },
    ],
    [
      'genuine doubled return',
      (rows) => {
        rows.splice(5, 0, rows[3]);
      },
    ],
  ];
  for (const [name, change] of variants) {
    await t.test(name, async () => {
      const rows = await mixedLifecycleRows();
      change(rows);
      const res = validate(mixedLifecycleContext(rows));
      assert.equal(res.pass, false, JSON.stringify(res.failures));
      assert.ok(
        res.failures.some((failure) => /doubled step/.test(failure)),
        JSON.stringify(res.failures)
      );
    });
  }
});

test('#1994: projection recognition retains shared stage and actor-local integrity checks', async () => {
  const { replaceTimingRowCells } =
    await import('../../../../../../task-tracker/lib/timing-row-reader.mjs');
  const missingMarker = validate(
    mixedLifecycleContext(await mixedLifecycleRows(), entered('ready-for-plan'))
  );
  assert.equal(missingMarker.pass, false);
  assert.ok(missingMarker.failures.some((failure) => /no aitm-entered-plan marker/.test(failure)));

  const skipped = await mixedLifecycleRows();
  skipped[4] = skipped[4].replace('plan:started', 'develop:started');
  const stageSkip = validate(mixedLifecycleContext(skipped, entered('ready-for-plan', 'develop')));
  assert.equal(stageSkip.pass, false);
  assert.ok(
    stageSkip.failures.some((failure) => /forward skip ready-for-plan→develop/.test(failure))
  );

  const duplicate = await mixedLifecycleRows();
  duplicate.splice(6, 0, duplicate[5]);
  const actorDuplicate = validate(mixedLifecycleContext(duplicate));
  assert.equal(actorDuplicate.pass, false);
  assert.ok(actorDuplicate.failures.some((failure) => /duplicate-actor-start/.test(failure)));

  const outOfOrder = await mixedLifecycleRows();
  outOfOrder[6] = replaceTimingRowCells(outOfOrder[6], { 1: ' 2026-10-11 12:52:16 -05:00 ' });
  const actorOrder = validate(mixedLifecycleContext(outOfOrder));
  assert.equal(actorOrder.pass, false);
  assert.ok(actorOrder.failures.some((failure) => /out-of-order/.test(failure)));

  const conflict = await mixedLifecycleRows();
  const actorStart = Date.parse('2026-10-11T12:52:17-05:00');
  conflict[6] = conflict[6].replace(`start=${actorStart}`, `start=${actorStart - 1000}`);
  const actorConflict = validate(mixedLifecycleContext(conflict));
  assert.equal(actorConflict.pass, false);
  assert.ok(
    actorConflict.failures.some((failure) => /actor-evidence-start-conflict/.test(failure))
  );
});
