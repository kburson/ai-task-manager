#!/usr/bin/env node
// @story #309
// Registered by the #1090 chore-mode contract feature test.
// #327 — commit-trail-handler chore-mode subject gate.
//
// Case (f) of AC #9: while chore-mode.active === true, the commit-trail
// handler refuses any commit whose subject does not start with `chore: `.
//
// Pure-helper tests pin the refusal shape; integration tests would drive the
// PostToolUse handler with a synthetic payload but are deferred to the
// hook-integration test scaffold (#327 follow-up).

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkChoreCommitSubject } from '../../task-tracker/commit-trail-handler.mjs';

export function registerChoreModeCommitGateCases() {
  test('checkChoreCommitSubject allows `chore: ` prefix', () => {
    assert.equal(checkChoreCommitSubject('chore: tidy README'), null);
    assert.equal(checkChoreCommitSubject('chore: docs sweep across pickup'), null);
  });

  test('checkChoreCommitSubject refuses feat/fix/docs/etc subjects', () => {
    for (const subj of [
      'feat: add new gate',
      'fix(327): subject',
      'docs: pickup directive',
      'refactor: rename helper',
      'tidy README',
      '',
    ]) {
      const refusal = checkChoreCommitSubject(subj);
      assert.ok(refusal, `expected refusal for ${JSON.stringify(subj)}`);
      assert.equal(refusal.code, 'chore-mode-untagged-commit');
      assert.match(refusal.message, /chore-mode is active/);
      assert.match(refusal.message, /chore-mode off/);
    }
  });

  test('checkChoreCommitSubject requires a space after the colon', () => {
    // `chore:tidy` (no space) is not the canonical conventional-commit form.
    // The gate intentionally rejects it to keep the rule unambiguous.
    const refusal = checkChoreCommitSubject('chore:tidy');
    assert.ok(refusal);
    assert.equal(refusal.code, 'chore-mode-untagged-commit');
  });

  test('checkChoreCommitSubject is case-sensitive', () => {
    // Conventional-commits convention is lowercase. `Chore: ` is rejected so
    // the gate has exactly one allowed shape.
    const refusal = checkChoreCommitSubject('Chore: tidy README');
    assert.ok(refusal);
    assert.equal(refusal.code, 'chore-mode-untagged-commit');
  });

  test('checkChoreCommitSubject tolerates non-string input', () => {
    assert.equal(checkChoreCommitSubject(null), null);
    assert.equal(checkChoreCommitSubject(undefined), null);
    assert.equal(checkChoreCommitSubject(42), null);
  });

  test('checkChoreCommitSubject allows scoped chore subjects', () => {
    // `chore(scope): ...` is also legitimate conventional-commits — but the
    // current gate is intentionally strict on `chore: ` only (matching the
    // deep-dive contract). If we ever loosen to allow scopes, update this
    // test to expect `null` for `chore(scope): ...`.
    const refusal = checkChoreCommitSubject('chore(327): tidy');
    assert.ok(refusal, 'scoped chore(...) is currently refused; deep-dive contract pins `chore: `');
  });
}
