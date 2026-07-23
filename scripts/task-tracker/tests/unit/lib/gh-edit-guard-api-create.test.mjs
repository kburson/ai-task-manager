// @story #659
// AC1 — the guard refuses `gh api` issue creation (REST POST to
// repos/<owner>/<repo>/issues and GraphQL `createIssue` mutations) with the
// same routing message that points at scripts/gh/create-issue.mjs, while GETs
// and unrelated calls pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyGhApiIssueCreate, evaluateGhApiCreate } from '../../../lib/gh-edit-guard.mjs';

test('REST POST to /repos/<o>/<r>/issues is classified as create', () => {
  assert.equal(
    classifyGhApiIssueCreate('gh api repos/foo/bar/issues -f title=X -f body=Y'),
    'rest'
  );
  // -F (raw-field) and --field also imply POST.
  assert.equal(classifyGhApiIssueCreate('gh api repos/foo/bar/issues -F body=@f.md'), 'rest');
  assert.equal(classifyGhApiIssueCreate('gh api --field title=X repos/foo/bar/issues'), 'rest');
  // Explicit method flag, all supported spellings.
  assert.equal(classifyGhApiIssueCreate('gh api -X POST repos/foo/bar/issues'), 'rest');
  assert.equal(classifyGhApiIssueCreate('gh api -XPOST repos/foo/bar/issues'), 'rest');
  assert.equal(classifyGhApiIssueCreate('gh api --method POST repos/foo/bar/issues'), 'rest');
  assert.equal(classifyGhApiIssueCreate('gh api --method=post repos/foo/bar/issues'), 'rest');
});

test('GraphQL createIssue mutation is classified as create', () => {
  assert.equal(
    classifyGhApiIssueCreate(
      'gh api graphql -f query=\'mutation { createIssue(input: {repositoryId: "R", title: "T"}) { issue { number } } }\''
    ),
    'graphql'
  );
});

test('non-create gh api commands pass (null)', () => {
  // Bare GET list of issues (no fields, no POST).
  assert.equal(classifyGhApiIssueCreate('gh api repos/foo/bar/issues'), null);
  // Single-issue GET / PATCH — `.../issues/<n>` is out of scope.
  assert.equal(classifyGhApiIssueCreate('gh api repos/foo/bar/issues/659'), null);
  assert.equal(
    classifyGhApiIssueCreate('gh api -X PATCH repos/foo/bar/issues/659 -f state=closed'),
    null
  );
  // Comments sub-collection — not the create endpoint.
  assert.equal(
    classifyGhApiIssueCreate('gh api repos/foo/bar/issues/659/comments -f body=hi'),
    null
  );
  // Explicit GET to the collection even with fields → not a create.
  assert.equal(classifyGhApiIssueCreate('gh api -X GET repos/foo/bar/issues -f state=open'), null);
  // Unrelated POST to a different endpoint.
  assert.equal(classifyGhApiIssueCreate('gh api repos/foo/bar/labels -f name=bug'), null);
  // GraphQL query that is not a createIssue mutation.
  assert.equal(
    classifyGhApiIssueCreate("gh api graphql -f query='query { viewer { login } }'"),
    null
  );
  // Not a gh api command at all.
  assert.equal(classifyGhApiIssueCreate('gh issue list'), null);
  assert.equal(classifyGhApiIssueCreate('echo gh api repos/foo/bar/issues -f x=1'), 'rest'); // sanity: substring still matches
});

test('evaluateGhApiCreate blocks both shapes and routes to create-issue.mjs', () => {
  const rest = evaluateGhApiCreate({
    command: 'gh api repos/foo/bar/issues -f title=X -f body=Y',
  });
  assert.equal(rest.block, true);
  assert.match(rest.reason, /create-issue\.mjs/);
  assert.match(rest.reason, /REST POST/);

  const gql = evaluateGhApiCreate({
    command: "gh api graphql -f query='mutation { createIssue(input: {}) { issue { id } } }'",
  });
  assert.equal(gql.block, true);
  assert.match(gql.reason, /create-issue\.mjs/);
  assert.match(gql.reason, /GraphQL/);
});

test('evaluateGhApiCreate passes GETs and single-issue endpoints', () => {
  assert.equal(evaluateGhApiCreate({ command: 'gh api repos/foo/bar/issues' }).block, false);
  assert.equal(evaluateGhApiCreate({ command: 'gh api repos/foo/bar/issues/659' }).block, false);
  assert.equal(evaluateGhApiCreate({ command: 'gh issue view 1' }).block, false);
});
