// @story #849
// #849 — the gh-edit guard must evaluate each command in a shell chain
// independently. Before this fix the parsers scanned the whole command string:
// `ISSUE_EDIT_RE` matched one command and `BODY_FILE_RE` matched a *different*
// command's flag, so an innocent `gh issue edit --add-label` chained after a
// `gh issue comment --body-file` was refused with a reason that was false of the
// command it named.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitCommandSegments,
  parseGhIssueEdit,
  evaluateGhEdit,
  evaluateGhApiCreate,
  evaluateGhCreate,
} from '../../../../task-tracker/lib/gh-edit-guard.mjs';

const AUDIT = '.tmp/gh/846-close-audit.md';

// --- segmenter ------------------------------------------------------------

test('splitCommandSegments cuts on every unquoted separator', () => {
  for (const sep of [';', '&&', '||', '|', '&', '\n']) {
    const segments = splitCommandSegments(`alpha ${sep} beta`).map((s) => s.trim());
    assert.deepEqual(segments, ['alpha', 'beta'], `separator ${JSON.stringify(sep)}`);
  }
});

test('splitCommandSegments does not cut inside quoted regions', () => {
  assert.deepEqual(
    splitCommandSegments(`gh issue edit 846 --body-file "a;b.md"`).map((s) => s.trim()),
    [`gh issue edit 846 --body-file "a;b.md"`]
  );
  assert.deepEqual(
    splitCommandSegments(`gh issue comment 846 --body 'x && y'`).map((s) => s.trim()),
    [`gh issue comment 846 --body 'x && y'`]
  );
});

test('splitCommandSegments opens a segment at $(', () => {
  const segments = splitCommandSegments('echo $(gh issue edit 846 --add-label x)').map((s) =>
    s.trim()
  );
  assert.equal(segments.length, 2);
  assert.match(segments[1], /^gh issue edit 846/);
});

// --- AC2 / AC6: the reported false positive --------------------------------

test("parseGhIssueEdit does not attribute a neighboring command's --body-file", () => {
  const parsed = parseGhIssueEdit(
    `gh issue comment 846 --body-file ${AUDIT} ; gh issue edit 846 --add-label "invalid"`
  );
  assert.equal(parsed.issueNumber, 846);
  assert.equal(parsed.source, 'none');
});

test('AC2 — comment --body-file chained before an --add-label edit is ALLOWED', () => {
  const command = `gh issue comment 846 --body-file ${AUDIT} ; gh issue edit 846 --add-label "invalid"`;
  assert.equal(evaluateGhEdit({ command }).block, false);
});

test('AC1 — the false positive is gone across every separator', () => {
  for (const sep of [';', '&&', '||', '|', '\n']) {
    const command = `gh issue comment 846 --body-file ${AUDIT} ${sep} gh issue edit 846 --add-label "invalid"`;
    assert.equal(evaluateGhEdit({ command }).block, false, `separator ${JSON.stringify(sep)}`);
  }
});

test('AC1 — order independent: the edit may come first', () => {
  const command = `gh issue edit 846 --add-label "invalid" && gh issue comment 846 --body-file ${AUDIT}`;
  assert.equal(evaluateGhEdit({ command }).block, false);
});

test('AC3 — a lone gh issue comment --body-file is ALLOWED', () => {
  assert.equal(
    evaluateGhEdit({ command: `gh issue comment 846 --body-file ${AUDIT}` }).block,
    false
  );
  assert.equal(evaluateGhEdit({ command: `gh issue comment 846 --body "hello"` }).block, false);
});

// --- AC4 / AC5: true positives survive -------------------------------------

test('AC4 — standalone gh issue edit --body-file / --body still refuse', () => {
  const file = evaluateGhEdit({ command: `gh issue edit 849 --body-file ${AUDIT}` });
  assert.equal(file.block, true);
  assert.match(file.reason, /#849/);
  assert.match(file.reason, /--body-file/);

  const inline = evaluateGhEdit({ command: `gh issue edit 849 --body "rewritten"` });
  assert.equal(inline.block, true);
  assert.match(inline.reason, /--body\b/);
});

test('AC5 — a chained true positive refuses on the edit segment', () => {
  const command = `gh issue comment 846 --body-file ${AUDIT} ; gh issue edit 849 --body-file .tmp/gh/849.md`;
  const res = evaluateGhEdit({ command });
  assert.equal(res.block, true);
  // AC6 — the reason names the issue the OFFENDING segment carries (#849),
  // not the neighboring comment's issue (#846).
  assert.match(res.reason, /#849/);
  assert.doesNotMatch(res.reason, /#846/);
});

test('AC4 — an edit --body chained after an unrelated command still refuses', () => {
  const res = evaluateGhEdit({ command: `git status && gh issue edit 849 --body "x"` });
  assert.equal(res.block, true);
});

// --- AC7: quoting does not defeat segmentation ------------------------------

test('AC7 — a `;` inside the body-file argument is not a separator (still refuses)', () => {
  const res = evaluateGhEdit({ command: `gh issue edit 849 --body-file "a;b.md"` });
  assert.equal(res.block, true);
  assert.match(res.reason, /#849/);
});

test('AC7 — a `&&` inside a comment body does not split the chain', () => {
  const command = `gh issue comment 846 --body "a && b" ; gh issue edit 846 --add-label x`;
  assert.equal(evaluateGhEdit({ command }).block, false);
});

// --- sibling parsers: same defect shape -------------------------------------

test('evaluateGhApiCreate does not fire on a chained unrelated gh api call', () => {
  const command = `gh issue comment 846 --body-file ${AUDIT} ; gh api repos/o/r/issues/846`;
  assert.equal(evaluateGhApiCreate({ command }).block, false);
});

test('evaluateGhApiCreate still fires on a chained REST create', () => {
  const command = `git status ; gh api repos/o/r/issues -f title=x -f body=y`;
  assert.equal(evaluateGhApiCreate({ command }).block, true);
});

test('evaluateGhCreate does not attribute a neighboring --body-file to gh issue create', () => {
  const command = `gh issue comment 846 --body-file ${AUDIT} ; gh issue create --title x --label y`;
  const res = evaluateGhCreate({
    command,
    readBodyFile: () => {
      throw new Error('gh issue create carries no body — readBodyFile must not be called');
    },
  });
  assert.equal(res.block, false);
});
