// @story #1781
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { developExitCodeCompleteGuard } from '../../../../task-tracker/lib/develop-exit-code-complete-guard.mjs';

test('Develop exit identifies the unticked AC and its supported evidence repair', async () => {
  const result = await developExitCodeCompleteGuard.run({
    toState: 'test',
    cfg: { repo: 'example/project' },
    issueNumber: 1781,
    body: '## Acceptance Criteria\n- [ ] Explain a refusal.',
    deps: {
      codeCompleteGate: async () => ({
        ok: false,
        blockers: ['code-complete-ac-unticked: Explain a refusal.'],
      }),
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.refusals, [
    {
      code: 'code-complete-ac-evidence-incomplete',
      args: {
        label: 'Explain a refusal.',
        condition: 'unticked',
        section: 'Acceptance Criteria',
        nextAction:
          'In Develop, add a targeted verifier declaration with npx aitm issue-body if one is missing; then run npx aitm ac-stamp "<AC label>" and npx aitm ensureChecked "<AC label>".',
      },
      noAutomaticRemediation: { reason: 'operator-action-required' },
    },
  ]);
});

test('Develop exit identifies a checked AC whose verification is missing', async () => {
  const result = await developExitCodeCompleteGuard.run({
    toState: 'test',
    cfg: { repo: 'example/project' },
    issueNumber: 1781,
    body: '## Acceptance Criteria\n- [x] Explain a refusal.',
    deps: {
      codeCompleteGate: async () => ({
        ok: false,
        blockers: ['code-complete-ac-unverified: Explain a refusal.'],
      }),
    },
  });

  assert.equal(result.refusals?.[0]?.args.condition, 'unverified');
  assert.equal(result.refusals?.[0]?.args.label, 'Explain a refusal.');
  assert.match(result.refusals?.[0]?.args.nextAction, /Add a targeted verifier declaration/);
});

test('Develop exit directs non-demonstrable ACs to the audited checkbox route', async () => {
  const result = await developExitCodeCompleteGuard.run({
    toState: 'test',
    cfg: { repo: 'example/project' },
    issueNumber: 1781,
    body: '## Acceptance Criteria\n- [ ] Explain a refusal. <!-- aitm-non-demonstrable -->',
    deps: {
      codeCompleteGate: async () => ({
        ok: false,
        blockers: ['code-complete-ac-unticked: Explain a refusal. <!-- aitm-non-demonstrable -->'],
      }),
    },
  });

  assert.equal(result.refusals?.[0]?.args.condition, 'unticked-non-demonstrable');
  assert.equal(result.refusals?.[0]?.args.label, 'Explain a refusal.');
  assert.equal(
    result.refusals?.[0]?.args.nextAction,
    'In Develop, run npx aitm ensureChecked --allow-unverified-ticks --label "<AC label>".'
  );
});

test('Develop exit recognizes the gate-accepted mixed-case non-demonstrable marker', async () => {
  const result = await developExitCodeCompleteGuard.run({
    toState: 'test',
    cfg: { repo: 'example/project' },
    issueNumber: 1781,
    body: '## Acceptance Criteria\n- [ ] Explain a refusal. <!-- AITM-NON-DEMONSTRABLE -->',
    deps: {
      codeCompleteGate: async () => ({
        ok: false,
        blockers: ['code-complete-ac-unticked: Explain a refusal. <!-- AITM-NON-DEMONSTRABLE -->'],
      }),
    },
  });

  assert.equal(result.refusals?.[0]?.args.condition, 'unticked-non-demonstrable');
  assert.equal(result.refusals?.[0]?.args.label, 'Explain a refusal.');
});
