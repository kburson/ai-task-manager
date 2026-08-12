// @story #310
// Tests for scripts/task-tracker/lib/gh-edit-guard.mjs — the body-write
// chokepoint that protects against legacy-checkbox reintroduction and
// hidden-marker drops on `gh issue edit ... --body-file/--body ...`.

import { strict as assert } from 'node:assert';
import {
  parseGhIssueEdit,
  parseGhIssueCreate,
  checkBodyChange,
  checkNewBody,
  evaluateGhEdit,
  evaluateGhCreate,
  findDeepDiveEmbeddedCheckboxHeading,
} from '../../../lib/gh-edit-guard.mjs';

// ── parseGhIssueEdit ─────────────────────────────────────────────────────────
{
  // --body-file
  assert.deepEqual(parseGhIssueEdit('gh issue edit 64 --body-file /tmp/foo.md'), {
    issueNumber: 64,
    source: 'file',
    path: '/tmp/foo.md',
  });
  // Hash prefix and -R flag in between
  assert.deepEqual(parseGhIssueEdit('gh issue edit #64 -R owner/repo --body-file /tmp/x.md'), {
    issueNumber: 64,
    source: 'file',
    path: '/tmp/x.md',
  });
  // --body inline (double-quoted)
  assert.deepEqual(parseGhIssueEdit('gh issue edit 7 --body "hello world"'), {
    issueNumber: 7,
    source: 'inline',
    body: 'hello world',
  });
  // --body inline (single-quoted)
  assert.deepEqual(parseGhIssueEdit("gh issue edit 7 --body 'a b'"), {
    issueNumber: 7,
    source: 'inline',
    body: 'a b',
  });
  // No body flag → source: none
  assert.deepEqual(parseGhIssueEdit('gh issue edit 7 --add-label bug'), {
    issueNumber: 7,
    source: 'none',
  });
  // Not an issue edit command
  assert.equal(parseGhIssueEdit('gh issue view 64'), null);
  assert.equal(parseGhIssueEdit('echo hello'), null);
  assert.equal(parseGhIssueEdit(''), null);
}

// ── checkBodyChange: legacy-line introduction ────────────────────────────────
{
  const cur = '## AC\n\n- [ ] do thing\n';

  // Adding "Plan approved by human" → block
  let r = checkBodyChange({
    newBody: '## AC\n\n- [ ] do thing\n- [x] Plan approved by human\n',
    currentBody: cur,
    issueNumber: 64,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Plan approved by human/);
  assert.match(r.reason, /#64/);

  // Adding "Deep dive complete" → block
  r = checkBodyChange({
    newBody: '## AC\n\n- [ ] do thing\n- [ ] Deep dive complete\n',
    currentBody: cur,
    issueNumber: 65,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep dive complete/);

  // Body already had the legacy line → preservation passes (not adding)
  r = checkBodyChange({
    newBody: '## AC\n- [ ] do thing\n- [x] Plan approved by human\n## More\nstuff\n',
    currentBody: '## AC\n- [ ] do thing\n- [x] Plan approved by human\n',
    issueNumber: 99,
  });
  assert.equal(
    r.block,
    false,
    'preserving an already-present legacy line is OK (heal will normalise later)'
  );

  // Clean body → clean body: passes
  r = checkBodyChange({ newBody: cur, currentBody: cur, issueNumber: 1 });
  assert.equal(r.block, false);
}

// ── checkBodyChange: hidden-marker drop ──────────────────────────────────────
{
  const PLAN = '<!-- aitm-plan-approved: 2026-05-11T20:00:00Z -->';
  const DEEP = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';
  const REV = '<!-- aitm-review-approved: 2026-05-11T20:00:00Z -->';

  // Drop plan-approved → block
  let r = checkBodyChange({
    newBody: `## AC\n\n${DEEP}\n${REV}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 64,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-plan-approved/);

  // Drop deep-dive-complete → block
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n${REV}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 65,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  // Drop review-approved → block
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n${DEEP}\n`,
    currentBody: `## AC\n\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 67,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-review-approved/);

  // Preserve all markers (any ts change is fine — only presence is checked)
  r = checkBodyChange({
    newBody: `## AC\n${PLAN.replace('20:00:00Z', '22:00:00Z')}\n${DEEP}\n${REV}\nappended\n`,
    currentBody: `## AC\n${PLAN}\n${DEEP}\n${REV}\n`,
    issueNumber: 1,
  });
  assert.equal(r.block, false);

  // Add new markers to a body that had none: passes
  r = checkBodyChange({
    newBody: `## AC\n\n${PLAN}\n`,
    currentBody: `## AC\n`,
    issueNumber: 2,
  });
  assert.equal(r.block, false);
}

// ── evaluateGhEdit: end-to-end wiring with injected deps ─────────────────────
// #361 — `gh issue edit --body` / `--body-file` are hard-refused regardless
// of diff content. Diff-based protection still applies to body writes that
// flow through `mutateIssueBody` (covered by checkBodyChange unit tests
// above); the bash-level refusal forbids the direct path entirely.
{
  const fileBody = {
    '/tmp/good.md': '## AC\n- [ ] x\n',
    '/tmp/with-legacy.md': '## AC\n- [x] Plan approved by human\n',
    '/tmp/drops-marker.md': '## AC\n- [ ] x\n',
  };
  const readBodyFile = (p) => {
    if (!(p in fileBody)) throw new Error(`no such file: ${p}`);
    return fileBody[p];
  };
  const fetchCurrentBody = (n) => {
    if (n === 64) return '## AC\n<!-- aitm-plan-approved: 2026-05-11T20:00:00Z -->\n';
    if (n === 65) return '## AC\n- [ ] x\n';
    return '';
  };

  // --body-file is hard-refused regardless of file content
  let r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/good.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);
  assert.match(r.reason, /mutateIssueBody/);

  // --body-file is hard-refused even when the file would not exist
  r = evaluateGhEdit({
    command: 'gh issue edit 65 --body-file /tmp/missing.md',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);

  // --body inline is hard-refused regardless of content
  r = evaluateGhEdit({
    command: `gh issue edit 65 --body "harmless content"`,
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /direct body writes from Bash are forbidden/i);

  // Non-edit command → pass
  r = evaluateGhEdit({
    command: 'gh issue view 64 --json body',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // Edit without body flag (e.g., --add-label only) → pass
  r = evaluateGhEdit({
    command: 'gh issue edit 64 --add-label bug',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, false);

  // Direct assignee edits are governed ownership bypasses and refuse.
  r = evaluateGhEdit({
    command: 'gh issue edit 64 --title "new" --add-assignee @me --milestone v2',
    readBodyFile,
    fetchCurrentBody,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /npx aitm transfer/);

  for (const command of [
    'gh issue edit -R acme/widgets 1212 --add-assignee alice',
    'gh issue edit https://github.com/acme/widgets/issues/1212 --remove-assignee alice',
    'gh api repos/acme/widgets/issues/1212 -X PATCH -f assignees[]=alice',
    "gh api repos/acme/widgets/issues/1212 -X PATCH -f 'assignees[]=alice'",
    'gh api --method=PATCH repos/acme/widgets/issues/1212 --input owners.json',
    'gh api repos/acme/widgets/issues/1212/assignees -f assignees[]=bob',
    'gh api repos/acme/widgets/issues/1212/assignees --input owners.json',
    'gh api graphql -f query="$QUERY"',
    "eval 'gh issue edit 1212 --add-assignee bob'",
    "eval 'gh api repos/acme/widgets/issues/1212/assignees -f assignees[]=bob'",
    'gh api graphql -F query=@mutation.graphql',
    'gh api graphql --field=query=@mutation.graphql',
    `gh api graphql -f 'query=mutation { updateIssue(input:{id:"I_1",assigneeIds:["U_1"]}) { issue { id } } }'`,
  ]) {
    r = evaluateGhEdit({ command });
    assert.equal(r.block, true, `raw ownership mutation must refuse: ${command}`);
    assert.match(r.reason, /governed ownership|npx aitm/i);
  }
}

// ── checkBodyChange: aitm-body-version / aitm-stage-rollup marker protection (#361)
{
  // aitm-body-version drop → block
  let r = checkBodyChange({
    newBody: '## AC\n- [ ] x\n',
    currentBody: '## AC\n- [ ] x\n<!-- aitm-body-version: 7 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-body-version/);

  // aitm-stage-rollup drop → block
  r = checkBodyChange({
    newBody: '## AC\n- [ ] x\n',
    currentBody: '## AC\n- [ ] x\n<!-- aitm-stage-rollup: refine=1 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-stage-rollup/);

  // both preserved → pass
  r = checkBodyChange({
    newBody:
      '## AC\n- [ ] x\n<!-- aitm-body-version: 8 -->\n<!-- aitm-stage-rollup: refine=2 -->\n',
    currentBody:
      '## AC\n- [ ] x\n<!-- aitm-body-version: 7 -->\n<!-- aitm-stage-rollup: refine=1 -->\n',
    issueNumber: 361,
  });
  assert.equal(r.block, false);
}

// ── checkBodyChange: deep-dive heading must come with marker ─────────────────
{
  const MARKER = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';

  // Adding heading without marker → block
  let r = checkBodyChange({
    newBody: '## AC\n## Deep-Dive Analysis (2026-05-11)\nstuff\n',
    currentBody: '## AC\n',
    issueNumber: 99,
  });
  assert.equal(r.block, true);
  assert.match(r.reason, /Deep-Dive Analysis/);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  // Adding heading WITH marker → pass
  r = checkBodyChange({
    newBody: `## AC\n## Deep-Dive Analysis (2026-05-11)\nstuff\n${MARKER}\n`,
    currentBody: '## AC\n',
    issueNumber: 99,
  });
  assert.equal(r.block, false);

  // Heading already present in current → not "introducing", pass even without marker
  r = checkBodyChange({
    newBody: '## AC\n## Deep-Dive Analysis\nrevised\n',
    currentBody: '## AC\n## Deep-Dive Analysis\noriginal\n',
    issueNumber: 99,
  });
  assert.equal(r.block, false);
}

// ── checkNewBody: deep-dive heading must come with marker on create ──────────
{
  const MARKER = '<!-- aitm-deep-dive-complete: 2026-05-11T20:00:00Z -->';

  let r = checkNewBody({ newBody: '## AC\n## Deep-Dive Analysis\nx\n' });
  assert.equal(r.block, true);
  assert.match(r.reason, /aitm-deep-dive-complete/);

  r = checkNewBody({ newBody: `## AC\n## Deep-Dive Analysis\nx\n${MARKER}\n` });
  assert.equal(r.block, false);
}
