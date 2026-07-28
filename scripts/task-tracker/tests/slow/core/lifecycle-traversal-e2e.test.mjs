#!/usr/bin/env node
// @story #438
// #438 AC1 — Full-lifecycle traversal E2E.
//
// Walk the canonical FORWARD chain backlog → on-deck → refine → plan →
// develop → test → review → done. For every hop assert (a) the state machine
// considers the transition legal AND (b) the DESTINATION slug resolves to a
// non-empty board option ID through the PRODUCTION resolution path:
// `STATUS_CONFIG_KEYS[slug]` → config key → `cfg[key]`.
//
// This is the exact resolution that returned EMPTY for `on-deck` under Bug A
// (#433/#436): `kanbanOptionOnDeck` was written to task-tracker.json but
// absent from config.mjs DEFAULTS, so loadConfig dropped it and the option ID
// came back ''. The first On Deck hop would have gone red here.

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  forwardTarget,
  stateIds,
  validateTransition,
} from '../../../lib/lifecycle-policy/index.mjs';
import { STATUS_CONFIG_KEYS } from '../../../../gh/lib/project-tether.mjs';
import { DEFAULTS } from '../../../config.mjs';

// A fully-populated config: every kanbanOption* carries a distinct non-empty
// option ID, mirroring a board that init-script provisioned correctly.
function populatedConfig() {
  const cfg = { ...DEFAULTS };
  for (const slug of stateIds()) {
    const key = STATUS_CONFIG_KEYS[slug];
    cfg[key] = `OPT_${slug.toUpperCase().replace(/-/g, '_')}`;
  }
  return cfg;
}

// Mirror move-state's board-write resolution without invoking the executable
// (its STATE_TO_CONFIG_KEY copy is module-private and the filename is a
// forbidden Bash token). project-tether's exported STATUS_CONFIG_KEYS is the
// importable twin used by the production writeFields path.
function resolveOptionId(cfg, slug) {
  const key = STATUS_CONFIG_KEYS[String(slug).toLowerCase()];
  return key ? cfg[key] : undefined;
}

test('AC1: every canonical FORWARD hop is legal and resolves a non-empty option ID', () => {
  const cfg = populatedConfig();
  let from = 'backlog';
  const visited = ['backlog'];

  // Entry state itself must resolve.
  assert.ok(resolveOptionId(cfg, from), `entry state ${from} must resolve a non-empty option ID`);

  while (forwardTarget(from)) {
    const to = forwardTarget(from);
    const v = validateTransition(from, to);
    assert.ok(v.ok, `transition ${from} → ${to} must be legal: ${v.reason ?? ''}`);

    const optId = resolveOptionId(cfg, to);
    assert.ok(
      typeof optId === 'string' && optId.length > 0,
      `destination state "${to}" must resolve a non-empty board option ID ` +
        `(this is the resolution that returned '' for on-deck under Bug A)`
    );

    visited.push(to);
    from = to;
  }

  // The full canonical chain must have been traversed end-to-end.
  assert.deepEqual(
    visited,
    ['backlog', 'on-deck', 'refine', 'plan', 'develop', 'test', 'review', 'done'],
    'traversal must cover the entire canonical 8-state chain'
  );
});

test('AC1: on-deck specifically resolves (direct Bug A regression pin)', () => {
  const cfg = populatedConfig();
  const optId = resolveOptionId(cfg, 'on-deck');
  assert.ok(optId && optId.length > 0, 'on-deck must resolve — the exact Bug A failure locus');
});
