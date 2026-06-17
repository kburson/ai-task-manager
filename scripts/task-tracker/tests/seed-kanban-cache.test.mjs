// @story #273
// #273 — the seeder must (1) retry GraphQL once, (2) tag its failure modes,
// and (3) actually populate the cache on success. The pre-#273 swallowing
// try/catch is gone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { projectScratchDir } from '../lib/scratch-dir.mjs';

import { SeederGraphQLError, SeederMarkerMissingError } from '../lib/seed-kanban-cache.mjs';

test('SeederGraphQLError carries cause and a tagged message', () => {
  const inner = new Error('connect ETIMEDOUT');
  const err = new SeederGraphQLError('failed to fetch #1: connect ETIMEDOUT', inner);
  assert.ok(err.message.startsWith('SeederGraphQLError:'));
  assert.equal(err.name, 'SeederGraphQLError');
  assert.equal(err.cause, inner);
});

test('SeederMarkerMissingError names the issue and points to reconcile', () => {
  const err = new SeederMarkerMissingError(273);
  assert.equal(err.name, 'SeederMarkerMissingError');
  assert.equal(err.issueNumber, 273);
  assert.match(err.message, /#273/);
  assert.match(err.message, /reconcile accept-live 273/);
});

test('SeederGraphQLError is distinguishable from SeederMarkerMissingError', () => {
  const a = new SeederGraphQLError('x');
  const b = new SeederMarkerMissingError(1);
  assert.notEqual(a.name, b.name);
  assert.ok(a instanceof Error);
  assert.ok(b instanceof Error);
});
