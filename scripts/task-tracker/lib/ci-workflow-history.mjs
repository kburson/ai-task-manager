// CI checkout-history audit (#949).
//
// #868 AC6 proves the 660-file test-tree reorg was a real `git mv` by walking
// `git log --follow`. That walk needs commits. `actions/checkout` defaults to a
// depth-1 shallow clone, in which `--follow` can only ever return one commit —
// so the assertion failed unconditionally and trunk's Fast lane was red from
// `d97151b` onward.
//
// The runtime half of the fix (lib/git-provenance.mjs) makes an unanswerable
// workspace report `skip` rather than a false failure. That is a safety net,
// not the cure: if the workflow silently reverts to a shallow clone, the
// provenance check starts skipping and nobody notices it stopped checking. This
// module is what keeps that from happening — it reads the checked-in workflow
// and reports every way the config could re-shallow the history.
//
// Parsing is line-based rather than via a YAML dependency: the audit is about a
// handful of literal keys, and the repo carries no YAML parser in its runtime
// deps. The shapes it must understand are narrow and stable:
//
//   - uses: actions/checkout@v5
//     with:
//       fetch-depth: 0
//   - run: git fetch --no-tags --depth=1 origin trunk:trunk
//
// Both findings are returned rather than thrown, so a caller can report every
// offending line at once instead of one per run.

/**
 * A step's block runs from its own line until the next line that starts a list
 * item at the same or lesser indentation — enough to scope a `with:` to the
 * step that owns it.
 */
function stepBlock(lines, startIndex) {
  const indent = lines[startIndex].search(/\S/);
  const block = [lines[startIndex]];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const col = line.search(/\S/);
    if (col <= indent && /^\s*-\s/.test(line)) break;
    if (col < indent) break;
    block.push(line);
  }
  return block;
}

/**
 * Audit a GitHub Actions workflow for shallow-history hazards.
 *
 * @param {string} yaml  raw workflow text
 * @returns {{
 *   checkoutCount: number,
 *   shallowCheckouts: Array<{line: number, text: string}>,
 *   shallowFetches: Array<{line: number, text: string}>,
 * }}
 *   `shallowCheckouts` — `actions/checkout` steps that do not declare
 *   `fetch-depth: 0`. `shallowFetches` — `git fetch` commands that force a
 *   `--depth`, which would re-graft a shallow history over a full one.
 *   `checkoutCount` lets a caller reject a vacuous pass on a workflow that
 *   checks nothing out.
 */
export function auditCheckoutHistory(yaml) {
  const lines = String(yaml).split('\n');

  const shallowCheckouts = [];
  let checkoutCount = 0;
  lines.forEach((line, i) => {
    if (!/^\s*-\s+uses:\s*actions\/checkout@/.test(line)) return;
    checkoutCount += 1;
    const block = stepBlock(lines, i).join('\n');
    if (!/^\s*fetch-depth:\s*0\s*$/m.test(block)) {
      shallowCheckouts.push({ line: i + 1, text: line.trim() });
    }
  });

  const shallowFetches = lines
    .map((text, i) => ({ line: i + 1, text: text.trim() }))
    .filter(({ text }) => /git\s+fetch\b/.test(text) && /--depth\b/.test(text));

  return { checkoutCount, shallowCheckouts, shallowFetches };
}
