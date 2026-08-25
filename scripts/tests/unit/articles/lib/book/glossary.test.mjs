// @chore
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { parseGlossary, renderGlossary } from '../../../../../articles/lib/book/glossary.mjs';

const SOURCE = `# Glossary

## Evidence gate

_Aliases:_ evidence gates, evidence-gated
_See also:_ Story-governed delivery

A transition check that requires observable proof before work advances.

## Agent fleet

A coordinated set of implementation agents.
`;

test('parseGlossary reads terms, aliases, see-also, and definition', () => {
  const terms = parseGlossary(SOURCE);
  assert.equal(terms.length, 2);
  assert.deepEqual(terms[0], {
    term: 'Evidence gate',
    aliases: ['evidence gates', 'evidence-gated'],
    seeAlso: ['Story-governed delivery'],
    definition: 'A transition check that requires observable proof before work advances.',
  });
  assert.deepEqual(terms[1].aliases, []);
  assert.deepEqual(terms[1].seeAlso, []);
});

test('renderGlossary emits definition-list markdown sorted alphabetically', () => {
  const lines = renderGlossary(parseGlossary(SOURCE));
  assert.equal(lines[0], '**Agent fleet**');
  assert.ok(lines.join('\n').includes('_See also: Story-governed delivery._'));
});

test('the live glossary file parses', async () => {
  const file = path.resolve(
    import.meta.dirname,
    '../../../../../../docs/articles/assets/book/glossary.md'
  );
  const terms = parseGlossary(await readFile(file, 'utf8'));
  assert.ok(terms.length >= 8, `expected the seeded glossary, got ${terms.length} terms`);
  assert.ok(terms.every((t) => t.definition.length > 0));
});
