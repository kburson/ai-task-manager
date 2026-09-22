// @story #1671

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createPositionIndex, decodeGuidanceSource } from '../../../../../guidance/positions.mjs';
import { parseGuidanceSource } from '../../../../../guidance/parse.mjs';

test('strict UTF-8 decoding rejects malformed byte sequences before YAML parsing', () => {
  assert.throws(() => decodeGuidanceSource(Uint8Array.of(0x63, 0x3a, 0x20, 0xc3, 0x28)), {
    code: 'guidance-invalid-utf8',
  });
});

test('position index counts UTF-16 code units after emoji and normalizes CRLF and lone CR', () => {
  const raw = 'human: { explanation: "😀", bad: true }\r\nnext: é\rfinal: e\u0301\n';
  const source = decodeGuidanceSource(raw);
  assert.equal(source, raw.replaceAll('\r\n', '\n').replaceAll('\r', '\n'));
  const index = createPositionIndex(source);
  assert.deepEqual(index.positionAt(source.indexOf('bad')), { line: 1, column: 29 });
  assert.deepEqual(index.positionAt(source.indexOf('next')), { line: 2, column: 1 });
  assert.deepEqual(index.positionAt(source.indexOf('final')), { line: 3, column: 1 });
  assert.deepEqual(
    createPositionIndex(decodeGuidanceSource(raw.replaceAll('\r\n', '\n'))).positionAt(
      source.indexOf('bad')
    ),
    { line: 1, column: 29 }
  );
});

test('event parser retains raw nested field ranges independently of decoded scalar values', () => {
  const source = 'entries:\n  - id: action.bind\n    human: { explanation: "😀", bad: true }\n';
  const parsed = parseGuidanceSource(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.value.entries[0].human.explanation, '😀');
  assert.deepEqual(parsed.ranges.get('entries[0].human.bad'), {
    start: source.indexOf('bad:'),
    end: source.indexOf('bad:') + 3,
  });
  assert.deepEqual(createPositionIndex(parsed.source).positionAt(source.indexOf('bad:')), {
    line: 3,
    column: 33,
  });
});

test('event parser rejects duplicate mapping keys before construction loses the first value', () => {
  const parsed = parseGuidanceSource('entries:\n  - id: action.bind\n    id: action.resume\n');
  assert.equal(parsed.value, null);
  assert.deepEqual(
    parsed.diagnostics.map(({ code, path }) => ({ code, path })),
    [{ code: 'duplicate-key', path: 'entries[0].id' }]
  );
});

test('event parser rejects anchors, aliases, tags, and quoted or plain merge keys', () => {
  const cases = [
    ['a: &x value\n', 'yaml-anchor'],
    ['a: *x\n', 'yaml-alias'],
    ['a: !!str value\n', 'yaml-tag'],
    ['<<: {a: 1}\n', 'yaml-merge-key'],
    ['"<<": {a: 1}\n', 'yaml-merge-key'],
  ];
  for (const [source, code] of cases) {
    const parsed = parseGuidanceSource(source);
    assert.equal(parsed.value, null, source);
    assert.ok(
      parsed.diagnostics.some((item) => item.code === code),
      source
    );
  }
});

test('quoted field ranges include raw quotes after a folded block scalar', () => {
  const source =
    'entries:\n  - human:\n      explanation: >-\n        one\n        two\n      "bad": true\n';
  const parsed = parseGuidanceSource(source);
  assert.deepEqual(parsed.diagnostics, []);
  assert.equal(parsed.value.entries[0].human.explanation, 'one two');
  assert.deepEqual(parsed.ranges.get('entries[0].human.bad'), {
    start: source.indexOf('"bad"'),
    end: source.indexOf('"bad"') + '"bad"'.length,
  });
  assert.deepEqual(createPositionIndex(parsed.source).positionAt(source.indexOf('"bad"')), {
    line: 6,
    column: 7,
  });
});
