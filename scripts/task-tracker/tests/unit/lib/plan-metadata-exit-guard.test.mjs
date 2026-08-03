// @story #892
// Plan Metadata is optional at creation but required before Plan exits to
// Develop. Only a substantive flat metadata field satisfies the gate.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { planExitPlanMetadataGuard } from '../../../lib/plan-exit-plan-metadata-guard.mjs';
import { STATES } from '../../../states/index.mjs';

function run(body, toState = 'develop') {
  return planExitPlanMetadataGuard.run({ body, toState });
}

describe('planExitPlanMetadataGuard (#892)', () => {
  it('refuses a missing Plan Metadata heading', () => {
    const result = run('## Story Origin\n\n- **kind**: code\n');
    assert.equal(result.ok, false);
    assert.match(result.reason, /plan-develop-plan-metadata-empty/);
  });

  it('refuses an empty Plan Metadata section', () => {
    const result = run('## Plan Metadata\n\n## Pickup Directive\n');
    assert.equal(result.ok, false);
  });

  it('refuses comment-only and prose-only content', () => {
    assert.equal(run('## Plan Metadata\n\n<!-- planning later -->\n').ok, false);
    assert.equal(run('## Plan Metadata\n\nPlanning discussion is complete.\n').ok, false);
  });

  it('accepts a substantive flat planning field', () => {
    assert.deepEqual(run('## Plan Metadata\n\n- **size**: M\n'), { ok: true });
    assert.deepEqual(run('## Plan Metadata\n\n- estimate: 8\n'), { ok: true });
  });

  it('refuses provenance-only fields that belong in Story Origin', () => {
    for (const field of ['kind', 'parent', 'related', 'blocks', 'discovered-during']) {
      const result = run(`## Plan Metadata\n\n- **${field}**: value\n`);
      assert.equal(result.ok, false, field);
    }
  });

  it('does not cross into the adjacent Pickup Directive section', () => {
    const body = [
      '## Plan Metadata',
      '',
      '## Pickup Directive — MANDATORY, DO NOT SKIP',
      '',
      '- **size**: text outside Plan Metadata',
    ].join('\n');
    assert.equal(run(body).ok, false);
  });

  it('skips non-Develop transitions and fails open without a body', () => {
    assert.deepEqual(run('## Plan Metadata\n', 'refine'), { ok: true });
    assert.deepEqual(planExitPlanMetadataGuard.run({ toState: 'develop' }), { ok: true });
  });
});

describe('Plan state wiring (#892)', () => {
  it('registers the guard on Plan exit before VC presence', () => {
    const ids = STATES.plan.exitGuards.map((guard) => guard.id);
    const metadata = ids.indexOf('plan-exit-plan-metadata');
    const vc = ids.indexOf('plan-exit-vc-presence');
    assert.notEqual(metadata, -1, ids.join(', '));
    assert.notEqual(vc, -1, ids.join(', '));
    assert.ok(metadata < vc, ids.join(', '));
  });
});
