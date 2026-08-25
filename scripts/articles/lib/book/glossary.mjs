// The glossary is markdown, not a data file, because the definitions are prose
// the author edits by hand. As markdown they get prettier, markdownlint, and
// cspell coverage that a YAML block scalar would not.

const TERM_RE = /^## (.+)$/;
const ALIASES_RE = /^_Aliases:_\s*(.+)$/;
const SEE_ALSO_RE = /^_See also:_\s*(.+)$/;

const splitList = (text) =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * @param {string} source contents of `docs/articles/assets/book/glossary.md`
 * @returns {Array<{term: string, aliases: string[], seeAlso: string[], definition: string}>}
 */
export function parseGlossary(source) {
  const terms = [];
  let current = null;
  const definition = [];

  const flush = () => {
    if (current === null) return;
    current.definition = definition.join(' ').replace(/\s+/g, ' ').trim();
    terms.push(current);
    definition.length = 0;
  };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const heading = line.match(TERM_RE);
    if (heading) {
      flush();
      current = { term: heading[1].trim(), aliases: [], seeAlso: [], definition: '' };
      continue;
    }
    if (current === null) continue;
    const aliases = line.match(ALIASES_RE);
    if (aliases) {
      current.aliases = splitList(aliases[1]);
      continue;
    }
    const seeAlso = line.match(SEE_ALSO_RE);
    if (seeAlso) {
      current.seeAlso = splitList(seeAlso[1]);
      continue;
    }
    if (line !== '') definition.push(line);
  }
  flush();
  return terms;
}

/** @param {Array<{term: string, seeAlso: string[], definition: string}>} terms */
export function renderGlossary(terms) {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const sorted = [...terms].sort((a, b) => collator.compare(a.term, b.term));
  const lines = [];
  for (const term of sorted) {
    lines.push(`**${term.term}**`, '');
    lines.push(term.definition, '');
    if (term.seeAlso.length > 0) {
      lines.push(`_See also: ${term.seeAlso.join(', ')}._`, '');
    }
  }
  return lines;
}
