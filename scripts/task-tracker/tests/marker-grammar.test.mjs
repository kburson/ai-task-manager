// Unit tests for the generic marker grammar helper (#373, epic #367).
import assert from 'node:assert/strict';
import {
  serializeMarker,
  parseMarker,
  escapeValue,
  unescapeValue,
} from '../lib/marker-grammar.mjs';

// --- round-trip: value with spaces ------------------------------------------
{
  const props = { 'verified-by': 'npm run test:all' };
  const line = serializeMarker('verified', props);
  assert.deepEqual(parseMarker(line), { name: 'verified', props }, 'spaces round-trip');
}

// --- round-trip: value with backticks ---------------------------------------
{
  const props = { cmd: '`npm test` `npm run lint`' };
  const line = serializeMarker('entered-develop', props);
  assert.deepEqual(parseMarker(line), { name: 'entered-develop', props }, 'backticks round-trip');
}

// --- round-trip: embedded double-quote --------------------------------------
{
  const props = { evidence: 'failed on "weird" input' };
  const line = serializeMarker('verified', props);
  assert.ok(line.includes('&quot;weird&quot;'), 'embedded double-quote escaped as &quot;');
  assert.deepEqual(parseMarker(line), { name: 'verified', props }, 'embedded quote round-trips');
}

// --- round-trip: empty-string value -----------------------------------------
{
  const props = { note: '' };
  const line = serializeMarker('fields', props);
  assert.deepEqual(parseMarker(line), { name: 'fields', props }, 'empty value round-trips');
}

// --- round-trip: multiple properties, order preserved -----------------------
{
  const props = {
    'verified-at': '816e364:2026-06-11T14:25:00Z',
    evidence: 'all 7 ACs ticked',
    sha: '816e364',
    proof: 'none',
  };
  const line = serializeMarker('verified', props);
  const parsed = parseMarker(line);
  assert.deepEqual(parsed, { name: 'verified', props }, 'multi-prop round-trips with name + map');
  assert.deepEqual(Object.keys(parsed.props), Object.keys(props), 'attribute order preserved');
}

// --- prop-less marker round-trips -------------------------------------------
{
  assert.equal(
    serializeMarker('deep-dive-complete'),
    '<!-- aitm-deep-dive-complete -->',
    'no props → bare marker'
  );
  assert.deepEqual(
    parseMarker('<!-- aitm-deep-dive-complete -->'),
    { name: 'deep-dive-complete', props: {} },
    'prop-less marker round-trips to empty props'
  );
}

// --- escape/unescape are inverse --------------------------------------------
{
  const raw = 'a "b" c "d"';
  assert.equal(unescapeValue(escapeValue(raw)), raw, 'escape then unescape is identity');
  assert.equal(escapeValue(raw), 'a &quot;b&quot; c &quot;d&quot;', 'each quote escaped');
}

// --- parseMarker returns null for a non-marker line -------------------------
{
  assert.equal(parseMarker('just some text'), null, 'plain text → null');
  assert.equal(parseMarker(''), null, 'empty string → null');
  assert.equal(parseMarker('- [x] a checkbox line'), null, 'checkbox line → null');
}

// --- parseMarker returns null for a legacy colon-form marker ----------------
{
  assert.equal(
    parseMarker('<!-- aitm-verified-at: 2026-06-11T14:25:00Z evidence:"x" sha=816e364 -->'),
    null,
    'legacy colon-form marker → null (not mis-parsed)'
  );
}

// --- serializeMarker rejects an empty/invalid name --------------------------
{
  assert.throws(() => serializeMarker(''), /non-empty string/, 'empty name throws');
  assert.throws(() => serializeMarker(null), /non-empty string/, 'null name throws');
}

console.log('marker-grammar.test.mjs: all assertions passed');
