// #299 Item 2 — `/task discover` and `/task plan` must be distinct in the
// help text. Discover is backlog-item generation / pre-issue ideation; plan
// is the Sprint-Planning entry (refine→plan). Neither description may
// describe the other's workflow.

import assert from 'node:assert/strict';
import { verbHelp } from '../verbs/help.mjs';

const lines = [];
const origLog = console.log;
console.log = (msg) => lines.push(String(msg ?? ''));
try {
  verbHelp();
} finally {
  console.log = origLog;
}
const help = lines.join('\n');

// 1. `/task discover` is present and described as backlog-item generation.
assert.match(help, /\/task discover/);
assert.match(
  help,
  /discover[^\n]*(backlog item generation|pre-issue ideation|pre-backlog ideation)/i,
  'discover description must mention backlog-item generation / pre-issue ideation'
);

// 2. `/task plan #N` is present and described as Sprint-Planning entry.
assert.match(help, /\/task plan #N/);
assert.match(help, /plan[^\n]*Sprint-Planning/i, 'plan description must mention Sprint-Planning');
assert.match(help, /Refine→Plan/, 'plan description must show the refine→plan transition');

// 3. The two must be cross-referenced so an operator does not pick the wrong verb.
//    Discover description must mention `/task plan` (or Sprint-Planning) and the
//    plan description must mention `/task discover` (or backlog item generation).
const discoverBlock = help.match(
  /\/task discover[\s\S]*?(?=\n\s{0,2}\/task|\nState transitions|$)/
);
const planBlock = help.match(/\/task plan #N[\s\S]*?(?=\n\s{0,2}\/task|$)/);
assert.ok(discoverBlock, 'discover help block must be locatable');
assert.ok(planBlock, 'plan help block must be locatable');
assert.match(
  discoverBlock[0],
  /\/task plan|Sprint-Planning/,
  'discover block must cross-reference /task plan / Sprint-Planning'
);
assert.match(
  planBlock[0],
  /\/task discover|backlog item generation/i,
  'plan block must cross-reference /task discover / backlog item generation'
);

// 4. There is no surviving "DEPRECATED" mention of plan-as-discover-alias.
assert.doesNotMatch(
  help,
  /DEPRECATED.*plan|plan.*is now.*discover/i,
  'the old plan→discover deprecation alias text must be gone'
);

console.log(
  'PASS: help text distinguishes /task discover (backlog gen) from /task plan (Sprint-Planning)'
);
