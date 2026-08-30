// @story #1187
// The heal-timing-departure CLI must be able to express an operator-supplied
// departure timestamp: --at parses, survives strict-argv, is documented in the
// usage text, and reaches repairMissingDeparture as `ts`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  main,
  parseArgs,
  printUsage,
  runHealDeparture,
} from '../../../../task-tracker/heal-timing-departure.mjs';
import { emitSelfDoc } from '../../../../lib/self-doc.mjs';

const fixture = readFileSync(
  new URL('../../../fixtures/timing-departure-gap-1099.txt', import.meta.url),
  'utf8'
);

// --at parses into `ts` and leaves the other options alone.
{
  const args = parseArgs([
    '1099',
    '--at',
    '2026-08-04 21:33:00 -05:00',
    '--event',
    'pause:question',
  ]);
  assert.equal(args.issue, '1099');
  assert.equal(args.ts, '2026-08-04 21:33:00 -05:00');
  assert.equal(args.event, 'pause:question');
  assert.equal(parseArgs(['1099']).ts, undefined, '--at is optional');
  assert.equal(
    parseArgs(['1296', '--recover-redundant-same-second-pair', '--row-index', '2'])
      .recoverRedundantSameSecondPair,
    true,
    'the exact recovery mode parses explicitly'
  );
  assert.equal(
    parseArgs(['1099']).recoverRedundantSameSecondPair,
    false,
    'same-second recovery is opt-in'
  );
}

// The usage text advertises --at.
{
  let text = '';
  printUsage({ write: (chunk) => (text += chunk) });
  assert.match(text, /--at TIMESTAMP/, 'usage lists --at');
  assert.match(text, /strictly between/i, 'usage states the interval rule');
  assert.match(text, /--recover-redundant-same-second-pair/, 'usage lists exact recovery mode');
}

// The self-doc entry advertises --at too.
{
  let doc = '';
  emitSelfDoc('heal-timing-departure', (chunk) => (doc += chunk));
  assert.match(doc, /--at TIMESTAMP/, 'self-doc usage lists --at');
  assert.match(doc, /never clamped/i, 'self-doc records the fail-loud effect');
  assert.match(doc, /--recover-redundant-same-second-pair/, 'self-doc lists exact recovery mode');
}

function harness(body) {
  const out = [];
  const err = [];
  const exits = [];
  const updates = [];
  return {
    updates,
    stdout: () => out.join(''),
    stderr: () => err.join(''),
    exits,
    deps: {
      out: { write: (chunk) => out.push(chunk) },
      err: { write: (chunk) => err.push(chunk) },
      exit: (code) => exits.push(code),
      loadConfig: async () => ({ repo: 'kburson/ai-task-manager' }),
      getProjectDir: () => '.',
      withLock: async (_path, fn) => fn(),
      confirmBlastRadius: async () => ({ proceed: true }),
      runHealDeparture: (options) =>
        runHealDeparture({
          ...options,
          deps: {
            findTimingComment: async () => ({ id: 'IC_1099', body }),
            updateTimingComment: async (id, repo, nextBody) =>
              updates.push({ id, repo, body: nextBody }),
          },
        }),
    },
  };
}

// --at reaches the repair and is written at exactly that timestamp.
{
  const h = harness(fixture);
  await main(
    ['1099', '--apply', '--yes', '--event', 'pause:question', '--at', '2026-08-04 21:33:00 -05:00'],
    h.deps
  );
  assert.deepEqual(h.exits, [], 'a well-formed --at run does not exit early');
  assert.equal(h.updates.length, 1, 'apply writes exactly once');
  assert.match(
    h.updates[0].body,
    /\| 2026-08-04 21:33:00 -05:00 \| pause:question \|/,
    'the operator-supplied timestamp is what lands in the Timing Log'
  );
  assert.match(h.stdout(), /healed/);
}

// --at survives assertKnownArgv: an unknown option would exit 2 before any work.
{
  const h = harness(fixture);
  await main(['1099', '--not-a-flag', 'x'], h.deps);
  assert.deepEqual(h.exits, [2], 'a genuinely unknown option is still rejected');
  assert.equal(h.updates.length, 0);
}

// An out-of-interval --at fails loudly and writes nothing.
{
  const h = harness(fixture);
  await assert.rejects(
    () =>
      main(
        [
          '1099',
          '--apply',
          '--yes',
          '--event',
          'pause:question',
          '--at',
          '2026-08-04 21:44:00 -05:00',
        ],
        h.deps
      ),
    /must fall strictly between/i,
    'the CLI surfaces the rejection rather than clamping'
  );
  assert.equal(h.updates.length, 0, 'a rejected --at writes nothing');
}

const malformedSameSecondPair = [
  '⏱ Timing Log',
  '',
  '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Word Marker |',
  '|---|---|---|---|---|---|---|---|',
  '| 2026-08-30 11:57:51 -05:00 | plan:completed | 1m 00s |  | 1 | 10 | completed | 20 | <!-- row-sec: a=60 i=0 -->',
  '| 2026-08-30 11:57:50 -05:00 | pause:other |  |  |  | 10 | repaired handoff | 20 | <!-- row-sec: a=0 i=0 -->',
  '| 2026-08-30 11:57:51 -05:00 | resumed |  |  | 0 | 10 | resumed | 20 | <!-- row-sec: a=0 i=0 -->',
  '',
].join('\n');

// Recovery uses the existing lock/apply path and remains dry-run-first.
{
  const h = harness(malformedSameSecondPair);
  await main(['1296', '--recover-redundant-same-second-pair', '--row-index', '2'], h.deps);
  assert.deepEqual(h.exits, []);
  assert.equal(h.updates.length, 0, 'recovery check-only does not write');
  assert.match(h.stdout(), /dry-run/);
}

{
  const h = harness(malformedSameSecondPair);
  await main(
    ['1296', '--apply', '--yes', '--recover-redundant-same-second-pair', '--row-index', '2'],
    h.deps
  );
  assert.deepEqual(h.exits, []);
  assert.equal(h.updates.length, 1, 'recovery apply writes once');
  assert.doesNotMatch(h.updates[0].body, /repaired handoff|\| resumed \|/);
  assert.match(h.stdout(), /recovered/);
}

{
  const h = harness(malformedSameSecondPair);
  await main(
    [
      '1296',
      '--recover-redundant-same-second-pair',
      '--row-index',
      '2',
      '--at',
      '2026-08-30 11:57:49 -05:00',
    ],
    h.deps
  );
  assert.deepEqual(h.exits, [2], 'recovery refuses insertion-only options');
  assert.equal(h.updates.length, 0);
}

{
  const h = harness(malformedSameSecondPair);
  await main(
    ['1296', '--recover-redundant-same-second-pair', '--row-index', '2', '--event', 'pause:other'],
    h.deps
  );
  assert.deepEqual(
    h.exits,
    [2],
    'recovery refuses an explicitly supplied insertion option even when its value is the default'
  );
  assert.equal(h.updates.length, 0);
}

console.log('heal-timing-departure-cli.test.mjs: all passed');
