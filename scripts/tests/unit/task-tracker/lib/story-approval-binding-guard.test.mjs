// @story #1711
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storyApprovalBindingGuard } from '../../../../task-tracker/lib/story-approval-binding-guard.mjs';
import { planApprovedGuard } from '../../../../task-tracker/lib/plan-approved-guard.mjs';
import { buildPlanApprovedMarker } from '../../../../task-tracker/lib/markers.mjs';
import { resolveStoryIntentSource } from '../../../../task-tracker/lib/story-intent-source.mjs';
const body =
  '## User Story\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Deep-Dive Analysis\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n';
const binding = resolveStoryIntentSource({ body, projectDir: '.' }).binding;
const ts = '2026-09-19T12:00:00Z';
for (const waived of [false, true])
  for (const gate of [false, true])
    for (const r4p of [false, true]) {
      for (const [kind, attrs, want] of [
        ['absent', null, null],
        ['current', binding, null],
        ['legacy', {}, 'story-approval-binding-missing'],
        ['partial', { storyDigest: binding.storyDigest }, 'story-approval-binding-missing'],
        ['source', { ...binding, storyIntentSource: 'linked-plan' }, 'story-approval-stale-source'],
        ['story', { ...binding, storyDigest: 'a'.repeat(64) }, 'story-approval-stale-story'],
        [
          'intent',
          { ...binding, storyIntentDigest: 'b'.repeat(64) },
          'story-approval-stale-intent',
        ],
      ]) {
        test(`${kind}: waived=${waived} gate=${gate} r4p=${r4p}`, async () => {
          let reads = 0;
          const ctx = {
            issueNumber: 1711,
            toState: 'develop',
            projectDir: '.',
            body: `${body}\n## Markers\n${r4p ? '<!-- aitm-entered-ready-for-plan ts="2026-01-01T00:00:00Z" -->' : ''}\n${attrs ? buildPlanApprovedMarker(ts, { ...attrs, trunkSha: 'c'.repeat(40) }) : ''}`,
            workflowPolicy: { isWaived: () => waived },
            cfg: { gateAnalysisToDevelopment: gate },
            deps: {
              resolveTrunkSha: () => 'c'.repeat(40),
              resolveStoryIntent: (args) => {
                reads++;
                return resolveStoryIntentSource(args);
              },
            },
          };
          const result = await storyApprovalBindingGuard.run(ctx);
          assert.equal(result.ok, want === null);
          if (want) {
            assert.equal(result.code, want);
            assert.match(result.reason, /npx aitm plan-approve #1711/);
          }
          if (['absent', 'legacy', 'partial'].includes(kind)) assert.equal(reads, 0);
          if (kind === 'absent')
            assert.equal((await planApprovedGuard.run(ctx)).ok, waived || !gate);
        });
      }
    }
test('demotion exits before reading body or sources', async () => {
  assert.deepEqual(
    await storyApprovalBindingGuard.run({
      toState: 'refine',
      get body() {
        throw new Error('must not read');
      },
    }),
    { ok: true }
  );
});
test('a malformed present approval cannot masquerade as an absent marker', async () => {
  const result = await storyApprovalBindingGuard.run({
    toState: 'develop',
    body: '<!-- aitm-plan-approved mode="human" -->',
    workflowPolicy: { isWaived: () => true },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'story-approval-binding-missing');
});
test('case-insensitive legacy and malformed approvals cannot bypass the binding guard', async () => {
  for (const marker of [
    '<!-- AITM-PLAN-APPROVED: 2026-09-19T12:00:00Z -->',
    '<!-- AITM-PLAN-APPROVED mode="human" -->',
  ]) {
    const result = await storyApprovalBindingGuard.run({ toState: 'develop', body: marker });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'story-approval-binding-missing');
  }
});
test('invalid prose precedes intent reads and async resolver failures are repairable refusals', async () => {
  const marker = buildPlanApprovedMarker(ts, binding);
  const invalid = await storyApprovalBindingGuard.run({
    toState: 'develop',
    issueNumber: 1711,
    body: marker,
    deps: {
      resolveStoryIntent: () => {
        throw new Error('must not read');
      },
    },
  });
  assert.equal(invalid.code, 'story-section-missing');
  const failure = await storyApprovalBindingGuard.run({
    toState: 'develop',
    issueNumber: 1711,
    body: `${body}\n## Markers\n${marker}`,
    deps: {
      resolveStoryIntent: async () => {
        throw new Error('offline');
      },
    },
  });
  assert.equal(failure.code, 'story-intent-source-unresolvable');
});
