// @story #1276 #1272

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  inspectArchive as inspectArchiveImpl,
  prepareArchive as prepareArchiveImpl,
  publishPreparedArchive as publishPreparedArchiveImpl,
  renderArchiveManifest,
} from '../../review/lib/archive.mjs';
import {
  initializedProtocol,
  processCallCounts,
  readEvents,
  runCliDirect,
  snapshotProtocol,
  temporaryRoot,
} from './co-review-fixture.mjs';

const preparedRepositories = new WeakMap();

function prepareArchive(options = {}) {
  const prepared = prepareArchiveImpl(options);
  if (options.repository) preparedRepositories.set(prepared, options.repository);
  return prepared;
}

function inspectArchive(options = {}) {
  return inspectArchiveImpl({
    ...options,
    repository: options.repository ?? preparedRepositories.get(options.prepared),
  });
}

function publishPreparedArchive(prepared, options = {}) {
  return publishPreparedArchiveImpl(prepared, {
    ...options,
    repository: options.repository ?? preparedRepositories.get(prepared),
  });
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function writeRuntime(root, dir, name, contents) {
  const relative = `${dir}/${name}`;
  writeFileSync(path.join(root, relative), contents);
  return relative;
}

async function repositoryWithArtifact({
  artifact = 'docs/artifact.md',
  contents = '# Artifact\n\nRevision one.\n',
  archiveDir,
} = {}) {
  return initializedProtocol({
    artifact,
    contents,
    maxReviewTurns: 6,
    archiveDir,
  });
}

async function acceptedConsensus(overrides = {}) {
  const fixture =
    overrides.artifact || overrides.contents || overrides.archiveDir
      ? await repositoryWithArtifact(overrides)
      : await initializedProtocol({ maxReviewTurns: 6 });
  const { api, root, options, initialCommit } = fixture;
  if (overrides.owner || overrides.reviewer) {
    const statePath = path.join(root, options.dir, 'state.json');
    const eventsPath = path.join(root, options.dir, 'events.jsonl');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.roles = {
      owner: overrides.owner ?? state.roles.owner,
      reviewer: overrides.reviewer ?? state.roles.reviewer,
    };
    const events = readEvents(root, options.dir);
    events[0].roles = state.roles;
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  }
  const owner = overrides.owner ?? 'owner-agent';
  const reviewer = overrides.reviewer ?? 'reviewer-agent';
  api.claimTurn({ cwd: root, dir: options.dir, actor: owner });
  const response = writeRuntime(
    root,
    options.dir,
    'owner-response.md',
    '# Owner response\n\nReady.\n'
  );
  const responseReference = overrides.responseAlias
    ? (() => {
        symlinkSync('.', path.join(root, options.dir, 'alias'));
        return `${options.dir}/alias/owner-response.md`;
      })()
    : response;
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: owner,
    response: responseReference,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'owner handoff',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: reviewer });
  const review = writeRuntime(root, options.dir, 'review.md', '# Review\n\nAccepted.\n');
  const state = api.handoffReviewer({
    cwd: root,
    dir: options.dir,
    actor: reviewer,
    review,
    reviewOf: initialCommit,
    decision: 'accepted',
    message: 'accepted',
  });
  assert.deepEqual(state.acceptance, {
    basis: 'reviewer-consensus',
    at: state.lastHandoff.at,
    reviewer,
  });
  return { ...fixture, state, response: responseReference, review };
}

async function goodEnoughReady({ archiveDir } = {}) {
  const fixture = await initializedProtocol({ maxReviewTurns: 2, archiveDir });
  const { api, root, options, initialCommit } = fixture;
  let commit = initialCommit;
  let answeredReview = null;
  let finalReview;
  let finalResponse;

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
    const response = writeRuntime(
      root,
      options.dir,
      `owner-response-${cycle}.md`,
      answeredReview
        ? `[finding:F-${cycle - 1}] [disposition:accepted]\nAddressed.\n`
        : '# Owner response\n\nReady.\n'
    );
    api.handoffOwner({
      cwd: root,
      dir: options.dir,
      actor: 'owner-agent',
      response,
      artifact: options.artifact,
      commit,
      answers: answeredReview,
      message: `owner handoff ${cycle}`,
    });
    finalResponse = response;
    if (cycle === 3) break;

    api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
    const review = writeRuntime(
      root,
      options.dir,
      `review-${cycle}.md`,
      `# Review\n\n[finding:F-${cycle}] Revise.\n`
    );
    api.handoffReviewer({
      cwd: root,
      dir: options.dir,
      actor: 'reviewer-agent',
      review,
      reviewOf: commit,
      decision: 'changes-requested',
      message: `review handoff ${cycle}`,
    });
    finalReview = review;
    answeredReview = review;
  }

  const statePath = path.join(root, options.dir, 'state.json');
  const eventsPath = path.join(root, options.dir, 'events.jsonl');
  const prior = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(prior.lifecycle, 'intervention-required');
  assert.equal(prior.round, 6);
  return { ...fixture, prior, finalReview, finalResponse };
}

async function acceptedGoodEnough() {
  const fixture = await goodEnoughReady();
  const { api, root, options, prior } = fixture;
  const state = api.acceptGoodEnough({
    cwd: root,
    dir: options.dir,
    humanLogin: 'kendrick',
    expectedRevision: prior.revision,
  });
  assert.equal(api.statusProtocol({ cwd: root, dir: options.dir }).integrity.ok, true);
  assert.equal(
    readEvents(root, options.dir).filter(({ type }) => type === 'human-good-enough').length,
    1
  );
  return { ...fixture, state };
}

async function consensusReady({ archiveDir, dir } = {}) {
  const fixture = await initializedProtocol({ maxReviewTurns: 2, archiveDir, dir });
  const { api, root, options, initialCommit } = fixture;
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'owner-agent' });
  const response = writeRuntime(root, options.dir, 'owner-response.md', '# Response\n\nReady.\n');
  api.handoffOwner({
    cwd: root,
    dir: options.dir,
    actor: 'owner-agent',
    response,
    artifact: options.artifact,
    commit: initialCommit,
    message: 'owner handoff',
  });
  api.claimTurn({ cwd: root, dir: options.dir, actor: 'reviewer-agent' });
  const review = writeRuntime(root, options.dir, 'review.md', '# Review\n\nAccepted.\n');
  return { ...fixture, review };
}

function archiveOptions(fixture, archiveDir = 'docs/reviews/session') {
  return {
    ...fixture.api.validatedArchiveSnapshot({ cwd: fixture.root, dir: fixture.options.dir }),
    archiveDir,
    repository: fixture.repository,
  };
}

function unreachableRepository(fixture) {
  return {
    ...fixture.repository,
    resolveReachableCommit(_root, revision) {
      return { commit: revision, reachable: false };
    },
  };
}

function output(prepared, kind) {
  return prepared.files.find((file) => file.kind === kind);
}

function materializePrepared(destination, prepared) {
  mkdirSync(destination, { recursive: true });
  for (const file of prepared.files) {
    writeFileSync(path.join(destination, file.path), Buffer.from(file.bytesBase64, 'base64'));
  }
}

function legacyCopyPrepared(prepared) {
  const legacy = structuredClone(prepared);
  delete legacy.manifest.artifact.mode;
  const manifest = output(legacy, 'manifest');
  const bytes = renderArchiveManifest(legacy.manifest);
  manifest.bytesBase64 = bytes.toString('base64');
  manifest.sha256 = sha256(bytes);
  return legacy;
}

test('reviewer consensus finalizes automatically and an unconfigured destination remains recoverable', async () => {
  const configured = await consensusReady({ archiveDir: 'docs/reviews/configured' });
  const accepted = await runCliDirect(
    [
      'handoff',
      '--dir',
      configured.options.dir,
      '--actor',
      'reviewer-agent',
      '--review',
      configured.review,
      '--review-of',
      configured.initialCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    { cwd: configured.root, repository: configured.repository }
  );
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.equal(existsSync(path.join(configured.root, 'docs/reviews/configured/README.md')), true);

  const unconfigured = await consensusReady();
  const pending = await runCliDirect(
    [
      'handoff',
      '--dir',
      unconfigured.options.dir,
      '--actor',
      'reviewer-agent',
      '--review',
      unconfigured.review,
      '--review-of',
      unconfigured.initialCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    { cwd: unconfigured.root, repository: unconfigured.repository }
  );
  assert.equal(pending.status, 4);
  assert.match(
    pending.stderr,
    /^ACCEPTED: protocol state is durable; archive publication is pending/
  );
  assert.doesNotMatch(pending.stderr, /no state changed/);
  assert.match(pending.stderr, /finalize --dir \.tmp\/review --archive-dir <tracked-repo-path>/);
  assert.equal(
    unconfigured.api.readProtocol({ cwd: unconfigured.root, dir: unconfigured.options.dir })
      .lifecycle,
    'accepted'
  );

  const finalized = await runCliDirect(
    ['finalize', '--dir', unconfigured.options.dir, '--archive-dir', 'docs/reviews/recovered'],
    { cwd: unconfigured.root, repository: unconfigured.repository }
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  const retried = await runCliDirect(
    ['finalize', '--dir', unconfigured.options.dir, '--archive-dir', 'docs/reviews/recovered'],
    { cwd: unconfigured.root, repository: unconfigured.repository }
  );
  assert.equal(retried.status, 0, retried.stderr);
  assert.equal(existsSync(path.join(unconfigured.root, 'docs/reviews/recovered/README.md')), true);

  const spaced = await consensusReady({ dir: '.tmp/review session' });
  const spacedPending = await runCliDirect(
    [
      'handoff',
      '--dir',
      spaced.options.dir,
      '--actor',
      'reviewer-agent',
      '--review',
      spaced.review,
      '--review-of',
      spaced.initialCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    { cwd: spaced.root, repository: spaced.repository }
  );
  assert.equal(spacedPending.status, 4);
  assert.match(
    spacedPending.stderr,
    /finalize --dir '\.tmp\/review session' --archive-dir <tracked-repo-path>/
  );

  const failed = await consensusReady({ archiveDir: 'docs/reviews/retry' });
  const publicationFailed = await runCliDirect(
    [
      'handoff',
      '--dir',
      failed.options.dir,
      '--actor',
      'reviewer-agent',
      '--review',
      failed.review,
      '--review-of',
      failed.initialCommit,
      '--decision',
      'accepted',
      '--message',
      'accepted',
    ],
    {
      cwd: failed.root,
      repository: failed.repository,
      archiveHooks: {
        afterWrite() {
          throw new Error('injected publication failure');
        },
      },
    }
  );
  assert.equal(publicationFailed.status, 4);
  assert.equal(
    failed.api.readProtocol({ cwd: failed.root, dir: failed.options.dir }).lifecycle,
    'accepted'
  );
  assert.match(
    publicationFailed.stderr,
    /finalize --dir \.tmp\/review --archive-dir docs\/reviews\/retry$/m
  );
});

test('good-enough acceptance is revision-checked, immutable, and requires two-sided closing evidence', async () => {
  const ready = await goodEnoughReady();
  const before = snapshotProtocol(ready.root, ready.options.dir);
  assert.throws(
    () =>
      ready.api.acceptGoodEnough({
        cwd: ready.root,
        dir: ready.options.dir,
        humanLogin: 'kendrick',
        expectedRevision: ready.prior.revision - 1,
      }),
    /co-review:revision/
  );
  assert.deepEqual(snapshotProtocol(ready.root, ready.options.dir), before);
  const accepted = ready.api.acceptGoodEnough({
    cwd: ready.root,
    dir: ready.options.dir,
    humanLogin: 'kendrick',
    expectedRevision: ready.prior.revision,
  });
  assert.deepEqual(accepted.acceptance, {
    basis: 'human-good-enough',
    at: accepted.updatedAt,
    approvedBy: 'kendrick',
  });
  const terminal = snapshotProtocol(ready.root, ready.options.dir);
  assert.throws(
    () => ready.api.claimTurn({ cwd: ready.root, dir: ready.options.dir, actor: 'owner-agent' }),
    /co-review:terminal/
  );
  assert.deepEqual(snapshotProtocol(ready.root, ready.options.dir), terminal);

  const oneSided = await initializedProtocol({ maxReviewTurns: 1 });
  oneSided.api.setMaxReviewTurns({
    cwd: oneSided.root,
    dir: oneSided.options.dir,
    requestedMax: 0,
    humanLogin: 'kendrick',
  });
  oneSided.api.claimTurn({ cwd: oneSided.root, dir: oneSided.options.dir, actor: 'owner-agent' });
  const response = writeRuntime(oneSided.root, oneSided.options.dir, 'response.md', '# Response\n');
  oneSided.api.handoffOwner({
    cwd: oneSided.root,
    dir: oneSided.options.dir,
    actor: 'owner-agent',
    response,
    artifact: oneSided.options.artifact,
    commit: oneSided.initialCommit,
    message: 'opening short circuit',
  });
  const shortState = oneSided.api.readProtocol({ cwd: oneSided.root, dir: oneSided.options.dir });
  assert.throws(
    () =>
      oneSided.api.acceptGoodEnough({
        cwd: oneSided.root,
        dir: oneSided.options.dir,
        humanLogin: 'kendrick',
        expectedRevision: shortState.revision,
      }),
    /co-review:good-enough-evidence/
  );
  const shortJson = JSON.parse(
    (
      await runCliDirect(['status', '--dir', oneSided.options.dir, '--json'], {
        cwd: oneSided.root,
        repository: oneSided.repository,
      })
    ).stdout
  );
  assert.deepEqual(
    shortJson.availableActions.map(({ kind }) => kind),
    ['continue', 'no-action']
  );
  const shortHuman = await runCliDirect(['status', '--dir', oneSided.options.dir], {
    cwd: oneSided.root,
    repository: oneSided.repository,
  });
  assert.match(
    shortHuman.stdout,
    /Good enough unavailable: a two-sided evidence pair does not exist/
  );
});

test('good-enough CLI prepares before mutation, publishes, and maps only post-acceptance failure to exit 4', async () => {
  const ready = await goodEnoughReady({ archiveDir: 'docs/reviews/good-enough-cli' });
  const finalized = await runCliDirect(
    ['finalize', '--dir', ready.options.dir, '--good-enough', '--json'],
    {
      cwd: ready.root,
      repository: ready.repository,
      resolveGitHubLoginImpl: () => 'kendrick',
    }
  );
  assert.equal(finalized.status, 0, finalized.stderr);
  const output = JSON.parse(finalized.stdout);
  assert.equal(output.state.acceptance.basis, 'human-good-enough');
  assert.equal(output.archivePublication.status, 'published');
  const humanStatus = await runCliDirect(['status', '--dir', ready.options.dir], {
    cwd: ready.root,
    repository: ready.repository,
  });
  assert.equal(humanStatus.status, 0, humanStatus.stderr);
  assert.match(
    humanStatus.stdout,
    new RegExp(`Acceptance: human-good-enough by kendrick at ${output.state.acceptance.at}`)
  );
  const retried = await runCliDirect(['finalize', '--dir', ready.options.dir], {
    cwd: ready.root,
    repository: ready.repository,
  });
  assert.equal(retried.status, 0, retried.stderr);
  assert.match(retried.stdout, /Produced: docs\/reviews\/good-enough-cli\/README\.md/);

  const failed = await goodEnoughReady({ archiveDir: 'docs/reviews/good-enough-failed' });
  const pending = await runCliDirect(['finalize', '--dir', failed.options.dir, '--good-enough'], {
    cwd: failed.root,
    repository: failed.repository,
    resolveGitHubLoginImpl: () => 'kendrick',
    archiveHooks: {
      beforeValidate() {
        throw new Error('injected publication failure');
      },
    },
  });
  assert.equal(pending.status, 4);
  assert.match(pending.stderr, /^ACCEPTED: protocol state is durable/);
  assert.equal(
    failed.api.statusProtocol({ cwd: failed.root, dir: failed.options.dir }).integrity.ok,
    true
  );

  const empty = temporaryRoot();
  const invalid = await runCliDirect(
    ['finalize', '--dir', '.tmp/missing', '--good-enough', '--unknown'],
    {
      cwd: empty,
      resolveGitHubLoginImpl: () => {
        throw new Error('identity must not run');
      },
    }
  );
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /--unknown (?:requires a value|is not valid)/);
});

test('intervention and accepted status expose state-valid finalization actions and archive completion', async () => {
  const ready = await goodEnoughReady();
  const intervention = JSON.parse(
    (
      await runCliDirect(['status', '--dir', ready.options.dir, '--json'], {
        cwd: ready.root,
        repository: ready.repository,
      })
    ).stdout
  );
  assert.deepEqual(
    intervention.availableActions.map(({ kind }) => kind),
    ['continue', 'finalize-good-enough', 'no-action']
  );
  assert.deepEqual(intervention.unresolvedFindingIds, ['F-2']);
  assert.equal(intervention.closingOwnerComplete, true);
  assert.equal(intervention.terminalEvidence.reviewerReview.path, ready.finalReview);
  assert.equal(intervention.terminalEvidence.ownerResponse.path, ready.finalResponse);

  const accepted = await acceptedConsensus({ archiveDir: 'docs/reviews/status' });
  const beforePublish = JSON.parse(
    (
      await runCliDirect(['status', '--dir', accepted.options.dir, '--json'], {
        cwd: accepted.root,
        repository: accepted.repository,
      })
    ).stdout
  );
  assert.equal(beforePublish.decisionBasis, 'reviewer-consensus');
  assert.equal(beforePublish.archive.destination, 'docs/reviews/status');
  assert.equal(beforePublish.archive.completion, 'absent');
  assert.match(
    beforePublish.nextAction,
    new RegExp(
      `finalize --dir ${path.resolve(accepted.root, accepted.options.dir)} ` +
        '--archive-dir docs/reviews/status$'
    )
  );
});

test('reachable artifacts use reference mode while preserving terminal evidence', async () => {
  const fixture = await acceptedConsensus();
  const prepared = prepareArchive(archiveOptions(fixture));
  assert.equal(prepared.status, 'absent');
  assert.deepEqual(prepared.files.map((file) => file.path).sort(), [
    'README.md',
    'artifact-r3-owner-owner-agent-response.md',
    'artifact-r3-reviewer-reviewer-agent-review.md',
  ]);
  assert.equal(prepared.manifest.artifact.mode, 'reference');
  assert.equal(prepared.manifest.artifact.archivePath, undefined);
  assert.equal(prepared.manifest.artifact.archivedSha256, undefined);
  assert.equal(output(prepared, 'artifact'), undefined);
  assert.match(
    renderArchiveManifest(prepared.manifest).toString('utf8'),
    new RegExp(`git cat-file blob ${prepared.manifest.artifact.gitBlob}`)
  );
  assert.equal(prepared.manifest.decision.basis, 'reviewer-consensus');
  assert.equal(prepared.manifest.evidence.pairRound, 3);
  assert.equal(prepared.manifest.evidence.ownerResponse.eventRound, 2);
  assert.equal(prepared.manifest.evidence.reviewerReview.eventRound, 3);
  assert.equal(
    prepared.manifest.normative,
    'The accepted artifact remains normative; the archived review and owner response are evidence.'
  );
});

test('unreachable accepted commits retain copy mode with exact artifact bytes', async () => {
  const fixture = await acceptedConsensus();
  const repository = unreachableRepository(fixture);
  const prepared = prepareArchive({
    ...archiveOptions(fixture, 'docs/reviews/copy-fallback'),
    repository,
  });
  const artifact = output(prepared, 'artifact');
  assert.equal(prepared.manifest.artifact.mode, 'copy');
  assert.ok(artifact);
  assert.equal(prepared.manifest.artifact.archivePath, artifact.path);
  assert.equal(prepared.manifest.artifact.archivedSha256, artifact.sha256);
  assert.equal(
    artifact.sha256,
    sha256(readFileSync(path.join(fixture.root, fixture.options.artifact)))
  );
});

test('archive refuses terminal event references that disagree with validated state evidence', async () => {
  for (const target of ['review', 'response']) {
    const fixture = await acceptedConsensus();
    const eventsPath = path.join(fixture.root, fixture.options.dir, 'events.jsonl');
    const events = readEvents(fixture.root, fixture.options.dir);
    const decoy = writeRuntime(
      fixture.root,
      fixture.options.dir,
      `decoy-${target}.md`,
      `# Decoy ${target}\n`
    );
    const record = { path: decoy, sha256: sha256(readFileSync(path.join(fixture.root, decoy))) };
    if (target === 'review') events.at(-1).handoff.artifacts.review = record;
    else events.find((event) => event.type === 'owner-handoff').handoff.artifacts.response = record;
    writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);

    assert.throws(
      () => prepareArchive(archiveOptions(fixture, `docs/reviews/tampered-${target}`)),
      (error) => error.code === 'archive-evidence',
      target
    );
  }
});

test('archive refuses invalid consensus provenance and evidence rounds', async () => {
  const provenance = await acceptedConsensus();
  const statePath = path.join(provenance.root, provenance.options.dir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.acceptance = {
    basis: 'reviewer-consensus',
    at: readEvents(provenance.root, provenance.options.dir).at(-1).at,
    reviewer: 'impostor',
  };
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const provenanceEventsPath = path.join(provenance.root, provenance.options.dir, 'events.jsonl');
  const provenanceEvents = readEvents(provenance.root, provenance.options.dir);
  provenanceEvents.at(-1).acceptance = state.acceptance;
  writeFileSync(
    provenanceEventsPath,
    `${provenanceEvents.map((event) => JSON.stringify(event)).join('\n')}\n`
  );
  assert.throws(
    () => prepareArchive(archiveOptions(provenance, 'docs/reviews/bad-provenance')),
    (error) => error.code === 'archive-evidence'
  );

  const rounds = await acceptedConsensus();
  const eventsPath = path.join(rounds.root, rounds.options.dir, 'events.jsonl');
  const events = readEvents(rounds.root, rounds.options.dir);
  events.find((event) => event.type === 'owner-handoff').round = 'two';
  writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  assert.throws(
    () => prepareArchive(archiveOptions(rounds, 'docs/reviews/bad-round')),
    (error) => error.code === 'archive-evidence'
  );
});

test('archive requires exhausted changes-requested evidence for human good enough', async () => {
  for (const mutation of ['accepted-review', 'remaining-budget']) {
    const fixture = await acceptedGoodEnough();
    const statePath = path.join(fixture.root, fixture.options.dir, 'state.json');
    const eventsPath = path.join(fixture.root, fixture.options.dir, 'events.jsonl');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const events = readEvents(fixture.root, fixture.options.dir);
    if (mutation === 'accepted-review') {
      events.findLast((event) => event.type === 'reviewer-handoff').handoff.decision = 'accepted';
    } else {
      state.maxReviewTurns += 1;
      state.remainingReviewTurns = 1;
      events.at(-1).maxReviewTurns = state.maxReviewTurns;
      events.at(-1).remainingReviewTurns = 1;
    }
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
    writeFileSync(eventsPath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
    assert.throws(
      () => prepareArchive(archiveOptions(fixture, `docs/reviews/${mutation}`)),
      (error) => error.code === 'archive-evidence',
      mutation
    );
  }
});

test('archive protects README and disambiguates lossy colliding identity slugs', async () => {
  const owner = 'A/B';
  const reviewer = 'a b';
  const fixture = await acceptedConsensus({
    artifact: 'docs/README.md',
    contents: '# Normative source\n',
    owner,
    reviewer,
  });
  const prepared = prepareArchive(archiveOptions(fixture, 'docs/reviews/readme-source'));
  const ownerDigest = createHash('sha256').update(owner).digest('hex').slice(0, 8);
  const reviewerDigest = createHash('sha256').update(reviewer).digest('hex').slice(0, 8);
  assert.equal(prepared.manifest.artifact.sourcePath, 'docs/README.md');
  assert.equal(
    prepared.files.some((file) => file.path === 'artifact-README.md'),
    false
  );
  assert.ok(
    prepared.files.some((file) => file.path.includes(`owner-a-b-${ownerDigest}-response.md`))
  );
  assert.ok(
    prepared.files.some((file) => file.path.includes(`reviewer-a-b-${reviewerDigest}-review.md`))
  );
});

test('archive preserves an arbitrary artifact basename and returns a deeply frozen snapshot', async () => {
  const fixture = await acceptedConsensus({ artifact: 'docs/review.notes-v2.md' });
  const snapshot = fixture.api.validatedArchiveSnapshot({
    cwd: fixture.root,
    dir: fixture.options.dir,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.state), true);
  assert.equal(Object.isFrozen(snapshot.events), true);
  assert.equal(Object.isFrozen(snapshot.events.at(-1).handoff), true);
  assert.throws(() => {
    snapshot.events.at(-1).handoff.decision = 'changes-requested';
  }, TypeError);
  const prepared = prepareArchive({
    ...snapshot,
    archiveDir: 'docs/reviews/arbitrary',
    repository: fixture.repository,
  });
  assert.equal(prepared.manifest.artifact.sourcePath, 'docs/review.notes-v2.md');
  assert.equal(
    prepared.files.some((file) => file.path === 'artifact-review.notes-v2.md'),
    false
  );
});

test('archive preserves the event-recorded source path through a safe runtime alias', async () => {
  const fixture = await acceptedConsensus({ responseAlias: true });
  const prepared = prepareArchive(archiveOptions(fixture, 'docs/reviews/aliased-source'));
  assert.equal(prepared.manifest.evidence.ownerResponse.sourcePath, fixture.response);
});

test('archive accepts an equivalent configured destination and refuses a different override', async () => {
  const fixture = await acceptedConsensus({ archiveDir: 'docs/reviews/configured' });
  const snapshot = fixture.api.validatedArchiveSnapshot({
    cwd: fixture.root,
    dir: fixture.options.dir,
  });
  assert.equal(
    prepareArchive({
      ...snapshot,
      archiveDir: './docs/reviews/configured',
      repository: fixture.repository,
    }).destination.relative,
    'docs/reviews/configured'
  );
  assert.throws(
    () =>
      prepareArchive({
        ...snapshot,
        archiveDir: 'docs/reviews/different',
        repository: fixture.repository,
      }),
    (error) => error.code === 'archive-destination-mismatch'
  );
});

test('publication revalidates destination containment before its first write', async () => {
  const fixture = await acceptedConsensus();
  const prepared = prepareArchive(archiveOptions(fixture, 'docs/reviews/archive'));
  const outside = temporaryRoot('aitm-co-review-archive-outside-');
  symlinkSync(outside, path.join(fixture.root, 'docs/reviews'));

  assert.throws(
    () => publishPreparedArchive(prepared),
    (error) => error.code === 'path-outside-repository'
  );
  assert.deepEqual(readdirSync(outside), []);
});

test('archive resolves the unresolved review and closing response for human good enough', async () => {
  const fixture = await acceptedGoodEnough();
  const prepared = prepareArchive(archiveOptions(fixture, 'docs/reviews/good-enough'));
  assert.equal(prepared.manifest.decision.basis, 'human-good-enough');
  assert.equal(prepared.manifest.decision.approvedBy, 'kendrick');
  assert.equal(prepared.manifest.evidence.pairRound, 6);
  assert.equal(prepared.manifest.evidence.reviewerReview.eventRound, 5);
  assert.equal(prepared.manifest.evidence.ownerResponse.eventRound, 6);
  assert.match(output(prepared, 'review').path, /-r6-reviewer-/);
  assert.match(output(prepared, 'response').path, /-r6-owner-/);
});

test('manifest bytes are canonical, uniquely marked, LF-only, and round-trip the model', async () => {
  const fixture = await acceptedConsensus();
  const prepared = prepareArchive(archiveOptions(fixture));
  const first = renderArchiveManifest(prepared.manifest);
  const second = renderArchiveManifest(structuredClone(prepared.manifest));
  assert.equal(Buffer.isBuffer(first), true);
  assert.equal(first.equals(second), true);
  const text = first.toString('utf8');
  assert.equal(text.includes('\r'), false);
  assert.equal((text.match(/aitm-co-review-manifest:start/g) ?? []).length, 1);
  assert.equal((text.match(/aitm-co-review-manifest:end/g) ?? []).length, 1);
  assert.equal((text.match(/```json/g) ?? []).length, 1);
  const matched = text.match(
    /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]+\n)```\n<!-- aitm-co-review-manifest:end -->/
  );
  assert.ok(matched);
  assert.deepEqual(JSON.parse(matched[1]), prepared.manifest);
  for (const forbidden of ['generatedAt', 'hostname', 'toolVersion', 'elapsedMs', 'supplements']) {
    assert.equal(text.includes(`\"${forbidden}\"`), false);
  }
});

test('manifest escapes reserved marker and fence tokens without changing parsed values', async () => {
  const owner = 'owner <!-- aitm-co-review-manifest:start --> ```json ```';
  const reviewer = 'reviewer <!-- aitm-co-review-manifest:end --> ```';
  const fixture = await acceptedConsensus({ owner, reviewer });
  const prepared = prepareArchive(archiveOptions(fixture, 'docs/reviews/reserved-values'));
  const text = renderArchiveManifest(prepared.manifest).toString('utf8');
  assert.equal((text.match(/aitm-co-review-manifest:start/g) ?? []).length, 1);
  assert.equal((text.match(/aitm-co-review-manifest:end/g) ?? []).length, 1);
  assert.equal((text.match(/```json/g) ?? []).length, 1);
  assert.equal((text.match(/```/g) ?? []).length, 2);
  const matched = text.match(
    /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]+\n)```\n<!-- aitm-co-review-manifest:end -->/
  );
  assert.ok(matched);
  assert.deepEqual(JSON.parse(matched[1]), prepared.manifest);
});

test('publication and inspection reject forged prepared paths before touching siblings', async () => {
  const fixture = await acceptedConsensus();
  const prepared = structuredClone(
    prepareArchive(archiveOptions(fixture, 'docs/reviews/forged-prepared'))
  );
  output(prepared, 'review').path = '../escaped-by-forged-prepared.md';
  const escaped = path.join(
    path.dirname(prepared.destination.absolute),
    'escaped-by-forged-prepared.md'
  );
  assert.throws(
    () => inspectArchive({ prepared }),
    (error) => error.code === 'archive-prepared-integrity'
  );
  assert.throws(
    () => publishPreparedArchive(prepared),
    (error) => error.code === 'archive-prepared-integrity'
  );
  assert.equal(existsSync(escaped), false);
});

test('prepared validation refuses forged reference and copy artifact guarantees', async () => {
  const referenceFixture = await acceptedConsensus();
  const reference = prepareArchive(
    archiveOptions(referenceFixture, 'docs/reviews/forged-reference')
  );
  const referenceCases = [
    ['acceptedCommit', '0'.repeat(40), 'archive-source'],
    ['sourcePath', 'docs/missing.md', 'archive-source'],
    ['gitBlob', '0'.repeat(40), 'archive-artifact-blob'],
    ['sha256', `sha256:${'0'.repeat(64)}`, 'archive-artifact-sha'],
    ['archivePath', 'artifact-artifact.md', 'archive-prepared-integrity'],
  ];
  for (const [field, value, code] of referenceCases) {
    const forged = structuredClone(reference);
    forged.manifest.artifact[field] = value;
    assert.throws(
      () => inspectArchive({ prepared: forged, repository: referenceFixture.repository }),
      (error) => error.code === code,
      field
    );
  }

  const copyFixture = await acceptedConsensus();
  const repository = unreachableRepository(copyFixture);
  const copy = prepareArchive({
    ...archiveOptions(copyFixture, 'docs/reviews/forged-copy'),
    repository,
  });
  const forgedCopy = structuredClone(copy);
  forgedCopy.manifest.artifact.gitBlob = '0'.repeat(40);
  assert.throws(
    () => inspectArchive({ prepared: forgedCopy, repository }),
    (error) => error.code === 'archive-artifact-blob'
  );
});

test('prepared validation binds every copied archive entry to its recorded source digest', async () => {
  const fixture = await acceptedConsensus();
  const repository = unreachableRepository(fixture);
  const copy = prepareArchive({
    ...archiveOptions(fixture, 'docs/reviews/forged-copy-bytes'),
    repository,
  });
  const manifestEntry = {
    artifact: (prepared) => prepared.manifest.artifact,
    review: (prepared) => prepared.manifest.evidence.reviewerReview,
    response: (prepared) => prepared.manifest.evidence.ownerResponse,
  };

  for (const kind of Object.keys(manifestEntry)) {
    const forged = structuredClone(copy);
    const file = output(forged, kind);
    const bytes = Buffer.from(`forged ${kind}\n`);
    file.bytesBase64 = bytes.toString('base64');
    file.sha256 = sha256(bytes);
    manifestEntry[kind](forged).archivedSha256 = file.sha256;
    const manifest = output(forged, 'manifest');
    const manifestBytes = renderArchiveManifest(forged.manifest);
    manifest.bytesBase64 = manifestBytes.toString('base64');
    manifest.sha256 = sha256(manifestBytes);

    assert.throws(
      () => inspectArchive({ prepared: forged, repository }),
      (error) => error.code === 'archive-prepared-integrity',
      kind
    );
  }
});

test('publication writes the manifest last, preserves inputs and repository state, and retries without rewrite', async () => {
  const fixture = await acceptedConsensus();
  const dirty = path.join(fixture.root, 'unrelated.txt');
  writeFileSync(dirty, 'leave me alone\n');
  const beforeProtocol = snapshotProtocol(fixture.root, fixture.options.dir);
  const beforeIdentity = fixture.repository.identity(fixture.root);
  const beforeArtifact = fixture.repository.trackedArtifact(fixture.root, fixture.options.artifact);
  const prepared = prepareArchive(archiveOptions(fixture));
  const writes = [];
  const published = publishPreparedArchive(prepared, {
    hooks: {
      afterWrite({ relative }) {
        writes.push(relative);
      },
    },
  });
  assert.equal(published.status, 'published');
  assert.equal(writes.at(-1), 'README.md');
  assert.deepEqual(
    readdirSync(prepared.destination.absolute).sort(),
    prepared.files.map((file) => file.path).sort()
  );
  for (const file of prepared.files) {
    assert.deepEqual(
      readFileSync(path.join(prepared.destination.absolute, file.path)),
      Buffer.from(file.bytesBase64, 'base64')
    );
  }
  assert.deepEqual(snapshotProtocol(fixture.root, fixture.options.dir), beforeProtocol);
  assert.deepEqual(fixture.repository.identity(fixture.root), beforeIdentity);
  assert.deepEqual(
    fixture.repository.trackedArtifact(fixture.root, fixture.options.artifact).index,
    beforeArtifact.index
  );
  assert.equal(readFileSync(dirty, 'utf8'), 'leave me alone\n');
  const beforeMtime = statSync(path.join(prepared.destination.absolute, 'README.md')).mtimeMs;
  assert.equal(publishPreparedArchive(prepared).status, 'complete');
  assert.equal(
    statSync(path.join(prepared.destination.absolute, 'README.md')).mtimeMs,
    beforeMtime
  );
  assert.equal(inspectArchive({ prepared }).status, 'complete');
});

test('copy publication preserves artifact and both evidence files with manifest last', async () => {
  const fixture = await acceptedConsensus();
  const repository = unreachableRepository(fixture);
  const prepared = prepareArchive({
    ...archiveOptions(fixture, 'docs/reviews/copy-publication'),
    repository,
  });
  const writes = [];
  assert.equal(
    publishPreparedArchive(prepared, {
      repository,
      hooks: { afterWrite: ({ relative }) => writes.push(relative) },
    }).status,
    'published'
  );
  assert.equal(writes.at(-1), 'README.md');
  assert.deepEqual(prepared.files.map((file) => file.kind).sort(), [
    'artifact',
    'manifest',
    'response',
    'review',
  ]);
  for (const kind of ['artifact', 'review', 'response']) {
    const file = output(prepared, kind);
    assert.deepEqual(
      readFileSync(path.join(prepared.destination.absolute, file.path)),
      Buffer.from(file.bytesBase64, 'base64')
    );
  }
  assert.equal(inspectArchive({ prepared, repository }).status, 'complete');
});

test('an exact legacy copy archive pins its existing mode and is never rewritten', async () => {
  const fixture = await acceptedConsensus();
  const copyRepository = unreachableRepository(fixture);
  const destination = 'docs/reviews/legacy-copy';
  const legacy = legacyCopyPrepared(
    prepareArchive({ ...archiveOptions(fixture, destination), repository: copyRepository })
  );
  materializePrepared(legacy.destination.absolute, legacy);
  const readme = path.join(legacy.destination.absolute, 'README.md');
  const beforeMtime = statSync(readme).mtimeMs;

  const prepared = prepareArchive(archiveOptions(fixture, destination));
  assert.equal(prepared.status, 'complete');
  assert.equal(prepared.manifest.artifact.mode, undefined);
  assert.ok(output(prepared, 'artifact'));
  assert.equal(publishPreparedArchive(prepared).status, 'complete');
  assert.equal(statSync(readme).mtimeMs, beforeMtime);
});

test('archive inspection refuses active state and every missing, extra, or different destination', async () => {
  const active = await repositoryWithArtifact();
  assert.throws(
    () => active.api.validatedArchiveSnapshot({ cwd: active.root, dir: active.options.dir }),
    (error) => error.code === 'archive-ineligible'
  );

  for (const mutation of ['empty', 'missing', 'extra', 'different']) {
    const fixture = await acceptedConsensus();
    const options = archiveOptions(fixture, `docs/reviews/conflict-${mutation}`);
    const prepared = prepareArchive(options);
    if (mutation !== 'empty') materializePrepared(prepared.destination.absolute, prepared);
    else mkdirSync(prepared.destination.absolute, { recursive: true });
    if (mutation === 'missing') {
      const missing = output(prepared, 'review').path;
      await import('node:fs').then(({ unlinkSync }) =>
        unlinkSync(path.join(prepared.destination.absolute, missing))
      );
    }
    if (mutation === 'extra')
      writeFileSync(path.join(prepared.destination.absolute, 'extra.md'), 'extra');
    if (mutation === 'different')
      writeFileSync(path.join(prepared.destination.absolute, 'README.md'), 'changed');
    const inspected = inspectArchive({ ...options, prepared });
    assert.equal(inspected.status, 'conflict', mutation);
    assert.throws(
      () => publishPreparedArchive(prepared),
      (error) => error.code === 'archive-conflict',
      mutation
    );
  }
});

test('publication leaves unique staging evidence on failures and handles rename races fail closed', async () => {
  const failed = await acceptedConsensus();
  const prepared = prepareArchive(archiveOptions(failed, 'docs/reviews/failure'));
  for (const [uuid, failRelative] of [
    ['11111111-1111-4111-8111-111111111111', output(prepared, 'review').path],
    ['22222222-2222-4222-8222-222222222222', 'README.md'],
  ]) {
    assert.throws(
      () =>
        publishPreparedArchive(prepared, {
          randomUUID: () => uuid,
          now: () => 1_700_000_000_000,
          hooks: {
            afterWrite({ relative }) {
              if (relative === failRelative) throw new Error(`injected ${relative}`);
            },
          },
        }),
      /injected/
    );
  }
  assert.throws(
    () =>
      publishPreparedArchive(prepared, {
        randomUUID: () => '33333333-3333-4333-8333-333333333333',
        now: () => 1_700_000_000_000,
        hooks: {
          beforeValidate() {
            throw new Error('injected validation');
          },
        },
      }),
    /injected validation/
  );
  assert.equal(existsSync(prepared.destination.absolute), false);
  const remnants = readdirSync(path.dirname(prepared.destination.absolute)).filter((name) =>
    name.includes('.failure.aitm-staging-')
  );
  assert.equal(remnants.length, 3);

  const emptyRace = await acceptedConsensus();
  const emptyPrepared = prepareArchive(archiveOptions(emptyRace, 'docs/reviews/empty-race'));
  assert.equal(
    publishPreparedArchive(emptyPrepared, {
      hooks: {
        beforeRename() {
          mkdirSync(emptyPrepared.destination.absolute);
        },
      },
    }).status,
    'published'
  );

  const identicalRace = await acceptedConsensus();
  const identicalPrepared = prepareArchive(
    archiveOptions(identicalRace, 'docs/reviews/identical-race')
  );
  assert.equal(
    publishPreparedArchive(identicalPrepared, {
      hooks: {
        beforeRename() {
          materializePrepared(identicalPrepared.destination.absolute, identicalPrepared);
        },
      },
    }).status,
    'complete'
  );

  const conflictRace = await acceptedConsensus();
  const conflictPrepared = prepareArchive(
    archiveOptions(conflictRace, 'docs/reviews/conflict-race')
  );
  assert.throws(
    () =>
      publishPreparedArchive(conflictPrepared, {
        hooks: {
          beforeRename() {
            mkdirSync(conflictPrepared.destination.absolute);
            writeFileSync(path.join(conflictPrepared.destination.absolute, 'other.md'), 'other');
          },
        },
      }),
    (error) => error.code === 'archive-conflict'
  );
  assert.equal(
    readFileSync(path.join(conflictPrepared.destination.absolute, 'other.md'), 'utf8'),
    'other'
  );

  const fileRace = await acceptedConsensus();
  const filePrepared = prepareArchive(archiveOptions(fileRace, 'docs/reviews/file-race'));
  assert.throws(
    () =>
      publishPreparedArchive(filePrepared, {
        hooks: {
          beforeRename() {
            writeFileSync(filePrepared.destination.absolute, 'raced file');
          },
        },
      }),
    (error) => error.code === 'archive-conflict'
  );
  assert.equal(readFileSync(filePrepared.destination.absolute, 'utf8'), 'raced file');
});

test('archive finalization corpus stays on injected in-memory repository boundaries', () => {
  assert.deepEqual(processCallCounts(), { git: 0, nodeCli: 0 });
});
