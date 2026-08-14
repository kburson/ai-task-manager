// @story #721
// @story #804
import assert from 'node:assert/strict';

import {
  parseVcRefIndexes,
  resolveVcRefCommands,
  resolveCitedOrLiteralCommands,
  resolveVcListStrict,
} from '../../../../task-tracker/lib/vc-ref.mjs';

const VC_ITEMS = [
  { command: 'npm test', label: '`npm test`', checked: false, lineIndex: 2 },
  { command: 'npm run lint', label: '`npm run lint`', checked: false, lineIndex: 3 },
];

// --- parseVcRefIndexes: recognizes single and multi citations ---------------
{
  assert.deepEqual(parseVcRefIndexes('vc:1'), [1], 'single citation parses');
  assert.deepEqual(parseVcRefIndexes('vc:1 vc:2'), [1, 2], 'multi citation parses in order');
  assert.deepEqual(parseVcRefIndexes('VC:1'), [1], 'citation token is case-insensitive');
}

// --- parseVcRefIndexes: not-a-citation returns null (fallback signal) -------
{
  assert.equal(
    parseVcRefIndexes('`npm test`'),
    null,
    'embedded backtick command is not a citation'
  );
  assert.equal(parseVcRefIndexes('vc:1 `npm test`'), null, 'mixed tokens are not a pure citation');
  assert.equal(parseVcRefIndexes(''), null, 'empty cmd is not a citation');
  assert.equal(parseVcRefIndexes(null), null, 'null cmd is not a citation');
}

// --- resolveVcRefCommands: resolves citation to literal VC commands ---------
{
  assert.deepEqual(
    resolveVcRefCommands('vc:1', VC_ITEMS),
    ['npm test'],
    'single citation resolves'
  );
  assert.deepEqual(
    resolveVcRefCommands('vc:1 vc:2', VC_ITEMS),
    ['npm test', 'npm run lint'],
    'multi citation resolves in cited order'
  );
  assert.equal(resolveVcRefCommands('`npm test`', VC_ITEMS), null, 'legacy form is not a citation');
}

// --- resolveVcRefCommands: throws on a citation naming a missing VC entry ---
{
  assert.throws(
    () => resolveVcRefCommands('vc:99', VC_ITEMS),
    RangeError,
    'citation to a nonexistent VC position throws'
  );
}

// --- resolveCitedOrLiteralCommands: #804 ordinal citation fallback RETIRED --
{
  // AC2 — the ordinal `cmd="vc:N"` citation fallback is gone. A value that is a
  // pure `vc:N` run carries no backtick literals, so it now yields NO commands.
  assert.deepEqual(
    resolveCitedOrLiteralCommands('vc:2', VC_ITEMS),
    [],
    'ordinal cmd citation no longer resolves (fallback retired)'
  );
  // AC4 — the DoD-Functional backtick-embedded literal declaration is untouched.
  assert.deepEqual(
    resolveCitedOrLiteralCommands('`npm test` `npm run lint`', VC_ITEMS),
    ['npm test', 'npm run lint'],
    'legacy embedded-command form still extracts unchanged'
  );
  assert.deepEqual(
    resolveCitedOrLiteralCommands('', VC_ITEMS),
    [],
    'empty cmd resolves to no commands'
  );
}

// --- resolveVcListStrict: #804 no silent false green ------------------------
{
  // AC3 — a resolvable vc-list returns the cited commands, same as the loose form.
  assert.deepEqual(
    resolveVcListStrict('vc:1', VC_ITEMS),
    ['npm test'],
    'a resolvable vc-list returns its cited commands'
  );
  assert.deepEqual(
    resolveVcListStrict('vc:1 vc:2', VC_ITEMS),
    ['npm test', 'npm run lint'],
    'a multi vc-list resolves in cited order'
  );
  // AC3 — the whole point: empty / missing / non-citation THROWS, never []..
  assert.throws(
    () => resolveVcListStrict('', VC_ITEMS),
    RangeError,
    'empty vc-list throws instead of resolving to a silent []'
  );
  assert.throws(
    () => resolveVcListStrict('   ', VC_ITEMS),
    RangeError,
    'whitespace-only vc-list throws'
  );
  assert.throws(() => resolveVcListStrict(null, VC_ITEMS), RangeError, 'missing vc-list throws');
  assert.throws(
    () => resolveVcListStrict('`npm test`', VC_ITEMS),
    RangeError,
    'a non-citation vc-list value throws (not a silent [])'
  );
  // AC3 — a dangling citation still throws (the pre-existing contract).
  assert.throws(
    () => resolveVcListStrict('vc:99', VC_ITEMS),
    RangeError,
    'a dangling vc-list citation throws'
  );
}

console.log('vc-ref-parsing.test.mjs: all assertions passed');
