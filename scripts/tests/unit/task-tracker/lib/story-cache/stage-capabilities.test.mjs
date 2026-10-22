// @story #2039 #2059
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { rmSync } from 'node:fs';

// Test-only interception retains the real coordinator-minted capability while
// delegating to the real mutator. Native minting and validation stay unchanged.
const captureKey = Symbol.for('2059.native-reviewed-input');
const nativeMutator = new URL(
  '../../../../../task-tracker/lib/issue-body-mutate.mjs',
  import.meta.url
).href;
const nativeRecord = new URL(
  '../../../../../task-tracker/lib/reviewed-scope/record.mjs',
  import.meta.url
).href;
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === nativeRecord && specifier === '../issue-body-mutate.mjs') {
      const source = `import {mutateIssueBody as actual} from ${JSON.stringify(nativeMutator)};
export async function mutateIssueBody(input) {
  globalThis[Symbol.for('2059.native-reviewed-input')]?.(input);
  return actual(input);
}`;
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { findCheckboxesTickedWithoutProof } =
  await import('../../../../../task-tracker/lib/body-invariants.mjs');
const adapter =
  await import('../../../../../task-tracker/lib/story-cache/stage-capabilities.mjs').catch(
    (error) => {
      if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
      return {};
    }
  );
hook.deregister();
// Moving a checkbox by one line must not conceal its unverified transition.
test('line insertion cannot conceal a checkbox tick without proof', () => {
  const base = '## Scope\n- [ ] Inspect the output\n';
  const candidate = '\n## Scope\n- [x] Inspect the output\n';
  assert.equal(findCheckboxesTickedWithoutProof(base, candidate).length, 1);
});

function validate(input) {
  assert.equal(typeof adapter.validateStagedComposite, 'function', 'composite validator missing');
  return adapter.validateStagedComposite(input);
}
const operation = (base, candidate, capability = null) => ({ base, candidate, capability });
const base = '## Scope\nOrdinary story content.\n\n## Acceptance Criteria\n- [ ] Inspect output\n';

test('ordinary chained edits retain exact candidate and do not mutate operation records', () => {
  const middle = base.replace('Ordinary', 'Updated');
  const candidate = middle + '\nAdditional context.\n';
  const operations = [operation(base, middle), operation(middle, candidate)];
  const saved = structuredClone(operations);
  assert.equal(validate({ base, candidate, operations }), true);
  assert.deepEqual(operations, saved);
  assert.equal(validate({ base, candidate: base, operations: [] }), true);
});
test('a disconnected operation or a candidate not produced by its operations refuses', () => {
  const candidate = base + 'Changed.\n';
  for (const operations of [[], [operation('different base', candidate)], [operation(base, base)]])
    assert.throws(() => validate({ base, candidate, operations }), {
      code: 'STORY_MUTATION_INVALID',
    });
});
test('caller options and serialized permission unions confer no authority', () => {
  const candidate = base.replace('- [ ]', '- [x]');
  for (const capability of [
    true,
    {},
    { evidenceStamp: true },
    { allowMarkerLoss: true, allowUnverifiedTicks: true },
    { reviewedEvidenceCapability: {} },
    { decompositionMutationCapability: {}, issueNumber: 2059, repo: 'owner/repo' },
  ])
    assert.throws(() =>
      validate({ base, candidate, operations: [operation(base, candidate, capability)] })
    );
  assert.throws(() =>
    validate({
      base,
      candidate: base,
      operations: [{ ...operation(base, base), evidenceStamp: true }],
    })
  );
});
test('marker loss and section loss refuse even with independently safe-looking edits', () => {
  const protectedBase = base + '\n<!-- aitm-plan-approved ts="2026-10-22T00:00:00Z" -->\n';
  assert.throws(() =>
    validate({ base: protectedBase, candidate: base, operations: [operation(protectedBase, base)] })
  );
  const candidate = base.replace('## Scope', 'Scope');
  assert.throws(() => validate({ base, candidate, operations: [operation(base, candidate)] }));
});
test('small local shrinks cannot combine into an excessive composite deletion', () => {
  const original = '## Scope\n' + 'x'.repeat(1000);
  const middle = original.slice(0, 760);
  const candidate = original.slice(0, 570);
  assert.throws(
    () =>
      validate({
        base: original,
        candidate,
        operations: [operation(original, middle), operation(middle, candidate)],
      }),
    /section-loss/
  );
});
test('synthetic complete and incomplete execution stamps both refuse', () => {
  for (const stamp of [
    '<!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->',
    '<!-- aitm-verified ts="2026-10-22T00:00:00Z" -->',
  ]) {
    const candidate = base + stamp;
    assert.throws(
      () => validate({ base, candidate, operations: [operation(base, candidate)] }),
      /proof/
    );
  }
});
test('legacy version bytes and preexisting execution proof survive ordinary edits', () => {
  const original =
    base +
    '\n<!-- aitm-body-version: 3 -->\n<!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->\n';
  const candidate = original.replace('Ordinary', 'Updated');
  assert.equal(
    validate({ base: original, candidate, operations: [operation(original, candidate)] }),
    true
  );
  const changed = original.replace('version: 3', 'version: 4');
  assert.throws(
    () =>
      validate({ base: original, candidate: changed, operations: [operation(original, changed)] }),
    /legacy-version/
  );
  const lostProof = original.replace(/<!-- aitm-verified[^]*?-->/, '');
  assert.throws(
    () =>
      validate({
        base: original,
        candidate: lostProof,
        operations: [operation(original, lostProof)],
      }),
    /proof-loss/
  );
});
test('proof relocation cannot launder preexisting evidence to a different checkbox', () => {
  const original = base.replace(
    '- [ ] Inspect output',
    '- [ ] Inspect output\n- [ ] Other output <!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->'
  );
  const candidate = original
    .replace(
      '- [ ] Inspect output',
      '- [x] Inspect output <!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->'
    )
    .replace(
      '- [ ] Other output <!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->',
      '- [ ] Other output'
    );
  assert.throws(
    () => validate({ base: original, candidate, operations: [operation(original, candidate)] }),
    /proof/
  );
});
test('malformed declarations and malformed operation shapes refuse', () => {
  const candidate = base + '<!-- aitm-verified cmd="<command>" -->';
  assert.throws(
    () => validate({ base, candidate, operations: [operation(base, candidate)] }),
    /declaration/
  );
  for (const operations of [
    null,
    {},
    [null],
    [{ base, candidate: 7 }],
    [operation(base, '\ud800')],
  ])
    assert.throws(() => validate({ base, candidate: base, operations }));
});

test('synthetic approval markers never become native approval authority', () => {
  const candidate = base + '<!-- aitm-plan-approved ts="2026-10-22T00:00:00Z" -->';
  assert.throws(
    () => validate({ base, candidate, operations: [operation(base, candidate)] }),
    /protected-marker/
  );
});

import { canonicalRecordJson } from '../../../../../task-tracker/lib/github-records/canonical-json.mjs';
import { POLICY_MARKER, sha256 } from '../../../../../task-tracker/lib/reviewed-scope/model.mjs';
const reviewed = await import('../../../../../task-tracker/lib/reviewed-scope/record.mjs');
for (const [name, prefix, expectedNativeIndex, expectedRawIndex] of [
  ['ordinary bytes', '', 2, 2],
  ['three newlines before policy', '\n\n', 3, 4],
  [
    'legacy version marker surrounded by whitespace',
    '\n \t<!-- aitm-body-version: 7 --> \t\n\n',
    5,
    5,
  ],
  ['legacy version plus blank-line runs', '\n\n\n \t<!-- aitm-body-version: 7 --> \t\n\n\n', 5, 8],
]) {
  test(`genuine reviewed scope token retains raw coordinates: ${name}`, async () => {
    const authority = {
      repository: 'owner/repo',
      issue: 2059,
      worktree: '/bound/checkout',
      branch: 'feature/child/2059',
      head: 'b'.repeat(40),
      actor: { id: '123', login: 'owner' },
      state: 'develop',
    };
    const manifest = {
      schema: 'aitm.reviewed-scope-evidence/v1',
      ...Object.fromEntries(
        ['repository', 'issue', 'worktree', 'branch', 'head'].map((key) => [key, authority[key]])
      ),
      label: 'Inspect output',
      rationale: 'Saved inspection.',
      provenance: { kind: 'operator-inspection' },
      artifacts: [{ path: 'output.txt', sha256: sha256('output') }],
    };
    const bytes = Buffer.from(canonicalRecordJson(manifest) + '\n');
    let body = `## Scope\n${prefix}${POLICY_MARKER}\n- [ ] Inspect output\n\n## Acceptance Criteria\n- [ ] Other output\n`;
    const initial = body;
    const comments = new Map();
    let retained;
    globalThis[captureKey] = (input) => {
      retained = input.reviewedEvidenceCapability;
    };
    const deps = {
      readRecordingAuthority: async () => authority,
      readBoundManifest: async () => bytes,
      validateLocalEvidence: async () => ({ manifestDigest: sha256(bytes) }),
      readLiveBody: async () => body,
      readComment: async ({ commentId }) => comments.get(commentId),
      listComments: async () => [...comments.values()],
      createComment: async ({ body: content }) => {
        const comment = {
          id: '1',
          body: content,
          user: { id: '123' },
          issue_url: 'https://api.github.com/repos/owner/repo/issues/2059',
        };
        comments.set('1', comment);
        return comment;
      },
      fetchBody: async () => body,
      pushBody: async (_repo, _issue, next) => {
        body = next;
      },
      now: () => '2026-10-22T00:00:00.000Z',
      warn: () => {},
    };
    try {
      await reviewed.recordReviewedScope({
        ctx: {
          cfg: { repo: 'owner/repo' },
          projectDir: authority.worktree,
          issueNumber: 2059,
          deps: { reviewedScope: deps },
        },
        label: 'Inspect output',
        manifestPath: 'manifest.json',
      });
    } finally {
      delete globalThis[captureKey];
    }
    assert.ok(retained, 'native coordinator did not expose its genuine capability to real mutator');
    const nativeLine = body.split('\n').find((line) => line.startsWith('- [x] Inspect output'));
    const candidate = initial.replace('- [ ] Inspect output', nativeLine);
    assert.equal(reviewed.validateReviewedDelta(initial, candidate, retained), expectedNativeIndex);
    assert.equal(candidate.split('\n').indexOf(nativeLine), expectedRawIndex);
    assert.equal(candidate.replace(nativeLine, '- [ ] Inspect output'), initial);
    const capability = { reviewedEvidenceCapability: retained };
    const op = operation(initial, candidate, capability);
    assert.equal(validate({ base: initial, candidate, operations: [op] }), true);
    const appended = candidate + '\nAdditional context.\n';
    assert.equal(
      validate({
        base: initial,
        candidate: appended,
        operations: [op, operation(candidate, appended)],
      }),
      true
    );
    assert.throws(() =>
      validate({
        base: initial,
        candidate,
        operations: [operation(initial, candidate, JSON.parse(JSON.stringify(capability)))],
      })
    );
    const altered = candidate.replace('Inspect output', 'Different inspection');
    assert.throws(() =>
      validate({
        base: initial,
        candidate: altered,
        operations: [operation(initial, altered, capability)],
      })
    );
    assert.throws(() =>
      validate({
        base: initial,
        candidate: altered,
        operations: [op, operation(candidate, altered)],
      })
    );
  });
}

const { refreshDecompositionProjection } =
  await import('../../../../../task-tracker/lib/decomposition-projection.mjs');
const { fixture, subject, freshUnitDir } = await import('../decomposition-authority-fixtures.mjs');
test('genuine decomposition capability requires its live native context and exact record delta', async () => {
  const f = fixture();
  const directory = freshUnitDir('2059-native-capability-');
  let retained;
  try {
    const deps = {
      ...f.deps,
      mutateIssueBody: async (input) => {
        const before = f.body;
        const candidate = input.mutate(before);
        const capability = {
          decompositionMutationCapability: input.decompositionMutationCapability,
          issueNumber: subject.issue,
          repo: subject.repository,
        };
        retained = {
          base: before,
          candidate,
          operations: [operation(before, candidate, capability)],
        };
        assert.equal(validate(retained), true);
        assert.throws(() =>
          validate({
            ...retained,
            operations: [operation(before, candidate, JSON.parse(JSON.stringify(capability)))],
          })
        );
        const drifted = candidate.replace('payload="', 'payload="broken');
        assert.throws(() =>
          validate({
            base: before,
            candidate: drifted,
            operations: [operation(before, drifted, capability)],
          })
        );
        await f.deps.pushBody(subject.repository, subject.issue, candidate);
        return { status: 'ok' };
      },
    };
    const result = await refreshDecompositionProjection({
      subject,
      cfg: { repo: 'o/r', projectId: 'PVT_a' },
      projectDir: directory,
      deps,
    });
    assert.equal(result.status, 'confirmed');
    assert.throws(() => validate(retained), /native-invariant/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('unchanged duplicate labels do not invent a new checkbox transition', () => {
  const original = '## Scope\n- [x] Inspect output\n- [ ] Inspect output\n';
  assert.deepEqual(findCheckboxesTickedWithoutProof(original, original), []);
});
test('newly appended checked promises cannot bypass staged proof validation', () => {
  const candidate = base + '\n- [x] Newly asserted completion\n';
  assert.throws(
    () => validate({ base, candidate, operations: [operation(base, candidate)] }),
    /unverified-ticks/
  );
});

test('a changed verifier cannot retain execution proof for the old command', () => {
  const original = base.replace(
    '- [ ] Inspect output',
    '- [ ] Inspect output <!-- aitm-verified cmd="node one.mjs" --> <!-- aitm-verified ts="2026-10-22T00:00:00Z" sha="abcdef1" -->'
  );
  const candidate = original.replace('node one.mjs', 'node two.mjs');
  assert.throws(
    () => validate({ base: original, candidate, operations: [operation(original, candidate)] }),
    /proof-loss/
  );
});

// R1 I1 / exact P1: a Scope completion is not proof of an AC completion.
test('checked promises cannot transfer completion between sections', () => {
  const base = '## Scope\n- [x] Inspect output\n\n## Acceptance Criteria\n- [ ] Inspect output\n';
  const candidate =
    '## Scope\n- [ ] Inspect output\n\n## Acceptance Criteria\n- [x] Inspect output\n';
  assert.equal(findCheckboxesTickedWithoutProof(base, candidate).length, 1);
  assert.throws(() => validate({ base, candidate, operations: [operation(base, candidate)] }), {
    reason: 'unverified-ticks',
  });
});
for (const [name, base, candidate] of [
  [
    'removed checked source',
    '## Scope\n- [x] Inspect output\n\n## Acceptance Criteria\n- [ ] Inspect output\n',
    '## Scope\n\n## Acceptance Criteria\n- [x] Inspect output\n',
  ],
  [
    'inserted target in another section',
    '## Scope\n- [x] Inspect output\n\n## Acceptance Criteria\n',
    '## Scope\n- [ ] Inspect output\n\n## Acceptance Criteria\n- [x] Inspect output\n',
  ],
  [
    'same-section duplicate occurrence',
    '## Scope\n- [x] Inspect output\n- [ ] Inspect output\n',
    '## Scope\n- [ ] Inspect output\n- [x] Inspect output\n',
  ],
  [
    'duplicate section headings',
    '## Scope\n- [x] Inspect output\n\n## Scope\n- [ ] Inspect output\n',
    '## Scope\n- [ ] Inspect output\n\n## Scope\n- [x] Inspect output\n',
  ],
]) {
  test(`completion identity rejects ${name}`, () => {
    assert.equal(findCheckboxesTickedWithoutProof(base, candidate).length, 1);
    assert.throws(() => validate({ base, candidate, operations: [operation(base, candidate)] }), {
      reason: 'unverified-ticks',
    });
  });
}
