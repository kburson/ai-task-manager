// @story #721
import assert from 'node:assert/strict';

import {
  parseVcRefIndexes,
  resolveVcRefCommands,
  resolveCitedOrLiteralCommands,
} from '../../lib/vc-ref.mjs';

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

// --- resolveCitedOrLiteralCommands: citation-first, legacy fallback --------
{
  assert.deepEqual(
    resolveCitedOrLiteralCommands('vc:2', VC_ITEMS),
    ['npm run lint'],
    'citation form resolves via the shared VC list'
  );
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

console.log('vc-ref-parsing.test.mjs: all assertions passed');
