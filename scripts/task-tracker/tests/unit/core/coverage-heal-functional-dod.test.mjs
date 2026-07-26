#!/usr/bin/env node
// @story #635 — coverage lift for scripts/task-tracker/heal-functional-dod.mjs.
// Exercises the pure transforms (classifyLabel, detectMissingKeys,
// healFunctionalSection incl. its private collectExisting via the healed body)
// and drives the CLI (parseArgs, printUsage, fetchAllIssueNumbers,
// fetchIssueBody, main) fully offline through injected deps (loadConfig,
// fetchAllIssueNumbers, fetchIssueBody, mutateIssueBody, gqlFn, out/err
// streams, exit) so every branch is covered without any network or filesystem
// I/O.
import { strict as assert } from 'node:assert';
import {
  CANONICAL_KEYS,
  classifyLabel,
  detectMissingKeys,
  healFunctionalSection,
  parseArgs,
  printUsage,
  fetchAllIssueNumbers,
  fetchIssueBody,
  main,
} from '../../../heal-functional-dod.mjs';

// ---- fixtures --------------------------------------------------------------
const KEYED = [
  '## Body',
  '',
  '#### Functional',
  '',
  '- [x] All automated tests pass <!-- dod:functional:tests -->',
  '- [ ] Lint and format checks pass <!-- dod:functional:lint -->',
  '- [ ] All changes committed <!-- dod:functional:commits -->',
  '- [ ] Acceptance criteria met <!-- dod:functional:acs -->',
  '- [ ] Issue body checkboxes ticked <!-- dod:functional:checkboxes -->',
  '',
  '#### Lifecycle',
  '',
].join('\n');

// Stale (pre-#303) section: five unkeyed lines, classified by label text. The
// tests line is checked and carries an execution-proof evidence marker that
// healing must preserve.
const STALE = [
  '#### Functional',
  '',
  '- [x] All automated tests pass <!-- aitm-dod-evidence:tests ran=1 -->',
  '- [ ] Lint and format checks pass',
  '- [ ] All changes committed; messages follow convention',
  '- [ ] Acceptance criteria met',
  '- [ ] Issue body checkboxes ticked',
  '',
  '---',
  '',
].join('\n');

const NO_SECTION = '## Body\n\nNo functional section here.\n';

// ---- classifyLabel: every branch --------------------------------------------
assert.equal(classifyLabel('Lint and format checks pass'), 'lint');
assert.equal(classifyLabel('format only'), 'lint');
assert.equal(classifyLabel('All automated tests pass'), 'tests');
assert.equal(classifyLabel('All changes committed'), 'commits');
assert.equal(classifyLabel('Acceptance criteria met'), 'acs');
assert.equal(classifyLabel('criteria satisfied'), 'acs');
assert.equal(classifyLabel('Issue body checkboxes ticked'), 'checkboxes');
assert.equal(classifyLabel('something unrelated'), null);
assert.equal(classifyLabel(null), null);

// ---- detectMissingKeys ------------------------------------------------------
{
  const det = detectMissingKeys(NO_SECTION);
  assert.equal(det.sectionPresent, false);
  assert.equal(det.affected, false);
  assert.deepEqual(det.missingKeys, [...CANONICAL_KEYS]);
}
{
  const det = detectMissingKeys(KEYED);
  assert.equal(det.sectionPresent, true);
  assert.equal(det.affected, false);
  assert.deepEqual(det.missingKeys, []);
  assert.deepEqual(det.presentKeys, [...CANONICAL_KEYS]);
}
{
  const det = detectMissingKeys(STALE);
  assert.equal(det.sectionPresent, true);
  assert.equal(det.affected, true);
  assert.deepEqual(det.missingKeys, [...CANONICAL_KEYS]);
}

// ---- healFunctionalSection --------------------------------------------------
// No section → no-op.
{
  const res = healFunctionalSection(NO_SECTION);
  assert.equal(res.changed, false);
  assert.equal(res.body, NO_SECTION);
}
// Stale → healed: preserves tick state + evidence, injects every key marker.
{
  const res = healFunctionalSection(STALE);
  assert.equal(res.changed, true);
  for (const k of CANONICAL_KEYS) assert.match(res.body, new RegExp(`dod:functional:${k}`));
  // tests line preserved as checked with its evidence marker carried over.
  assert.match(res.body, /- \[x\] All automated tests pass .*aitm-dod-evidence:tests/);
  // an unchecked line stays unchecked.
  assert.match(res.body, /- \[ \] Lint and format checks pass/);
  // now fully keyed → re-heal is a no-op.
  assert.equal(healFunctionalSection(res.body).changed, false);
}
// collectExisting: authoritative key-marker wins over label, first occurrence
// wins on duplicates, and a line classifying to no canonical key is ignored.
{
  const body = [
    '#### Functional',
    '',
    '- [x] wholly unrelated label <!-- dod:functional:commits -->',
    '- [ ] All changes committed <!-- dod:functional:commits -->',
    '- [ ] noise line with no canonical key',
    '',
    '---',
  ].join('\n');
  const res = healFunctionalSection(body);
  // the marker-authoritative first commits line was checked → healed commits ticked.
  assert.match(res.body, /- \[x\] All changes committed; commit messages follow/);
}
assert.equal(healFunctionalSection(null).changed, false);

// ---- parseArgs --------------------------------------------------------------
function sink() {
  const chunks = [];
  return { chunks, write: (s) => chunks.push(String(s)), text: () => chunks.join('') };
}
assert.deepEqual(parseArgs(['--apply']), {
  state: 'open',
  apply: true,
  scope: null,
  yes: false,
});
assert.deepEqual(parseArgs(['--state', 'closed']).state, 'closed');
assert.deepEqual(parseArgs(['--state=all']).state, 'all');
assert.deepEqual(parseArgs(['--scope', '1,#2,x,3']).scope, [1, 2, 3]);
assert.deepEqual(parseArgs(['--scope=4,5']).scope, [4, 5]);
// --help routes through printUsage + exit(0).
{
  const out = sink();
  let code = null;
  parseArgs(['--help'], { out, exit: (c) => (code = c) });
  assert.equal(code, 0);
  assert.match(out.text(), /Usage:/);
}
// -h alias.
{
  let code = null;
  parseArgs(['-h'], { out: sink(), exit: (c) => (code = c) });
  assert.equal(code, 0);
}
// invalid --state routes through err + exit(2).
{
  const err = sink();
  let code = null;
  parseArgs(['--state', 'bogus'], { err, exit: (c) => (code = c) });
  assert.equal(code, 2);
  assert.match(err.text(), /invalid --state bogus/);
}

// ---- printUsage writes to injected stream ----------------------------------
{
  const out = sink();
  printUsage(out);
  assert.match(out.text(), /Usage: heal-functional-dod\.mjs/);
}

// ---- fetchAllIssueNumbers with a fake gql ----------------------------------
function pageResponse(nodes, hasNextPage, endCursor = null) {
  return { repository: { issues: { pageInfo: { hasNextPage, endCursor }, nodes } } };
}
const PID = 'PVT_target';
{
  // page 1 has next, page 2 ends. Covers project filter + state filters.
  const pages = [
    pageResponse(
      [
        { number: 1, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } },
        { number: 2, state: 'CLOSED', projectItems: { nodes: [{ project: { id: PID } }] } },
        { number: 3, state: 'OPEN', projectItems: { nodes: [{ project: { id: 'other' } }] } },
      ],
      true,
      'CUR'
    ),
    pageResponse(
      [{ number: 4, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } }],
      false
    ),
  ];
  let call = 0;
  const gqlFn = async () => pages[call++];
  const open = await fetchAllIssueNumbers({ repo: 'o/r', state: 'open', projectId: PID }, gqlFn);
  assert.deepEqual(open, [1, 4]); // #2 closed filtered, #3 off-project filtered
}
{
  const nodes = [
    { number: 7, state: 'CLOSED', projectItems: { nodes: [{ project: { id: PID } }] } },
    { number: 8, state: 'OPEN', projectItems: { nodes: [{ project: { id: PID } }] } },
  ];
  const gqlFn = async () => pageResponse(nodes, false);
  const closed = await fetchAllIssueNumbers(
    { repo: 'o/r', state: 'closed', projectId: PID },
    gqlFn
  );
  assert.deepEqual(closed, [7]);
  const all = await fetchAllIssueNumbers({ repo: 'o/r', state: 'all', projectId: PID }, gqlFn);
  assert.deepEqual(all, [7, 8]);
}

// ---- fetchIssueBody with a fake gql ----------------------------------------
{
  const gqlFn = async () => ({ repository: { issue: { body: 'hello' } } });
  assert.equal(await fetchIssueBody(5, 'o/r', gqlFn), 'hello');
  const empty = async () => ({ repository: { issue: null } });
  assert.equal(await fetchIssueBody(6, 'o/r', empty), '');
}

// ---- main: repo not configured exits 1 -------------------------------------
{
  const err = sink();
  let code = null;
  await main([], { loadConfig: () => ({}), err, exit: (c) => (code = c) });
  assert.equal(code, 1);
  assert.match(err.text(), /repo not configured/);
}
// ---- main: projectId not configured exits 1 --------------------------------
{
  const err = sink();
  let code = null;
  await main([], { loadConfig: () => ({ repo: 'o/r' }), err, exit: (c) => (code = c) });
  assert.equal(code, 1);
  assert.match(err.text(), /projectId not configured/);
}
// ---- main: --scope bypasses fetchNumbers; apply heals; no-op + error branches
{
  const out = sink();
  const mutateCalls = [];
  await main(['--scope', '10,11,12,13', '--apply'], {
    loadConfig: () => ({ repo: 'o/r', projectId: PID }),
    confirmBlastRadius: async () => ({ proceed: true }),
    fetchIssueBody: async (n) => {
      if (n === 10) return STALE; // affected → apply → healed
      if (n === 11) return KEYED; // not affected → skipped
      if (n === 12) return STALE; // affected → apply → no-op
      throw new Error('boom'); // n===13 → error branch
    },
    mutateIssueBody: async ({ issueNumber }) => {
      mutateCalls.push(issueNumber);
      return { status: issueNumber === 12 ? 'no-op' : 'ok' };
    },
    out,
  });
  assert.deepEqual(mutateCalls, [10, 12]);
  assert.match(out.text(), /mode=APPLY/);
  assert.match(out.text(), /#10\tmissing:/);
  assert.match(out.text(), /#13\tERROR: boom/);
  assert.match(out.text(), /Summary: affected=2 healed=1 errors=1/);
}
// ---- main: dry-run path uses injected fetchNumbers -------------------------
{
  const out = sink();
  let numbersCalled = false;
  await main([], {
    loadConfig: () => ({ repo: 'o/r', projectId: PID }),
    fetchAllIssueNumbers: async () => {
      numbersCalled = true;
      return [20];
    },
    fetchIssueBody: async () => STALE,
    out,
  });
  assert.equal(numbersCalled, true);
  assert.match(out.text(), /mode=dry-run/);
  assert.match(out.text(), /Summary: affected=1 healed=0 errors=0/);
}

console.log('coverage-heal-functional-dod.test.mjs: ok');
