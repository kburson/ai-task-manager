import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResponseDraft,
  parseResponse,
  reserveCollateral,
  sealResponse,
} from '../../src/collateral/responses.mjs';
import { resolveReviewPaths } from '../../src/collateral/paths.mjs';
import { participant } from '../helpers/review-fixture.mjs';

const NOW = '2026-09-08T12:00:00.000Z';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-responses-'));
  const paths = resolveReviewPaths({
    root,
    reviewsRoot: 'docs/reviews',
    reviewPathTemplate: '<kind>/<date>-<name>-<review-id>',
    kind: 'spec',
    name: 'example',
    date: '2026-09-08',
    reviewId: 'review-01',
  });
  const review = {
    protocol: {
      review_id: 'review-01',
      state: 'reviewer-turn',
      commit_mode: 'normal',
      max_turns: 2,
      turns_used: 0,
      claims: {
        author: {
          session_fingerprint: participant('author').session_fingerprint,
          claimed_at: NOW,
        },
        reviewer: {
          session_fingerprint: participant('reviewer').session_fingerprint,
          claimed_at: NOW,
        },
      },
      artifact: {
        path: 'docs/example.md',
        head: '1'.repeat(40),
        blob: '2'.repeat(40),
        digest: `sha256:${'3'.repeat(64)}`,
      },
    },
    participants: {
      author: participant('author'),
      reviewer: participant('reviewer'),
    },
    paths,
    now: NOW,
    prior_finding_ids: [],
    pending_finding_ids: [],
    sealed_responses: [],
  };
  return { root, review, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function fillReviewer(
  bytes,
  { findings = '', optional = '', decision = 'revisions-requested' } = {}
) {
  return bytes
    .toString()
    .replace('<!-- Write the review summary. -->', 'The artifact needs focused revision.')
    .replace('<!-- List numbered findings or write None. -->', findings || 'None.')
    .replace('<!-- List required changes or write None. -->', 'Address the numbered findings.')
    .replace('<!-- List numbered optional suggestions or write None. -->', optional || 'None.')
    .replace('<!-- Write revisions-requested or accepted. -->', decision);
}

function fillAuthor(bytes) {
  return bytes
    .toString()
    .replace('<!-- Summarize the revision. -->', 'Addressed the review.')
    .replace('<!-- Disposition every sealed finding ID. -->', 'R1-F001 — fixed')
    .replace('<!-- Describe changes made. -->', 'Updated the artifact.')
    .replace('<!-- Explain declined changes or write None. -->', 'None.')
    .replace('<!-- Record verification performed. -->', 'Focused tests passed.');
}

test('response schema is closed and drafts derive protected metadata from review authority', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const schema = JSON.parse(
    readFileSync(new URL('../../schemas/response-v1.json', import.meta.url), 'utf8')
  );
  assert.equal(schema.$id, 'ai-peer-review.response/v1');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.agent.additionalProperties, false);
  const decision = JSON.parse(
    readFileSync(new URL('../../schemas/human-decision-v1.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(decision.examples[0].unresolved_findings[0].finding_ids, ['R1-F002']);

  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  assert.equal(draft.path, fx.review.paths.reviewerResponse(1).absolute);
  const parsed = parseResponse(draft.bytes);
  assert.equal(parsed.metadata.review_id, 'review-01');
  assert.equal(parsed.metadata.role, 'reviewer');
  assert.equal(parsed.metadata.turn, 1);
  assert.equal(parsed.metadata.artifact_path, 'docs/example.md');
  assert.equal(parsed.metadata.artifact_commit, '1'.repeat(40));
  assert.equal(
    parsed.metadata.agent.session_fingerprint,
    fx.review.participants.reviewer.session_fingerprint
  );
  assert.equal(parsed.metadata.submitted_at, null);
  assert.deepEqual(
    parsed.sections.map(({ heading }) => heading),
    ['Summary', 'Findings', 'Required changes', 'Optional suggestions', 'Decision']
  );
});

test('reviewer sealing preserves one ordered finding sequence across required and optional sections', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  writeFileSync(
    draft.path,
    fillReviewer(draft.bytes, {
      findings: '### R1-F001 — Broken invariant\n\nThe invariant can drift.',
      optional: '### R1-F002 — Clearer naming\n\nConsider a narrower name.',
    })
  );
  const refreshedIdentity = {
    ...fx.review.participants.reviewer,
    model_id: 'gpt-test-refreshed',
    model_display: 'GPT Test Refreshed',
  };
  const sealed = sealResponse(fx.review, draft.path, refreshedIdentity);
  assert.deepEqual(sealed.finding_ids, ['R1-F001', 'R1-F002']);
  assert.match(sealed.digest, /^sha256:[0-9a-f]{64}$/);
  const sealedMetadata = parseResponse(readFileSync(draft.path)).metadata;
  assert.equal(sealedMetadata.submitted_at, NOW);
  assert.equal(sealedMetadata.agent.model_id, 'gpt-test-refreshed');

  const retryReview = { ...fx.review, sealed_responses: [sealed] };
  assert.deepEqual(sealResponse(retryReview, draft.path, refreshedIdentity), sealed);
  assert.deepEqual(createResponseDraft(retryReview, 'reviewer', 1).bytes, readFileSync(draft.path));
});

test('sealing rejects protected metadata edits and every unstable finding-ID shape', (t) => {
  const cases = [
    ['### Missing ID', 'None.'],
    ['### R2-F001 — Wrong turn', 'None.'],
    ['### R1-F002 — Gap', 'None.'],
    ['### R1-F001 —    ', 'None.'],
    ['### R1-F001 — First\n\n### R1-F001 — Duplicate', 'None.'],
    ['### R1-F001 — Reused', 'None.', ['R1-F001']],
  ];
  for (const [findings, optional, prior = []] of cases) {
    const fx = fixture();
    t.after(fx.cleanup);
    fx.review.prior_finding_ids = prior;
    const draft = createResponseDraft(fx.review, 'reviewer', 1);
    writeFileSync(draft.path, fillReviewer(draft.bytes, { findings, optional }));
    assert.throws(
      () => sealResponse(fx.review, draft.path, fx.review.participants.reviewer),
      (error) => error.code === 'APR_RESPONSE_INVALID'
    );
  }

  const fx = fixture();
  t.after(fx.cleanup);
  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  writeFileSync(
    draft.path,
    draft.bytes.toString().replace('review_id: "review-01"', 'review_id: "other"')
  );
  assert.throws(
    () => sealResponse(fx.review, draft.path, fx.review.participants.reviewer),
    (error) => error.code === 'APR_PROTECTED_METADATA_CHANGED'
  );

  const forged = fixture();
  t.after(forged.cleanup);
  const forgedDraft = createResponseDraft(forged.review, 'reviewer', 1);
  const replacements = [
    ['review_id: "review-01"', 'review_id: "forged-review"'],
    ['artifact_path: "docs/example.md"', 'artifact_path: "docs/forged.md"'],
    [`artifact_digest: "sha256:${'3'.repeat(64)}"`, `artifact_digest: "sha256:${'4'.repeat(64)}"`],
  ];
  let forgedBytes = forgedDraft.bytes.toString();
  for (const [before, after] of replacements) forgedBytes = forgedBytes.replace(before, after);
  writeFileSync(forgedDraft.path, fillReviewer(forgedBytes, { decision: 'accepted' }));
  const registry = path.join(forged.review.paths.scratch.absolute, 'responses/reviewer-1.json');
  const forgedRegistry = JSON.parse(readFileSync(registry, 'utf8'));
  forgedRegistry.review_id = 'forged-review';
  forgedRegistry.artifact_path = 'docs/forged.md';
  forgedRegistry.artifact_digest = `sha256:${'4'.repeat(64)}`;
  forgedRegistry.started_at = '2000-01-01T00:00:00.000Z';
  forgedBytes = readFileSync(forgedDraft.path, 'utf8').replace(
    `started_at: "${NOW}"`,
    'started_at: "2000-01-01T00:00:00.000Z"'
  );
  writeFileSync(forgedDraft.path, forgedBytes);
  writeFileSync(registry, `${JSON.stringify(forgedRegistry, null, 2)}\n`);
  assert.throws(
    () => sealResponse(forged.review, forgedDraft.path, forged.review.participants.reviewer),
    (error) => error.code === 'APR_PROTECTED_METADATA_CHANGED'
  );

  const started = fixture();
  t.after(started.cleanup);
  const startedDraft = createResponseDraft(started.review, 'reviewer', 1);
  writeFileSync(
    startedDraft.path,
    fillReviewer(
      startedDraft.bytes
        .toString()
        .replace(`started_at: "${NOW}"`, 'started_at: "2000-01-01T00:00:00.000Z"'),
      { decision: 'accepted' }
    )
  );
  const startedRegistryPath = path.join(
    started.review.paths.scratch.absolute,
    'responses/reviewer-1.json'
  );
  const startedRegistry = JSON.parse(readFileSync(startedRegistryPath, 'utf8'));
  startedRegistry.started_at = '2000-01-01T00:00:00.000Z';
  writeFileSync(startedRegistryPath, `${JSON.stringify(startedRegistry, null, 2)}\n`);
  assert.throws(
    () => sealResponse(started.review, startedDraft.path, started.review.participants.reviewer),
    (error) => error.code === 'APR_PROTECTED_METADATA_CHANGED'
  );
});

test('response turns are derived from event state and cannot be caller-selected', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  assert.throws(
    () => createResponseDraft(fx.review, 'reviewer', 999),
    (error) => error.code === 'APR_RESPONSE_INVALID'
  );
  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  const forgedPath = fx.review.paths.reviewerResponse(999).absolute;
  const forgedRegistry = path.join(fx.review.paths.scratch.absolute, 'responses/reviewer-999.json');
  mkdirSync(path.dirname(forgedPath), { recursive: true });
  mkdirSync(path.dirname(forgedRegistry), { recursive: true });
  writeFileSync(
    forgedPath,
    fillReviewer(draft.bytes.toString().replace('turn: 1', 'turn: 999'), {
      decision: 'accepted',
    })
  );
  const registry = JSON.parse(
    readFileSync(path.join(fx.review.paths.scratch.absolute, 'responses/reviewer-1.json'), 'utf8')
  );
  registry.turn = 999;
  writeFileSync(forgedRegistry, `${JSON.stringify(registry, null, 2)}\n`);
  assert.throws(
    () => sealResponse(fx.review, forgedPath, fx.review.participants.reviewer),
    (error) => error.code === 'APR_RESPONSE_INVALID'
  );

  fx.review.protocol.turns_used = 1;
  fx.review.protocol.state = 'author-revision';
  assert.throws(
    () => createResponseDraft(fx.review, 'author', 2),
    (error) => error.code === 'APR_RESPONSE_INVALID'
  );
  assert.equal(createResponseDraft(fx.review, 'author', 1).metadata.turn, 1);
});

test('Markdown parsing ignores fenced examples and author dispositions exactly cover pending IDs', (t) => {
  const reviewer = fixture();
  t.after(reviewer.cleanup);
  const reviewerDraft = createResponseDraft(reviewer.review, 'reviewer', 1);
  writeFileSync(
    reviewerDraft.path,
    fillReviewer(reviewerDraft.bytes, {
      findings:
        '<!-- note -->### R1-F001 — Not a heading\n\n<!--\n### R1-F002 — Hidden\n-->\n\n```markdown <!-- note -->\n### R1-F003 — Example only\n````` not-a-close\n### R1-F004 — Still fenced\n```',
      decision: 'accepted',
    })
  );
  assert.deepEqual(
    sealResponse(reviewer.review, reviewerDraft.path, reviewer.review.participants.reviewer)
      .finding_ids,
    []
  );

  for (const dispositions of [
    'None.',
    'R1-F001 — fixed\nR1-F001 — fixed again',
    'R1-F002 — unknown',
  ]) {
    const author = fixture();
    t.after(author.cleanup);
    author.review.protocol.state = 'author-revision';
    author.review.protocol.turns_used = 1;
    author.review.pending_finding_ids = ['R1-F001'];
    const draft = createResponseDraft(author.review, 'author', 1);
    writeFileSync(draft.path, fillAuthor(draft.bytes).replace('R1-F001 — fixed', dispositions));
    assert.throws(
      () => sealResponse(author.review, draft.path, author.review.participants.author),
      (error) => error.code === 'APR_RESPONSE_INVALID'
    );
  }
});

test('CRLF response drafts parse and seal portably', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  writeFileSync(
    draft.path,
    fillReviewer(draft.bytes, { decision: 'accepted' }).replaceAll('\n', '\r\n')
  );
  const sealed = sealResponse(fx.review, draft.path, fx.review.participants.reviewer);
  assert.deepEqual(sealed.finding_ids, []);
  assert.match(readFileSync(draft.path, 'utf8'), /\r\n---\r\n/);
});

test('author drafts seal exactly the preceding reviewer finding set', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  fx.review.protocol.state = 'author-revision';
  fx.review.protocol.turns_used = 1;
  fx.review.pending_finding_ids = ['R1-F001'];
  const draft = createResponseDraft(fx.review, 'author', 1);
  writeFileSync(draft.path, fillAuthor(draft.bytes));
  const sealed = sealResponse(fx.review, draft.path, fx.review.participants.author);
  assert.deepEqual(sealed.answered_finding_ids, ['R1-F001']);
  assert.deepEqual(sealed.finding_ids, []);
});

test('draft creation never overwrites a conflicting tracked response', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const target = fx.review.paths.reviewerResponse(1).absolute;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, 'foreign bytes', { flag: 'wx' });
  const before = readFileSync(target);
  assert.throws(
    () => createResponseDraft(fx.review, 'reviewer', 1),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.deepEqual(readFileSync(target), before);

  const linked = fixture();
  t.after(linked.cleanup);
  const linkedTarget = linked.review.paths.reviewerResponse(1).absolute;
  const outside = path.join(linked.root, 'outside.md');
  mkdirSync(path.dirname(linkedTarget), { recursive: true });
  writeFileSync(outside, 'outside bytes');
  symlinkSync(outside, linkedTarget);
  assert.throws(
    () => createResponseDraft(linked.review, 'reviewer', 1),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.equal(readFileSync(outside, 'utf8'), 'outside bytes');

  const atomic = fixture();
  t.after(atomic.cleanup);
  const created = createResponseDraft(atomic.review, 'reviewer', 1);
  assert.deepEqual(readdirSync(path.dirname(created.path)), [path.basename(created.path)]);
});

test('only the event-authorized role may create or resume an unsealed draft', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const draft = createResponseDraft(fx.review, 'reviewer', 1);
  const edited = fillReviewer(draft.bytes, { decision: 'accepted' });
  writeFileSync(draft.path, edited);
  assert.equal(
    createResponseDraft(
      { ...fx.review, now: '2026-09-08T13:00:00.000Z' },
      'reviewer',
      1
    ).bytes.toString(),
    edited
  );
  fx.review.protocol.claims.reviewer = {
    ...fx.review.protocol.claims.reviewer,
    claimed_at: '2026-09-08T14:00:00.000Z',
  };
  assert.equal(
    createResponseDraft(
      { ...fx.review, now: '2026-09-08T14:00:00.000Z' },
      'reviewer',
      1
    ).bytes.toString(),
    edited
  );
  assert.doesNotThrow(() =>
    sealResponse(
      { ...fx.review, now: '2026-09-08T14:00:00.000Z' },
      draft.path,
      fx.review.participants.reviewer
    )
  );
  assert.throws(
    () =>
      createResponseDraft(
        { ...fx.review, protocol: { ...fx.review.protocol, state: 'author-revision' } },
        'reviewer',
        1
      ),
    (error) => error.code === 'APR_RESPONSE_INVALID'
  );
});

test('collateral reservation is idempotent, refuses partial output, and derives foreign recovery', (t) => {
  const empty = fixture();
  t.after(empty.cleanup);
  const first = reserveCollateral(empty.review);
  assert.equal(first.paths.destination.absolute, empty.review.paths.destination.absolute);
  assert.deepEqual(reserveCollateral(empty.review).reservation, first.reservation);
  assert.equal(first.reservation.paths.length, 6);

  const partial = fixture();
  t.after(partial.cleanup);
  const partialFile = partial.review.paths.reviewerResponse(1).absolute;
  mkdirSync(path.dirname(partialFile), { recursive: true });
  writeFileSync(partialFile, 'partial foreign bytes');
  const partialBefore = readFileSync(partialFile);
  assert.throws(
    () => reserveCollateral(partial.review),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.deepEqual(readFileSync(partialFile), partialBefore);

  const foreign = fixture();
  t.after(foreign.cleanup);
  mkdirSync(path.dirname(foreign.review.paths.manifest.absolute), { recursive: true });
  writeFileSync(foreign.review.paths.manifest.absolute, 'complete foreign manifest');
  const selected = reserveCollateral(foreign.review, {
    validateForeignManifest: ({ bytes }) => ({
      complete: bytes.toString() === 'complete foreign manifest',
      review_id: 'foreign-review',
    }),
  });
  assert.match(selected.paths.destination.relative, /-recovery-review-01$/);
  assert.equal(selected.reservation.recovered_from, 'foreign-review');
  assert.equal(
    readFileSync(foreign.review.paths.manifest.absolute, 'utf8'),
    'complete foreign manifest'
  );
});
