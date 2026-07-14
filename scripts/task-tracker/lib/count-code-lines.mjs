// @story #816
// Count lines of *code* in a source string, excluding blank / whitespace-only
// lines and comment-only lines. Used by the per-file test line-cap gate
// (audit-line-cap.mjs) so that guiding comments and blank lines never push a
// well-documented test over the cap.
//
// The scan is deliberately line-oriented, NOT a JS lexer: it does not tokenize
// string literals. A line that embeds `//` or `/*` inside a string literal is
// still code and counts regardless (documented non-goal). The only comment
// forms recognized are `//` line comments and `/* … */` block comments,
// including multi-line block regions.
export function countCodeLines(source) {
  const lines = String(source ?? '').split('\n');
  let inBlock = false; // inside an open /* … */ region spanning lines
  let count = 0;

  for (const line of lines) {
    let i = 0;
    let hasCode = false;

    while (i < line.length) {
      if (inBlock) {
        // Consume until the block comment closes; the remainder of the line
        // (if any) is re-scanned as ordinary content.
        const end = line.indexOf('*/', i);
        if (end === -1) {
          i = line.length;
        } else {
          inBlock = false;
          i = end + 2;
        }
        continue;
      }

      const two = line.slice(i, i + 2);
      if (two === '//') break; // rest of the line is a line comment
      if (two === '/*') {
        inBlock = true;
        i += 2;
        continue;
      }

      if (!/\s/.test(line[i])) hasCode = true;
      i += 1;
    }

    if (hasCode) count += 1;
  }

  return count;
}
