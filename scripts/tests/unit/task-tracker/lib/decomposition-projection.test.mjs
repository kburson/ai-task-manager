// @story #1987
import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { freshUnitDir } from './decomposition-authority-fixtures.mjs';
import {
  collectDecompositionAuthority,
  createDecompositionRuntime,
} from '../../../../task-tracker/lib/decomposition-authority.mjs';
import { refreshDecompositionProjection } from '../../../../task-tracker/lib/decomposition-projection.mjs';
import {
  readDecompositionRecords,
  replaceDecompositionRecords,
} from '../../../../task-tracker/lib/decomposition-records.mjs';
import {
  runIssueBodyOperation,
  parseIssueBodyOperation,
} from '../../../../task-tracker/verbs/issue-body.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { withIssueLock } from '../../../../task-tracker/issue-mutator-lock.mjs';
import { fixture, subject, observed, publication } from './decomposition-authority-fixtures.mjs';
const cfg = { repo: 'o/r', projectId: 'PVT_a' };
const collect = (f) =>
  collectDecompositionAuthority({ subject, cfg, projectDir: process.cwd(), deps: f.deps });
async function run(f, options = {}) {
  const dir = freshUnitDir('decomposition-');
  try {
    return await refreshDecompositionProjection({
      subject,
      cfg,
      projectDir: dir,
      deps: f.deps,
      ...options,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test('owned refresh inserts and reads back current assessment preserving unrelated bytes', async () => {
  const f = fixture();
  const before = f.body;
  const r = await run(f);
  assert.equal(r.status, 'confirmed');
  assert.equal((await collect(f)).projection.status, 'current');
  assert.equal((await collect(f)).capabilities.includes('scoped-implementation'), true);
  assert.ok(f.body.includes('aitm-last-known-state state="develop"'));
  assert.ok(f.body.includes('Current inputs must agree.'));
  assert.equal(before.includes('Decomposition Assessment'), false);
});
test('refresh preserves pending intent and does not promote claimed effects to confirmed', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: pub });
  const r = await run(f);
  assert.equal(r.assessment.status, 'pending');
  assert.deepEqual(readDecompositionRecords(f.body).publication, pub);
});
test('failed exact read back is not confirmed permission', async () => {
  const f = fixture();
  f.deps.readBackIssue = async () => observed({ number: 1987, body: 'wrong body' });
  assert.equal((await run(f)).status, 'unconfirmed');
});
for (const marker of [
  '<!-- aitm-decomposition-assessment schema="1" payload="broken" -->',
  '<!-- aitm-decomposition-publication schema="1" payload="broken" -->',
]) {
  test('malformed protected authority is not silently erased by refresh ' + marker, async () => {
    const f = fixture();
    f.body += marker;
    await assert.rejects(() => run(f), /decomposition/);
    assert.equal(f.writes.length, 0);
  });
}
test('foreign context cannot become an owned refresh', async () => {
  const f = fixture();
  await assert.rejects(() => run(f, { context: { subject, operationId: 'forged' } }), /context/);
  assert.equal(f.writes.length, 0);
});
test('inherited issue lock environment grants no refresh owner', async () => {
  const f = fixture();
  const prior = process.env.AITM_ISSUE_LOCK_HELD;
  process.env.AITM_ISSUE_LOCK_HELD = '1987';
  try {
    await assert.rejects(() => run(f), /lock/);
    assert.equal(f.writes.length, 0);
  } finally {
    if (prior === undefined) delete process.env.AITM_ISSUE_LOCK_HELD;
    else process.env.AITM_ISSUE_LOCK_HELD = prior;
  }
});
test('provider body limit refuses before a write', async () => {
  const f = fixture();
  f.body += 'x'.repeat(65536);
  await assert.rejects(() => run(f), /body-limit/);
  assert.equal(f.writes.length, 0);
});
test('same issue real lock nesting works but an unrelated contender receives no capability', async () => {
  const f = fixture();
  const dir = freshUnitDir('decomposition-');
  let release, entered;
  const ready = new Promise((r) => (entered = r));
  const held = withIssueLock({ issue: 1987, projDir: dir }, async () => {
    const r = await refreshDecompositionProjection({ subject, cfg, projectDir: dir, deps: f.deps });
    assert.equal(r.status, 'confirmed');
    entered();
    await new Promise((r) => (release = r));
  });
  try {
    await ready;
    await assert.rejects(
      () => refreshDecompositionProjection({ subject, cfg, projectDir: dir, deps: f.deps }),
      /locked/
    );
  } finally {
    release();
    await held;
    rmSync(dir, { recursive: true, force: true });
  }
});
test('fresh base semantic drift refuses instead of overwriting current authority', async () => {
  const f = fixture();
  const original = f.deps.fetchBody;
  f.deps.fetchBody = async () => {
    f.body = f.body.replace('Collect current authority.', 'Changed semantic scope.');
    return original();
  };
  await assert.rejects(() => run(f), /drift/);
  assert.equal(f.writes.length, 0);
});
test('well formed generic pending to complete rewrite is refused by real body transaction', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: pub });
  const complete = {
    ...pub,
    status: 'complete',
    effects: pub.effects.map((e) => ({
      ...e,
      status: 'confirmed',
      observedDigest: e.intendedDigest,
    })),
  };
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1987,
        repo: 'o/r',
        deps: f.deps,
        allowMarkerAdvance: ['aitm-decomposition-publication'],
        mutate: (base) =>
          replaceDecompositionRecords(base, { assessment: a.assessment, publication: complete }),
      }),
    /marker-advance/
  );
  assert.equal(f.writes.length, 0);
});

test('allowMarkerLoss cannot remove pending publication through real mutateIssueBody', async () => {
  const f = fixture();
  const a = await collect(f);
  f.body = replaceDecompositionRecords(f.body, {
    assessment: a.assessment,
    publication: publication(a.inputDigest),
  });
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1987,
        repo: 'o/r',
        deps: f.deps,
        allowMarkerLoss: true,
        allowMarkerAdvance: ['aitm-decomposition-publication'],
        mutate: (base) =>
          replaceDecompositionRecords(base, { assessment: a.assessment, publication: null }),
      }),
    /marker-advance/
  );
  assert.equal(f.writes.length, 0);
});
test('retry sees newly competing publication and refuses a second privileged push', async () => {
  const f = fixture();
  const old = f.body;
  const a = await collect(f);
  const push = f.deps.pushBody;
  let first = true;
  f.deps.pushBody = async (...args) => {
    await push(...args);
    if (first) {
      first = false;
      f.body = replaceDecompositionRecords(old, {
        assessment: null,
        publication: publication(a.inputDigest),
      });
    }
  };
  await assert.rejects(() => run(f), /marker-advance|semantic-drift|conflict|overlapping edit/);
  assert.equal(f.writes.length, 1);
  assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
});

test('declarative issue-body cannot replace a well formed pending publication with complete', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  f.body = replaceDecompositionRecords(f.body, { assessment: a.assessment, publication: pub });
  const complete = {
    ...pub,
    status: 'complete',
    effects: pub.effects.map((e) => ({
      ...e,
      status: 'confirmed',
      observedDigest: e.intendedDigest,
    })),
  };
  const next = replaceDecompositionRecords(f.body, {
    assessment: a.assessment,
    publication: complete,
  });
  const marker = (b) => b.match(/<!-- aitm-decomposition-publication[^]*?-->/)[0];
  const operation = parseIssueBodyOperation({
    schema: 'aitm.issue-body-operation/v1',
    kind: 'replace-exact',
    expected: marker(f.body),
    replacement: marker(next),
  });
  await assert.rejects(
    () =>
      runIssueBodyOperation({
        issueNumber: 1987,
        repo: 'o/r',
        operation,
        deps: { mutateIssueBody: (args) => mutateIssueBody({ ...args, deps: f.deps }) },
      }),
    /protected AITM markers changed/
  );
  assert.equal(f.writes.length, 0);
});
test('captured private capability expires after owned operation and cannot be replayed', async () => {
  const f = fixture();
  let captured;
  f.deps.mutateIssueBody = async (args) => {
    captured = args.decompositionMutationCapability;
    return mutateIssueBody(args);
  };
  await run(f);
  const a = await collect(f);
  await assert.rejects(
    () =>
      mutateIssueBody({
        issueNumber: 1987,
        repo: 'o/r',
        deps: f.deps,
        decompositionMutationCapability: captured,
        allowMarkerAdvance: ['aitm-decomposition-assessment'],
        mutate: (base) =>
          replaceDecompositionRecords(base, {
            assessment: { ...a.assessment, assessedAt: '2026-10-12T12:00:00Z' },
            publication: null,
          }),
      }),
    /marker-advance/
  );
});

test('runtime owns publication entry without exposing a raw mutation capability factory', () => {
  const f = fixture();
  const runtime = createDecompositionRuntime({ cfg, projectDir: process.cwd(), deps: f.deps });
  assert.equal(typeof runtime.withPublication, 'function');
  assert.equal(runtime.createMutationCapability, undefined);
});
test('owned publication advances require actual effect read back and matching current authority', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest, {
    intendedInputDigest: a.inputDigest,
    proposal: { estimate: { basis: 'proposed', hours: 7, proposalId: 'proposal-a' }, size: 'M' },
  });
  pub.effects[0].intendedDigest = (await import('./decomposition-authority-fixtures.mjs')).hash(7);
  f.deps.readPublicationEffect = async () => observed(f.values.project.estimate);
  const dir = freshUnitDir('decomposition-owner-');
  try {
    const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
    await runtime.withPublication({ subject, publication: pub }, async (context) => {
      await context.persistPublication(pub);
      assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
      const complete = {
        ...pub,
        status: 'complete',
        effects: pub.effects.map((e) => ({
          ...e,
          status: 'confirmed',
          observedDigest: e.intendedDigest,
        })),
      };
      f.values.project.estimate = 8;
      await assert.rejects(
        () => context.persistPublication(complete),
        /effect-read-back|authority/
      );
      assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
      f.values.project.estimate = 7;
      await context.persistPublication(complete);
      assert.equal(readDecompositionRecords(f.body).publication.status, 'complete');
      assert.equal(readDecompositionRecords(f.body).assessment.status, 'story-ok');
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same owned pending operation can resume partial conflicting projections without clearing fence', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  const dir = freshUnitDir('decomposition-recovery-');
  try {
    const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
    await runtime.withPublication({ subject, publication: pub }, async (context) =>
      context.persistPublication(pub)
    );
    f.values.project.estimate = 25;
    await runtime.withPublication({ subject, publication: pub }, async (context) =>
      context.persistPublication({
        ...pub,
        effects: pub.effects.map((e) => ({ ...e, status: 'unknown' })),
      })
    );
    assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
    assert.equal(readDecompositionRecords(f.body).assessment.status, 'pending');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('same operation nesting reuses owner but foreign operation cannot inherit it', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  const dir = freshUnitDir('decomposition-nesting-');
  try {
    const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
    await runtime.withPublication({ subject, publication: pub }, async (context) => {
      await runtime.withPublication({ subject, publication: pub }, async (nested) => {
        assert.equal(nested, context);
        await nested.persistPublication(pub);
      });
      await assert.rejects(
        () =>
          runtime.withPublication(
            {
              subject,
              publication: { ...pub, operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793002' },
            },
            async () => {}
          ),
        /foreign-operation/
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('text effect observations use exact UTF8 digest convention', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest, {
    intendedInputDigest: a.inputDigest,
    proposal: { estimate: { basis: 'published', hours: 7, proposalId: null }, size: 'M' },
  });
  const { hash } = await import('./decomposition-authority-fixtures.mjs');
  pub.effects = [
    {
      ...pub.effects[0],
      resource: 'comment',
      targetIdentity: 'comment-a',
      intendedDigest: hash('published comment'),
    },
  ];
  f.deps.readPublicationEffect = async () => observed('published comment');
  const dir = freshUnitDir('decomposition-text-');
  try {
    await createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
      { subject, publication: pub },
      async (context) => {
        await context.persistPublication(pub);
        await context.persistPublication({
          ...pub,
          status: 'complete',
          effects: pub.effects.map((e) => ({
            ...e,
            status: 'confirmed',
            observedDigest: e.intendedDigest,
          })),
        });
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('owner cannot erase unresolved intent by marking the old operation superseded', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  f.deps.readPublicationEffect = async () => observed(7);
  const { hash } = await import('./decomposition-authority-fixtures.mjs');
  const dir = freshUnitDir('decomposition-supersede-');
  try {
    await createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
      { subject, publication: pub },
      async (context) => {
        await context.persistPublication(pub);
        await assert.rejects(
          () =>
            context.persistPublication({
              ...pub,
              status: 'superseded',
              effects: pub.effects.map((e) => ({
                ...e,
                status: 'failed',
                observedDigest: hash(7),
              })),
            }),
          /supersession/
        );
        assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('new linked pending revision supersedes only after read-back reconciles original effects', async (t) => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  const { hash } = await import('./decomposition-authority-fixtures.mjs');
  const dir = freshUnitDir('decomposition-supersede-');
  try {
    const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
    await runtime.withPublication({ subject, publication: pub }, async (context) =>
      context.persistPublication(pub)
    );
    const stored = readDecompositionRecords(f.body).publication;
    const next = {
      ...pub,
      // Cancellation is a registered successor that can reconcile a failed predecessor effect.
      writerId: 'cancel-plan',
      operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793002',
      intendedInputDigest: a.inputDigest,
      proposal: {
        estimate: { basis: 'proposed', hours: 7, proposalId: 'replacement-a' },
        size: 'M',
      },
      effects: pub.effects.map((e) => ({ ...e, intendedDigest: hash(7) })),
      supersedes: {
        operationId: pub.operationId,
        effects: stored.effects.map((e) =>
          e.id === 'authority-context'
            ? { ...e, status: 'confirmed', observedDigest: e.intendedDigest }
            : { ...e, status: 'failed', observedDigest: hash(7) }
        ),
      },
    };
    await t.test(
      'a linked inflation without actor admission preserves the predecessor',
      async () => {
        const inflation = { ...next, writerId: 'inflate-estimate' };
        const writes = f.writes.length;
        f.deps.readPublicationEffect = async () => observed(7);
        await assert.rejects(
          () =>
            runtime.withPublication({ subject, publication: inflation }, (context) =>
              context.persistPublication(inflation)
            ),
          { message: 'decomposition:inflation-reconciliation-actor-required' }
        );
        assert.equal(f.writes.length, writes);
        assert.deepEqual(readDecompositionRecords(f.body).publication, stored);
      }
    );
    f.deps.readPublicationEffect = async () => observed(8);
    await assert.rejects(
      () =>
        runtime.withPublication({ subject, publication: next }, async (context) =>
          context.persistPublication(next)
        ),
      /effect-read-back/
    );
    assert.equal(readDecompositionRecords(f.body).publication.operationId, pub.operationId);
    f.deps.readPublicationEffect = async () => observed(7);
    let interrupted = false;
    f.deps.readBackIssue = async () => {
      const current = readDecompositionRecords(f.body).publication;
      if (!interrupted && current?.operationId === next.operationId) {
        interrupted = true;
        throw Error('interrupted successor context confirmation');
      }
      return observed({ number: subject.issue, body: f.body });
    };
    await assert.rejects(
      () =>
        runtime.withPublication({ subject, publication: next }, async (context) =>
          context.persistPublication(next)
        ),
      /projection-read-back/
    );
    assert.equal(
      readDecompositionRecords(f.body).publication.effects.find((e) => e.id === 'authority-context')
        .status,
      'pending'
    );
    assert.equal(readDecompositionRecords(f.body).publication.operationId, next.operationId);
    assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
    assert.equal(
      readDecompositionRecords(f.body).publication.supersedes.operationId,
      pub.operationId
    );
    const successor = readDecompositionRecords(f.body).publication;
    await runtime.withPublication({ subject, publication: successor }, async (context) => {
      const { assertDecompositionPublicationOwner } =
        await import('../../../../task-tracker/lib/decomposition-projection.mjs');
      await context.persistPublication(context.publication());
      await assertDecompositionPublicationOwner(context, {
        subject,
        effectId: 'estimate',
        requireIntent: true,
      });
      await context.persistPublication(context.publication());
    });
    assert.equal(
      readDecompositionRecords(f.body).publication.supersedes.operationId,
      pub.operationId
    );
    const forged = structuredClone(readDecompositionRecords(f.body).publication);
    forged.supersedes.operationId = 'b41d3bf2-e26e-477e-88d1-b2db32793999';
    await assert.rejects(
      () => runtime.withPublication({ subject, publication: forged }, async () => {}),
      /publication-drift/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registered writer owner assertion rejects forged expired or pre-intent effect contexts', async () => {
  const { assertDecompositionPublicationOwner } =
    await import('../../../../task-tracker/lib/decomposition-projection.mjs');
  assert.equal(typeof assertDecompositionPublicationOwner, 'function');
  await assert.rejects(
    () =>
      assertDecompositionPublicationOwner(
        { subject, role: 'owner' },
        { subject, requireIntent: true }
      ),
    /owner-context/
  );
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  let captured;
  const dir = freshUnitDir('decomposition-assert-');
  try {
    await createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
      { subject, publication: pub },
      async (context) => {
        captured = context;
        await assert.rejects(
          () =>
            assertDecompositionPublicationOwner(context, {
              subject,
              operationId: pub.operationId,
              requireIntent: true,
              effectId: 'estimate',
            }),
          /intent/
        );
        await context.persistPublication(pub);
        await assertDecompositionPublicationOwner(context, {
          subject,
          operationId: pub.operationId,
          writerId: 'inflate-estimate',
          requireIntent: true,
          effectId: 'estimate',
        });
        await assert.rejects(
          () =>
            assertDecompositionPublicationOwner(context, {
              subject: { ...subject, issue: 999 },
              requireIntent: true,
            }),
          /owner-context/
        );
      }
    );
    await assert.rejects(
      () => assertDecompositionPublicationOwner(captured, { subject, requireIntent: true }),
      /owner-context/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review regression: nested caller proposal cannot mutate sealed pending manifest', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  const dir = freshUnitDir('review-owner-');
  try {
    await createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
      { subject, publication: pub },
      async (context) => {
        await context.persistPublication(pub);
        pub.proposal.estimate.hours = 7;
        await assert.rejects(() => context.persistPublication(pub), /manifest-drift/);
        assert.equal(readDecompositionRecords(f.body).publication.proposal.estimate.hours, 25);
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('review regression: unknown claimed predecessor cannot mint supersession evidence', async () => {
  const f = fixture();
  const a = await collect(f);
  const { hash } = await import('./decomposition-authority-fixtures.mjs');
  const pub = publication(a.inputDigest, {
    supersedes: {
      operationId: 'b41d3bf2-e26e-477e-88d1-b2db32793000',
      effects: [
        {
          id: 'old-estimate',
          resource: 'project-estimate',
          targetIdentity: 'PVTI_a',
          intendedDigest: hash(25),
          status: 'failed',
          observedDigest: hash(7),
        },
      ],
    },
  });
  const dir = freshUnitDir('review-owner-');
  try {
    await assert.rejects(
      () =>
        createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
          { subject, publication: pub },
          async (context) => context.persistPublication(pub)
        ),
      /predecessor/
    );
    assert.equal(f.writes.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
for (const point of ['resume', 'active', 'refresh']) {
  test(`review regression: changed scope before ${point} cannot authorize original effects`, async () => {
    const f = fixture();
    const a = await collect(f);
    const pub = publication(a.inputDigest);
    const { assertDecompositionPublicationOwner } =
      await import('../../../../task-tracker/lib/decomposition-projection.mjs');
    let effects = 0;
    const dir = freshUnitDir('review-owner-');
    try {
      const runtime = createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps });
      if (point === 'active')
        await assert.rejects(
          () =>
            runtime.withPublication({ subject, publication: pub }, async (context) => {
              await context.persistPublication(pub);
              f.body = f.body.replace('Collect current authority.', 'Changed delivery scope.');
              await assertDecompositionPublicationOwner(context, {
                subject,
                requireIntent: true,
                effectId: 'estimate',
              });
              effects++;
            }),
          /semantic|context|scope/
        );
      else {
        await runtime.withPublication({ subject, publication: pub }, async (context) =>
          context.persistPublication(pub)
        );
        f.body = f.body.replace('Collect current authority.', 'Changed delivery scope.');
        if (point === 'refresh') await run(f);
        await assert.rejects(
          () =>
            runtime.withPublication({ subject, publication: pub }, async (context) => {
              await assertDecompositionPublicationOwner(context, {
                subject,
                requireIntent: true,
                effectId: 'estimate',
              });
              effects++;
            }),
          /semantic|context|scope/
        );
      }
      assert.equal(effects, 0);
      assert.equal(readDecompositionRecords(f.body).publication.status, 'pending');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('authority context reserves one effect slot and rejects caller collisions before intent', async () => {
  for (const variant of ['capacity', 'collision']) {
    const f = fixture();
    const a = await collect(f);
    const pub = publication(a.inputDigest);
    pub.effects =
      variant === 'capacity'
        ? Array.from({ length: 32 }, (_, index) => ({ ...pub.effects[0], id: `effect-${index}` }))
        : [{ ...pub.effects[0], id: 'authority-context' }];
    const dir = freshUnitDir('binding-limit-');
    try {
      await assert.rejects(
        () =>
          createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
            { subject, publication: pub },
            async (context) => context.persistPublication(pub)
          ),
        /capacity|collision/
      );
      assert.equal(f.writes.length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
test('package context read-back cannot be confirmed by a generic effect observer', async () => {
  const f = fixture();
  const a = await collect(f);
  const pub = publication(a.inputDigest);
  const observedIds = [];
  f.deps.readPublicationEffect = async ({ effect }) => {
    observedIds.push(effect.id);
    return observed(7);
  };
  const dir = freshUnitDir('binding-proof-');
  try {
    await createDecompositionRuntime({ cfg, projectDir: dir, deps: f.deps }).withPublication(
      { subject, publication: pub },
      async (context) => {
        await context.persistPublication(pub);
        const stored = context.publication();
        const binding = stored.effects.find((effect) => effect.id === 'authority-context');
        assert.equal(binding.status, 'confirmed');
        assert.equal(binding.observedDigest, binding.intendedDigest);
        assert.deepEqual(observedIds, []);
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
