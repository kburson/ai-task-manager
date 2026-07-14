// @story #816
// Proves the code-LOC counter that backs the per-file test line-cap gate
// (ADR 0001 §4). The cap measures lines of code, so comments and blank lines
// must not count toward it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countCodeLines } from '../../lib/count-code-lines.mjs';

test('blank and whitespace-only lines are not counted', () => {
  const src = ['const a = 1;', '', '   ', '\t', 'const b = 2;'].join('\n');
  assert.equal(countCodeLines(src), 2);
});

test('line comments (// …) are not counted', () => {
  const src = ['// header comment', 'const a = 1;', '  // indented comment'].join('\n');
  assert.equal(countCodeLines(src), 1);
});

test('single-line full block comments are not counted', () => {
  const src = ['/* a block */', 'const a = 1;', '  /* another */  '].join('\n');
  assert.equal(countCodeLines(src), 1);
});

test('a multi-line block comment excludes every line it spans', () => {
  const src = ['const a = 1;', '/*', ' * multi', ' * line', ' */', 'const b = 2;'].join('\n');
  assert.equal(countCodeLines(src), 2);
});

test('code with a trailing comment counts as one code line', () => {
  const src = ['foo(); // note', 'bar(); /* inline */', 'baz(); /* opens', 'still comment */'].join(
    '\n'
  );
  // line 1: code + //  -> 1
  // line 2: code + single-line block -> 1
  // line 3: code + block that stays open -> 1
  // line 4: only the block close, no code -> 0
  assert.equal(countCodeLines(src), 3);
});

test('code after a block comment closes on the same line counts', () => {
  const src = ['/* lead */ const a = 1;', '/* open', 'body */ const b = 2;'].join('\n');
  assert.equal(countCodeLines(src), 2);
});

test('a string literal containing // is still code (documented non-goal)', () => {
  const src = ['const url = "http://example.com";'].join('\n');
  assert.equal(countCodeLines(src), 1);
});

test('N code lines interleaved with comments and blanks report N', () => {
  const N = 50;
  const lines = [];
  for (let i = 0; i < N; i++) {
    lines.push(`const v${i} = ${i};`);
    lines.push(`// comment for v${i}`);
    lines.push('');
  }
  assert.equal(countCodeLines(lines.join('\n')), N);
});

test('a file over 400 raw lines but under 400 code LOC is within the cap', () => {
  const CODE = 399;
  const lines = [];
  for (let i = 0; i < CODE; i++) {
    lines.push(`stmt${i}();`);
    lines.push(`// doc line ${i}`); // padding that must not count
  }
  const src = lines.join('\n');
  assert.ok(src.split('\n').length > 400, 'fixture should exceed 400 raw lines');
  assert.equal(countCodeLines(src), CODE);
  assert.ok(countCodeLines(src) <= 400, 'code LOC must be within the 400 cap');
});
