// @story #905
// #905 — branch-name compose/parse/classify for the flat role-typed
// `feature/{story|epic|child}/<N>` convention. Lineage lives in git, never the
// name (design: "Naming convention"). Pure string logic, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROLES,
  composeBranchName,
  parseBranchName,
  isRole,
  branchGlob,
  STORY_GLOB,
  EPIC_GLOB,
  CHILD_GLOB,
} from '../../../../task-tracker/lib/branch-name.mjs';

test('composeBranchName builds feature/<role>/<N> for every role', () => {
  assert.equal(composeBranchName({ role: 'story', issue: 42 }), 'feature/story/42');
  assert.equal(composeBranchName({ role: 'epic', issue: 859 }), 'feature/epic/859');
  assert.equal(composeBranchName({ role: 'child', issue: 872 }), 'feature/child/872');
});

test('composeBranchName accepts numeric-string issue and coerces', () => {
  assert.equal(composeBranchName({ role: 'epic', issue: '905' }), 'feature/epic/905');
});

test('composeBranchName rejects unknown role', () => {
  assert.throws(() => composeBranchName({ role: 'feature', issue: 1 }), /role/i);
  assert.throws(() => composeBranchName({ role: 'grandparent', issue: 1 }), /role/i);
});

test('composeBranchName rejects non-positive-integer issue', () => {
  assert.throws(() => composeBranchName({ role: 'epic', issue: 0 }), /issue/i);
  assert.throws(() => composeBranchName({ role: 'epic', issue: -3 }), /issue/i);
  assert.throws(() => composeBranchName({ role: 'epic', issue: 1.5 }), /issue/i);
  assert.throws(() => composeBranchName({ role: 'epic', issue: 'abc' }), /issue/i);
  assert.throws(() => composeBranchName({ role: 'epic', issue: null }), /issue/i);
});

test('parseBranchName round-trips a composed name', () => {
  for (const role of ROLES) {
    const branch = composeBranchName({ role, issue: 123 });
    assert.deepEqual(parseBranchName(branch), { role, issue: 123 });
  }
});

test('parseBranchName returns null for non-managed branches', () => {
  assert.equal(parseBranchName('trunk'), null);
  assert.equal(parseBranchName('main'), null);
  assert.equal(parseBranchName('claude/task-905-abcdef'), null);
  assert.equal(parseBranchName('feature/epic'), null); // missing number
  assert.equal(parseBranchName('feature/widget/12'), null); // bad role
  assert.equal(parseBranchName('feature/epic/12x'), null); // non-numeric tail
  assert.equal(parseBranchName(''), null);
  assert.equal(parseBranchName(null), null);
});

test('parseBranchName rejects the rejected hierarchical form', () => {
  // Encoding the parent path was explicitly rejected (design: segment 3 is the
  // globally-unique key). A nested path must not parse as a managed branch.
  assert.equal(parseBranchName('feature/epic/859/child/872'), null);
});

test('isRole classifies by parsed role', () => {
  assert.equal(isRole('feature/epic/859', 'epic'), true);
  assert.equal(isRole('feature/child/872', 'epic'), false);
  assert.equal(isRole('feature/child/872', 'child'), true);
  assert.equal(isRole('trunk', 'epic'), false);
  assert.equal(isRole('feature/epic/859', 'bogus'), false);
});

test('role globs match their role and only their role', () => {
  assert.equal(STORY_GLOB, 'feature/story/*');
  assert.equal(EPIC_GLOB, 'feature/epic/*');
  assert.equal(CHILD_GLOB, 'feature/child/*');
  assert.equal(branchGlob('epic'), 'feature/epic/*');
  assert.throws(() => branchGlob('nope'), /role/i);
});
