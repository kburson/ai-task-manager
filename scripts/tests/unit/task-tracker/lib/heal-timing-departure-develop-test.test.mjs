// @story #2017
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverRedundantSameSecondReengagement } from '../../../../task-tracker/lib/heal-timing-departure.mjs';
import { timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
import { main, runHealDeparture } from '../../../../task-tracker/heal-timing-departure.mjs';

const move = 'move:1d20b59a-1650-407f-ab19-7931367604b3';
const marker = `<!-- aitm-transition move="${move}" -->`;
const rows = ['develop:completed', 'resumed', 'test:started'].map(
  (event) =>
    `| 2026-10-14 11:52:09 -05:00 | ${event} |  |  | 0 | 1,542 | ${event} | 64,182 | ${marker} <!-- row-sec: a=0 i=0 -->`
);
const prefix = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
  '|---|---|---|---|---|---|---|---|',
  '| 2026-10-14 11:51:00 -05:00 | develop:started | Unknown |  | 0 | 1,542 | unknown duration retained | 64,182 | <!-- row-sec: a=0 i=0 -->',
];
const body = (selected = rows) =>
  [...prefix, ...selected, '', 'Unknown totals remain Unknown.', ''].join('\n');
const recover = (value) => recoverRedundantSameSecondReengagement(value, { rowIndex: 2 });

test('shared Develop to Test recovery removes only the authenticated redundant row and preserves Unknown bytes', () => {
  const original = body();
  assert.equal(recover(original), original.replace(rows[1] + '\n', ''));
  assert.match(recover(original), /Unknown totals remain Unknown/);
});

const misses = [];
for (let index = 0; index < rows.length; index++) {
  for (const [name, change] of [
    ['missing move', (r) => r.replace(marker + ' ', '')],
    ['wrong move', (r) => r.replace(move, 'move:2d20b59a-1650-407f-ab19-7931367604b3')],
    ['malformed move', (r) => r.replace(move, 'move:not-a-uuid')],
    ['duplicate move', (r) => r.replace(marker, `${marker} ${marker}`)],
    ['visible active credit', (r) => r.replace('|  |  | 0 |', '| 1m |  | 0 |')],
    ['durable active credit', (r) => r.replace('a=0 i=0', 'a=1 i=0')],
    ['durable idle credit', (r) => r.replace('a=0 i=0', 'a=0 i=1')],
    ['missing duration evidence', (r) => r.replace(' <!-- row-sec: a=0 i=0 -->', '')],
    ['word delta', (r) => r.replace('|  |  | 0 |', '|  |  | 1 |')],
    ['word cursor drift', (r) => r.replace('| 1,542 |', '| 1,543 |')],
    ['full cursor drift', (r) => r.replace('| 64,182 |', '| 64,183 |')],
    ['missing cursor', (r) => r.replace('| 1,542 |', '| — |')],
    ['different second', (r) => r.replace('11:52:09', '11:52:10')],
    [
      'valid actor identity',
      (r) =>
        r.replace(marker, marker + timingActorMarker({ provider: 'codex', sid: 'fixture-native' })),
    ],
    ['duplicate marker in description', (r) => r.replace('| 64,182 |', `${marker} | 64,182 |`)],
    [
      'actor evidence',
      (r) => r.replace(marker, `${marker} <!-- aitm-actor key="codex:original" -->`),
    ],
  ]) {
    const changed = [...rows];
    changed[index] = change(changed[index]);
    misses.push([`${name} in row ${index}`, body(changed)]);
  }
}
misses.push(
  ['intervening prose', body([rows[0], 'intervening prose', rows[1], rows[2]])],
  [
    'wrong completion',
    body([rows[0].replace('develop:completed', 'plan:completed'), rows[1], rows[2]]),
  ],
  ['wrong entry', body([rows[0], rows[1], rows[2].replace('test:started', 'review:started')])],
  [
    'unknown cursors in all rows',
    body(rows.map((r) => r.replace('| 1,542 |', '| — |').replace('| 64,182 |', '| — |'))),
  ],
  [
    'fractional same-second stamps',
    body(rows.map((r) => r.replace('2026-10-14 11:52:09 -05:00', '2026-10-14T16:52:09.100Z'))),
  ]
);
for (const [name, value] of misses) {
  test(`shared recovery refuses ${name}`, () => assert.throws(() => recover(value)));
}

function ports({ drift = false } = {}) {
  let current = body();
  const writes = [],
    exits = [];
  const deps = {
    findTimingComment: async () => ({ id: 'IC_fixture_2017', body: current }),
    updateTimingComment: async (id, repo, next) => {
      writes.push({ id, repo, next });
      current = drift ? next + 'readback drift' : next;
    },
  };
  return {
    writes,
    exits,
    deps,
    cli: {
      out: { write() {} },
      err: { write() {} },
      exit: (code) => exits.push(code),
      loadConfig: async () => ({ repo: 'fixture/repository' }),
      getProjectDir: () => '.',
      withLock: async (_file, fn) => fn(),
      confirmBlastRadius: async () => ({ proceed: true }),
      runHealDeparture: (args) => runHealDeparture({ ...args, deps }),
    },
  };
}
for (const apply of [false, true]) {
  test(`shared recovery audited ${apply ? 'apply' : 'dry-run'} preserves the exact proposed body`, async () => {
    const p = ports();
    const result = await runHealDeparture({
      issueNumber: 7,
      repo: 'fixture/repository',
      rowIndex: 2,
      recoverRedundantSameSecondReengagement: true,
      apply,
      deps: p.deps,
    });
    assert.equal(result.status, apply ? 'recovered' : 'dry-run');
    assert.equal(result.recoveredRows, 1);
    assert.equal(p.writes.length, apply ? 1 : 0);
    if (apply) assert.equal(p.writes[0].next, body().replace(rows[1] + '\n', ''));
  });
  test(`existing foreign-worktree routing flag permits ordinary ${apply ? 'apply' : 'dry-run'} without changing predicates`, async () => {
    const p = ports();
    const args = [
      '7',
      '--recover-redundant-same-second-reengagement',
      '--row-index',
      '2',
      '--allow-foreign-worktree',
      ...(apply ? ['--apply', '--yes'] : ['--check-only']),
    ];
    await main(args, p.cli);
    assert.deepEqual(p.exits, []);
    assert.equal(p.writes.length, apply ? 1 : 0);
    const unknown = ports();
    await main([...args, '--invented-override'], unknown.cli);
    assert.deepEqual(unknown.exits, [2]);
    assert.equal(unknown.writes.length, 0);
  });
}
test('shared apply refuses exact readback drift after retaining its single write', async () => {
  const p = ports({ drift: true });
  await assert.rejects(
    runHealDeparture({
      issueNumber: 7,
      repo: 'fixture/repository',
      rowIndex: 2,
      recoverRedundantSameSecondReengagement: true,
      apply: true,
      deps: p.deps,
    }),
    /read-back/
  );
  assert.equal(p.writes.length, 1);
});
