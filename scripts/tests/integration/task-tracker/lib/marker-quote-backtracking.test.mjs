// @story #2029 #2006
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseMarker, serializeMarker } from '../../../../task-tracker/lib/marker-grammar.mjs';
import { readDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';

const grammar = new URL('../../../../task-tracker/lib/marker-grammar.mjs', import.meta.url).href;
const records = new URL('../../../../task-tracker/lib/decomposition-records.mjs', import.meta.url)
  .href;
const bodyFor = (marker) => '## Decomposition Assessment\n\n## AITM Progress Markers\n\n' + marker;
const entities = '&quot;'.repeat(80);

for (const api of ['parseMarker', 'readDecompositionRecords']) {
  test(`${api} promptly rejects an unterminated quoted entity sequence`, () => {
    const input =
      api === 'parseMarker'
        ? `<!-- aitm-probe -="${entities} -->`
        : bodyFor(`<!-- aitm-decomposition-assessment schema="1" -="${entities} -->`);
    const statement =
      api === 'parseMarker'
        ? 'assert.equal(parseMarker(input), null);'
        : 'assert.throws(() => readDecompositionRecords(input), /malformed-marker/);';
    const script = `import assert from "node:assert/strict";
import { ${api} } from ${JSON.stringify(api === 'parseMarker' ? grammar : records)};
const input = ${JSON.stringify(input)};
${statement}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      timeout: 2000,
    });
    assert.equal(
      result.error,
      undefined,
      `${api} must finish before the child timeout: ${result.error?.code}`
    );
    assert.equal(result.status, 0, result.stderr);
  });
}

test('quoted entity values preserve literal parsing and serialization', () => {
  const marker = `<!-- aitm-probe note="&quot;a&quot; &amp;" empty="" -->`;
  assert.deepEqual(parseMarker(marker), {
    name: 'probe',
    props: { note: `"a" &amp;`, empty: '' },
  });
  assert.equal(serializeMarker('probe', { note: `"a" &amp;`, empty: '' }), marker);
});

test('decomposition raw attribute scan still rejects duplicate keys', () => {
  assert.throws(
    () =>
      readDecompositionRecords(
        bodyFor(`<!-- aitm-decomposition-assessment schema="1" schema="1" payload="e30" -->`)
      ),
    /duplicate-attributes/
  );
});
