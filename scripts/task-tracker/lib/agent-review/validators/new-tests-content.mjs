// Agent Review Gate — V4 new-tests-content validator (#813).
//
// V2 (`required-comments`) already checks that a comment whose heading is
// `New Automated Tests` EXISTS. V4 is orthogonal: given that comment, it verifies
// the comment actually LISTS real tests — a non-empty, parseable list of test
// files and their test names — so a story cannot pass Review behind an empty or
// placeholder-only report that satisfies V2's presence check without real content.
//
// Comment shape (sole generator: `lib/new-automated-tests-comment.mjs`
// `buildNewAutomatedTestsComment`):
//
//   ## New Automated Tests
//
//   - `path/to/a.test.mjs`      <- top-level FILE bullet (backtick-wrapped path)
//     - test title one          <- indented TEST-NAME bullet
//     - test title two
//   - `path/to/b.test.mjs`
//     - test title three
//
//   _Each bullet is the verbatim title…_   <- italic FOOTER (never content)
//
// Pass iff the located comment lists ≥1 file bullet AND ≥1 nested test-name
// bullet. ABSENCE of the comment defers to V2 → V4 passes (doubling the failure
// here would mis-attribute the demotion reason).
//
// Consumes `context.comments` — the raw `gh issue view --json comments` shape,
// i.e. `[{ body, ... }]`. A missing/non-array value is tolerated as "no comments".

import { registry } from '../registry.mjs';

// Heading signal — mirrors V2's, case-insensitive, h1–h6 tolerant.
const HEADING_RE = /^#{1,6}\s*New Automated Tests\b/im;

// A top-level FILE bullet: no leading indent, `- `, then a backtick-wrapped path.
// The backtick requirement is what distinguishes a real file bullet from a
// placeholder like `- none` / `- N/A`.
const FILE_BULLET_RE = /^-\s+`[^`]+`/;

// A nested TEST-NAME bullet: at least two leading spaces, `- `, then non-space.
const TEST_NAME_BULLET_RE = /^\s{2,}-\s+\S/;

// Locate the single comment body carrying the New Automated Tests heading and
// return the slice from the heading line to the end of that comment. Returns
// null when no comment carries the heading.
function locateReportRegion(bodies) {
  for (const body of bodies) {
    const m = HEADING_RE.exec(body);
    if (m) return body.slice(m.index);
  }
  return null;
}

// Count file bullets and nested test-name bullets in the report region. The
// heading line itself and the italic footer paragraph never match a bullet
// regex, so they are excluded structurally.
function countEntries(region) {
  let files = 0;
  let testNames = 0;
  for (const line of region.split('\n')) {
    if (FILE_BULLET_RE.test(line)) files += 1;
    else if (TEST_NAME_BULLET_RE.test(line)) testNames += 1;
  }
  return { files, testNames };
}

export function validate({ comments } = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const bodies = list.map((c) => (c && typeof c.body === 'string' ? c.body : ''));

  const region = locateReportRegion(bodies);
  // Absence defers to V2 — presence is V2's responsibility, not V4's.
  if (region === null) return { pass: true, failures: [] };

  const { files, testNames } = countEntries(region);
  const failures = [];
  if (files === 0) {
    failures.push('New Automated Tests comment lists no test files');
  } else if (testNames === 0) {
    failures.push('New Automated Tests comment lists files but no test names');
  }

  return { pass: failures.length === 0, failures };
}

export const newTestsContentValidator = {
  id: 'new-tests-content',
  describe: () => 'V4: New Automated Tests comment lists real test files and names',
  validate,
};

registry.register(newTestsContentValidator);

export default newTestsContentValidator;
