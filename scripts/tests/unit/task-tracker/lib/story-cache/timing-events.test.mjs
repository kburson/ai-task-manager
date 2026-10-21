// @story #2044
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeTimingEvents } from '../../../../../task-tracker/lib/story-cache/timing-events.mjs';
const make = (eventId = 'evt-1', overrides = {}) => ({
  eventId,
  actorId: 'author-A',
  transitionId: null,
  timestamp: '2026-10-19T12:00:00.000Z',
  event: 'paused',
  activeSeconds: null,
  idleSeconds: null,
  sourceCursor: `native-${eventId}`,
  ...overrides,
});
const invalid = (fn) => assert.throws(fn, { code: 'STORY_TIMING_EVENT_INVALID' });
const conflict = (fn) => assert.throws(fn, { code: 'STORY_TIMING_EVENT_CONFLICT' });
test('exact technical-plan seed deduplicates without coercing Unknown to zero', () => {
  const event = {
    eventId: 'evt-1',
    actorId: 'author-A',
    transitionId: null,
    timestamp: '2026-10-19T12:00:00.000Z',
    event: 'paused',
    activeSeconds: null,
    idleSeconds: null,
    sourceCursor: 'native-1',
  };
  const merged = mergeTimingEvents([], [event, structuredClone(event)]);
  assert.deepEqual(merged, [event]);
  assert.equal(merged[0].activeSeconds, null);
  conflict(() => mergeTimingEvents([event], [{ ...event, activeSeconds: 0 }]));
});
test('empty explicit inputs are a valid empty event set', () =>
  assert.deepEqual(mergeTimingEvents([], []), []));
test('identical replay within either input and after JSON restart is a no-op', () => {
  const event = make();
  const first = mergeTimingEvents([event, event], [event]);
  assert.deepEqual(
    mergeTimingEvents(JSON.parse(JSON.stringify(first)), [structuredClone(event)]),
    first
  );
});
for (const [field, value] of [
  ['actorId', 'author-B'],
  ['transitionId', 'move-1'],
  ['timestamp', '2026-10-19T12:00:01.000Z'],
  ['event', 'resumed'],
  ['activeSeconds', 0],
  ['idleSeconds', 0],
  ['sourceCursor', 'native-other'],
])
  test(`same event ID with different ${field} conflicts`, () =>
    conflict(() => mergeTimingEvents([make()], [make('evt-1', { [field]: value })])));
test('same actor native cursor under a new event ID conflicts even with identical remaining fields', () =>
  conflict(() => mergeTimingEvents([make()], [make('evt-2', { sourceCursor: 'native-evt-1' })])));
test('independent actors may retain equal opaque cursor strings', () => {
  const result = mergeTimingEvents(
    [make()],
    [make('evt-2', { actorId: 'author-B', sourceCursor: 'native-evt-1' })]
  );
  assert.equal(result.length, 2);
});
test('opaque actor and cursor coordinates cannot collide through string concatenation', () => {
  assert.equal(
    mergeTimingEvents(
      [make('evt-1', { actorId: 'a:b', sourceCursor: 'c' })],
      [make('evt-2', { actorId: 'a', sourceCursor: 'b:c' })]
    ).length,
    2
  );
});
test('backdated events retain their supplied identity and sort by native time', () => {
  const late = make('late', { timestamp: '2026-10-19T12:05:00.000Z' });
  const early = make('early');
  assert.deepEqual(
    mergeTimingEvents([late], [early]).map((e) => e.eventId),
    ['early', 'late']
  );
  assert.equal(mergeTimingEvents([late], [early])[0].timestamp, early.timestamp);
});
test('equal-time ordering is deterministic code-unit ID order, not cursor order', () => {
  const a = make('a', { sourceCursor: 'native-2' });
  const z = make('Z', { sourceCursor: 'native-10' });
  assert.deepEqual(
    mergeTimingEvents([a], [z]).map((e) => e.eventId),
    ['Z', 'a']
  );
  assert.deepEqual(mergeTimingEvents([z], [a]), mergeTimingEvents([a], [z]));
});
test('timestamp representation is preserved and different same-ID representations conflict', () => {
  const event = make('evt-1', { timestamp: '2026-10-19T12:00:00Z' });
  assert.equal(mergeTimingEvents([], [event])[0].timestamp, event.timestamp);
  conflict(() => mergeTimingEvents([event], [make()]));
});
test('adjacent measured active/idle interval deltas remain unchanged', () => {
  const first = make('first', {
    timestamp: '2026-10-19T12:05:00.000Z',
    activeSeconds: 300,
    idleSeconds: 0,
  });
  const second = make('second', {
    timestamp: '2026-10-19T12:10:00.000Z',
    activeSeconds: 200,
    idleSeconds: 100,
  });
  assert.deepEqual(mergeTimingEvents([first], [second]), [first, second]);
});
for (const field of ['activeSeconds', 'idleSeconds'])
  test(`repeated cumulative ${field} snapshot refuses after restart`, () => {
    const other = field === 'activeSeconds' ? 'idleSeconds' : 'activeSeconds';
    const first = make('first', {
      timestamp: '2026-10-19T12:05:00.000Z',
      [field]: 300,
      [other]: 0,
    });
    const second = make('second', {
      timestamp: '2026-10-19T12:10:00.000Z',
      [field]: 600,
      [other]: 0,
    });
    conflict(() => mergeTimingEvents(JSON.parse(JSON.stringify([first])), [second]));
  });
test('nested or backdated overlapping measured intervals conflict', () => {
  const long = make('long', {
    timestamp: '2026-10-19T12:10:00.000Z',
    activeSeconds: 600,
    idleSeconds: 0,
  });
  const nested = make('nested', {
    timestamp: '2026-10-19T12:03:00.000Z',
    activeSeconds: 60,
    idleSeconds: 0,
  });
  conflict(() => mergeTimingEvents([long], [nested]));
  conflict(() => mergeTimingEvents([nested], [long]));
});
test('two actors may perform measured work in overlapping wall-clock intervals', () => {
  const first = make('first', { activeSeconds: 300, idleSeconds: 0 });
  const second = make('second', { actorId: 'author-B', activeSeconds: 300, idleSeconds: 0 });
  assert.equal(mergeTimingEvents([first], [second]).length, 2);
});
test('zero-duration observations may share a closing interval timestamp in either ID order', () => {
  const measured = make('z', { activeSeconds: 300, idleSeconds: 0 });
  const zero = make('a', { activeSeconds: 0, idleSeconds: 0 });
  assert.equal(mergeTimingEvents([measured], [zero]).length, 2);
  assert.equal(mergeTimingEvents([zero], [measured]).length, 2);
});
test('mixed Unknown and measured components retain both values without guessing a total', () => {
  const event = make('mixed', { activeSeconds: null, idleSeconds: 30 });
  assert.deepEqual(mergeTimingEvents([], [event]), [event]);
});
test('known minimum bounds still refuse definite overlap while Unknown remains null', () => {
  const first = make('first', {
    timestamp: '2026-10-19T12:05:00.000Z',
    activeSeconds: 300,
    idleSeconds: 0,
  });
  const unknown = make('unknown', {
    timestamp: '2026-10-19T12:06:00.000Z',
    activeSeconds: null,
    idleSeconds: 120,
  });
  conflict(() => mergeTimingEvents([first], [unknown]));
});
test('fractional measured seconds are preserved rather than rounded away', () => {
  const first = make('first', {
    timestamp: '2026-10-19T12:00:00.100Z',
    activeSeconds: 0.1,
    idleSeconds: 0,
  });
  const second = make('second', {
    timestamp: '2026-10-19T12:00:00.250Z',
    activeSeconds: 0.125,
    idleSeconds: 0.025,
  });
  assert.deepEqual(mergeTimingEvents([first], [second]), [first, second]);
});
test('historical actor and event strings are data, not new emission authority', () => {
  const legacy = make('old', { actorId: 'historic-actor', event: 'legacy custom audit' });
  assert.deepEqual(mergeTimingEvents([legacy], []), [legacy]);
});
test('input arrays/events remain untouched and outputs are detached frozen records', () => {
  const event = Object.freeze(make());
  const input = Object.freeze([event]);
  const merged = mergeTimingEvents(input, []);
  assert.notEqual(merged, input);
  assert.notEqual(merged[0], event);
  assert.ok(Object.isFrozen(merged));
  assert.ok(Object.isFrozen(merged[0]));
  assert.deepEqual(merged, input);
});
for (const [name, edit] of [
  [
    'missing field',
    (e) => {
      delete e.activeSeconds;
    },
  ],
  [
    'extra cumulative field',
    (e) => {
      e.totalActiveSeconds = 100;
    },
  ],
  [
    'empty event ID',
    (e) => {
      e.eventId = '';
    },
  ],
  [
    'invalid actor ID',
    (e) => {
      e.actorId = 'actor other';
    },
  ],
  [
    'invalid transition ID',
    (e) => {
      e.transitionId = 0;
    },
  ],
  [
    'missing cursor',
    (e) => {
      delete e.sourceCursor;
    },
  ],
  [
    'structured cursor',
    (e) => {
      e.sourceCursor = { position: 1 };
    },
  ],
  [
    'empty event',
    (e) => {
      e.event = ' ';
    },
  ],
  [
    'impossible timestamp',
    (e) => {
      e.timestamp = '2026-02-30T12:00:00.000Z';
    },
  ],
  [
    'missing timezone',
    (e) => {
      e.timestamp = '2026-10-19T12:00:00';
    },
  ],
  [
    'text duration',
    (e) => {
      e.activeSeconds = '10';
    },
  ],
  [
    'negative duration',
    (e) => {
      e.activeSeconds = -1;
    },
  ],
  [
    'infinite duration',
    (e) => {
      e.activeSeconds = Infinity;
    },
  ],
  [
    'negative zero duration',
    (e) => {
      e.idleSeconds = -0;
    },
  ],
  [
    'unrepresentable interval',
    (e) => {
      e.activeSeconds = 1e308;
    },
  ],
])
  test(`refuses ${name}`, () => {
    const event = make();
    edit(event);
    invalid(() => mergeTimingEvents([], [event]));
  });
test('non-array and sparse collections refuse instead of being treated as empty', () => {
  invalid(() => mergeTimingEvents(undefined, []));
  invalid(() => mergeTimingEvents([], {}));
  invalid(() => mergeTimingEvents([], Array(1)));
});
test('accessor fields and unsupported Unicode refuse without invoking a getter', () => {
  let reads = 0;
  const event = make();
  Object.defineProperty(event, 'event', {
    enumerable: true,
    get() {
      reads++;
      return 'paused';
    },
  });
  invalid(() => mergeTimingEvents([], [event]));
  assert.equal(reads, 0);
  invalid(() => mergeTimingEvents([], [make('bad-\uD800')]));
});
test('one thousand supplied local events replay deterministically without any transport', () => {
  const start = Date.parse('2026-10-19T12:00:00.000Z');
  const events = Array.from({ length: 1000 }, (_, i) =>
    make(`event-${i}`, {
      actorId: `actor-${i % 5}`,
      timestamp: new Date(start + i * 1000).toISOString(),
      activeSeconds: 1,
      idleSeconds: 0,
      sourceCursor: `cursor-${i}`,
    })
  );
  const first = mergeTimingEvents([], events);
  assert.equal(first.length, 1000);
  assert.deepEqual(mergeTimingEvents(JSON.parse(JSON.stringify(first)), events), first);
});
