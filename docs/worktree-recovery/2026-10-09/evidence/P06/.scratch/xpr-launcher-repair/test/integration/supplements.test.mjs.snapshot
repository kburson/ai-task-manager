import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import * as api from '../helpers/internal-api.mjs';
import { parseResponse } from '../../src/collateral/responses.mjs';
import { resolveReviewPaths } from '../../src/collateral/paths.mjs';
import { createGitRepository } from '../../src/git/repository.mjs';
import { inspectReview } from '../../src/protocol/service.mjs';
import {
  budgetIntervention,
  fixture,
  replaceSection,
  signedGrant,
} from '../helpers/intervention-fixture.mjs';

test('supplement bytes are normalized, frozen, and acknowledged by the next targeted draft', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'supplement-intervention');
  const repository = createGitRepository();
  const state = inspectReview(review.started.paths.workspace);
  const physicalRoot = state.protocol.startup.context.repository_root;
  const resolved = resolveReviewPaths({
    root: physicalRoot,
    reviewsRoot: state.protocol.startup.context.reviews_root,
    reviewPathTemplate: state.protocol.startup.context.review_path_template,
    issue: state.protocol.startup.context.issue,
    kind: state.protocol.startup.context.artifact_kind,
    name: state.protocol.startup.context.artifact_name,
    date: state.protocol.startup.context.review_date,
    reviewId: state.protocol.review_id,
  });
  const responseRelative = resolved.reviewerResponse(2).relative;
  const initialBoundary = state.protocol.reviewer_boundary;
  assert.deepEqual(repository.reviewerBoundary(fx.root, responseRelative), initialBoundary);
  const source = path.join(review.started.paths.workspace, 'supplement-source.md');
  writeFileSync(source, 'Cafe\u0301\r\nEvidence\r\n');
  const normalized = Buffer.from('Café\nEvidence\n');
  const digest = `sha256:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(normalized).digest('hex'))}`;
  const parameters = {
    content_digest: digest,
    target_role: 'reviewer',
    target_turn: 2,
  };
  const supplementGrant = await signedGrant(
    review.started.paths.workspace,
    'supplement',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const registered = await api.registerSupplement({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    file: source,
    forRole: 'reviewer',
    grant: supplementGrant,
    now: '2026-09-09T02:04:00.000Z',
  });
  assert.deepEqual(readFileSync(registered.paths.supplement), normalized);

  const continueParameters = {
    additional_turns: 1,
    resulting_effective_maximum: 2,
    resume_role: 'reviewer',
    focus_path: null,
    focus_digest: null,
  };
  const continueGrant = await signedGrant(
    review.started.paths.workspace,
    'continue',
    continueParameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:05:00.000Z'
  );
  const continued = await api.continueReview({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    grant: continueGrant,
    now: '2026-09-09T02:06:00.000Z',
  });
  assert.deepEqual(
    parseResponse(readFileSync(continued.paths.response)).metadata.acknowledged_supplement_ids,
    [registered.review.supplement.supplement_id]
  );
  assert.equal(
    path.relative(physicalRoot, continued.paths.response).split(path.sep).join('/'),
    responseRelative
  );
  assert.deepEqual(
    repository.reviewerBoundary(fx.root, responseRelative),
    inspectReview(review.started.paths.workspace).protocol.reviewer_boundary
  );
  replaceSection(continued.paths.response, 'Summary', 'Supplement considered.');
  replaceSection(continued.paths.response, 'Findings', 'None.');
  replaceSection(continued.paths.response, 'Required changes', 'None.');
  replaceSection(continued.paths.response, 'Optional suggestions', 'None.');
  replaceSection(continued.paths.response, 'Decision', 'accepted');
  await api.submitReviewTurn({
    cwd: fx.root,
    workspace: review.started.paths.workspace,
    identity: review.reviewer,
    decision: 'accepted',
    now: '2026-09-09T02:07:00.000Z',
  });
  assert.equal(
    inspectReview(review.started.paths.workspace).protocol.supplements[0].acknowledged_at,
    '2026-09-09T02:07:00.000Z'
  );
});

test('supplement output collision fails before protected authority is consumed', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const review = await budgetIntervention(fx.root, 'supplement-collision-intervention');
  const source = path.join(review.started.paths.workspace, 'supplement-collision-source.md');
  const bytes = Buffer.from('Authorized evidence.\n');
  writeFileSync(source, bytes);
  const digest = `sha256:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(bytes).digest('hex'))}`;
  const parameters = {
    content_digest: digest,
    target_role: 'reviewer',
    target_turn: 2,
  };
  const grant = await signedGrant(
    review.started.paths.workspace,
    'supplement',
    parameters,
    review.fixtureId,
    review.author,
    '2026-09-09T02:03:00.000Z'
  );
  const supplementDirectory = path.join(review.started.paths.workspace, 'supplements');
  mkdirSync(supplementDirectory, { recursive: true });
  const supplementId = `supplement-${digest.slice('sha256:'.length, 'sha256:'.length + 16)}-reviewer-2`;
  writeFileSync(path.join(supplementDirectory, `${supplementId}.md`), 'conflicting bytes\n');
  const eventBytes = readFileSync(review.started.paths.events);
  await assert.rejects(
    api.registerSupplement({
      cwd: fx.root,
      workspace: review.started.paths.workspace,
      file: source,
      forRole: 'reviewer',
      grant,
      now: '2026-09-09T02:04:00.000Z',
    }),
    (error) => error.code === 'APR_OUTPUT_COLLISION'
  );
  assert.deepEqual(readFileSync(review.started.paths.events), eventBytes);
});
