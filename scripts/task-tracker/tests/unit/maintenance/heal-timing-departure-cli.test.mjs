// @story #1187
// The heal-timing-departure CLI must be able to express an operator-supplied
// departure timestamp: --at parses, survives strict-argv, is documented in the
// usage text, and reaches repairMissingDeparture as `ts`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { main, parseArgs, printUsage, runHealDeparture } from '../../../heal-timing-departure.mjs';
import { emitSelfDoc } from '../../../../lib/self-doc.mjs';

const fixture = readFileSync(
  new URL('../../fixtures/timing-departure-gap-1099.txt', import.meta.url),
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
}

// The usage text advertises --at.
{
  let text = '';
  printUsage({ write: (chunk) => (text += chunk) });
  assert.match(text, /--at TIMESTAMP/, 'usage lists --at');
  assert.match(text, /strictly between/i, 'usage states the interval rule');
}

// The self-doc entry advertises --at too.
{
  let doc = '';
  emitSelfDoc('heal-timing-departure', (chunk) => (doc += chunk));
  assert.match(doc, /--at TIMESTAMP/, 'self-doc usage lists --at');
  assert.match(doc, /never clamped/i, 'self-doc records the fail-loud effect');
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

console.log('heal-timing-departure-cli.test.mjs: all passed');
