#!/usr/bin/env node
// @story #556 #1012
// Routing identity is narrow; the command catalog owns public metadata.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  commandByName,
  routeIdentityForCommand,
  taskVerbNames,
} from '../../../lib/command-surface/catalog.mjs';
import { ROUTE_IDENTITIES, routeIdentityForVerb } from '../../../lib/command-surface/routing.mjs';
import { VERBS, parseVerbs, groupedListing } from '../../../../../bin/aitm-registry.mjs';

test('routing identities contain only canonical verb and dispatch metadata', () => {
  assert.ok(ROUTE_IDENTITIES.length > 0);
  assert.equal(Object.isFrozen(ROUTE_IDENTITIES), true);
  for (const route of ROUTE_IDENTITIES) {
    assert.deepEqual(Object.keys(route).sort(), ['dispatch', 'verb']);
    assert.equal(typeof route.verb, 'string');
    assert.ok(route.verb.length > 0);
    assert.equal(typeof route.dispatch, 'string');
    assert.ok(route.dispatch.length > 0);
    assert.equal(Object.isFrozen(route), true);
    assert.equal(routeIdentityForVerb(route.verb), route);
  }
  assert.equal(routeIdentityForVerb('not-a-verb'), null);
});

test('catalog owns alias resolution and resolves each route identity', () => {
  for (const route of ROUTE_IDENTITIES) {
    const record = commandByName(route.verb);
    assert.ok(record, route.verb);
    assert.equal(record.routing, route.dispatch);
    assert.equal(routeIdentityForCommand(route.verb), route);
  }

  for (const [alias, canonical] of [
    ['end', 'close'],
    ['next', 'promote'],
    ['story', 'user-story'],
    ['brainstorm', 'discover'],
    ['check', 'ensureChecked'],
  ]) {
    assert.equal(commandByName(alias), commandByName(canonical), alias);
    assert.equal(routeIdentityForCommand(alias), routeIdentityForVerb(canonical), alias);
  }
  assert.equal(commandByName('not-a-verb'), null);
  assert.equal(routeIdentityForCommand('not-a-verb'), null);
});

test('registry and grouped help consume the catalog verb-name query', () => {
  const expected = [...taskVerbNames()].sort();
  assert.deepEqual([...VERBS].sort(), expected);
  assert.deepEqual(groupedListing().verbs, expected);
});

test('catalog verb names equal the dispatch switch case labels', () => {
  assert.deepEqual(
    [...taskVerbNames()].sort(),
    [...parseVerbs()].sort(),
    'dispatch switch and canonical catalog routing identities have drifted'
  );
});
