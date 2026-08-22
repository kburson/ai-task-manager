// @story #1268

import { createHash, randomUUID as systemRandomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { REAL_REPOSITORY_BOUNDARY } from './repository-boundary.mjs';

function fail(code, detail) {
  const error = new Error(`co-review:${code}:${detail}; no state changed`);
  error.code = code;
  error.exitCode = 1;
  throw error;
}

function repositoryCall(detail, operation) {
  try {
    return operation();
  } catch (error) {
    fail('git', error.stderr?.toString().trim() || detail);
  }
}

function containedPath(root, candidate, label) {
  if (!String(candidate ?? '').trim() || path.isAbsolute(candidate)) {
    fail('path-outside-repository', `${label}=${String(candidate)}`);
  }
  const absolute = path.resolve(root, candidate);
  const relative = path.relative(root, absolute);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    fail('path-outside-repository', `${label}=${candidate}`);
  }
  let existing = absolute;
  const suffix = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail('path-resolution', `${label}=${candidate}`);
    suffix.unshift(path.basename(existing));
    existing = parent;
  }
  const physical = path.resolve(realpathSync(existing), ...suffix);
  const physicalRelative = path.relative(root, physical);
  if (
    !physicalRelative ||
    physicalRelative === '..' ||
    physicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(physicalRelative)
  ) {
    fail('path-outside-repository', `${label}=${candidate}`);
  }
  return {
    absolute: physical,
    relative: physicalRelative.split(path.sep).join('/'),
    lexicalRelative: relative.split(path.sep).join('/'),
  };
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    !relative ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function resolveArchiveDestination({
  cwd = process.cwd(),
  archiveDir,
  runtimeDir,
  repository = REAL_REPOSITORY_BOUNDARY,
} = {}) {
  const root = repositoryCall(String(cwd), () => repository.repositoryRoot(cwd));
  const archive = containedPath(root, archiveDir, 'archive-dir');
  const runtime = containedPath(root, runtimeDir, 'dir');
  if (inside(runtime.absolute, archive.absolute)) {
    fail('archive-runtime-conflict', archive.relative);
  }
  const status = repositoryCall(archive.relative, () =>
    repository.runtimeStatus(root, archive.relative)
  );
  if (status.ignored) {
    fail('archive-ignored', archive.relative);
  }
  return Object.freeze(archive);
}

export function deriveRecoveryArchiveDir(configuredArchiveDir, protocolId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(protocolId))) {
    fail('archive-recovery-protocol', String(protocolId));
  }
  return `${String(configuredArchiveDir).replace(/\/$/, '')}-recovery-${protocolId}`;
}

export function assertArchiveDestinationAbsent(destination) {
  let info;
  try {
    info = lstatSync(destination.absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('archive-destination-occupied', `${destination.relative}: unreadable: ${error.message}`);
  }
  const kind = info.isSymbolicLink()
    ? 'symlink'
    : info.isDirectory()
      ? readdirSync(destination.absolute).length === 0
        ? 'empty-directory'
        : 'directory'
      : info.isFile()
        ? 'file'
        : 'special-entry';
  fail('archive-destination-occupied', `${destination.relative}: ${kind}`);
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseArchiveManifest(readmeBytes) {
  const text = readmeBytes.toString('utf8');
  const matches = [
    ...text.matchAll(
      /<!-- aitm-co-review-manifest:start -->\n```json\n([\s\S]*?\n)```\n<!-- aitm-co-review-manifest:end -->/g
    ),
  ];
  if (matches.length !== 1) fail('archive-foreign-manifest', `marker-count=${matches.length}`);
  let manifest;
  try {
    manifest = JSON.parse(matches[0][1]);
  } catch (error) {
    fail('archive-foreign-manifest', error.message);
  }
  return manifest;
}

function objectModel(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireForeign(condition, detail) {
  if (!condition) fail('archive-foreign-manifest', detail);
}

function safeArchiveBasename(value, label) {
  requireForeign(
    typeof value === 'string' &&
      value &&
      value !== '.' &&
      value !== '..' &&
      path.posix.basename(value) === value &&
      path.win32.basename(value) === value,
    `${label} path`
  );
  return value;
}

function safeRecordedPath(value, label) {
  requireForeign(
    typeof value === 'string' &&
      value &&
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/).some((segment) => !segment || segment === '.' || segment === '..'),
    `${label} path`
  );
}

function validDigest(value) {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function validateForeignEvidence(record, label) {
  requireForeign(objectModel(record), `${label} record`);
  requireForeign(
    typeof record.identity === 'string' && record.identity.trim(),
    `${label} identity`
  );
  requireForeign(Number.isInteger(record.eventRound) && record.eventRound >= 1, `${label} round`);
  safeRecordedPath(record.sourcePath, `${label} source`);
  requireForeign(validDigest(record.sourceSha256), `${label} source digest`);
  const archivePath = safeArchiveBasename(record.archivePath, `${label} archive`);
  requireForeign(validDigest(record.archivedSha256), `${label} archived digest`);
  requireForeign(record.sourceSha256 === record.archivedSha256, `${label} digest disagreement`);
  return archivePath;
}

function validateOptionalRecovery(recovery) {
  if (recovery === undefined) return;
  requireForeign(objectModel(recovery), 'recovery record');
  for (const field of [
    'configuredDestination',
    'occupiedProtocolId',
    'recoveryDestination',
    'occupiedAcceptedAt',
    'relationship',
  ]) {
    requireForeign(typeof recovery[field] === 'string' && recovery[field], `recovery ${field}`);
  }
  requireForeign(
    /^[0-9a-f-]{36}$/i.test(recovery.occupiedProtocolId),
    'recovery occupied protocol'
  );
  requireForeign(!Number.isNaN(Date.parse(recovery.occupiedAcceptedAt)), 'recovery accepted at');
  requireForeign(
    ['newer-than-occupied', 'older-than-occupied', 'same-time-as-occupied'].includes(
      recovery.relationship
    ),
    'recovery relationship'
  );
}

export function inspectForeignArchive({ root, destination, currentProtocolId }) {
  const repositoryRoot = path.resolve(String(root ?? ''));
  const destinationAbsolute = path.resolve(String(destination?.absolute ?? ''));
  if (
    !root ||
    !destination?.absolute ||
    destinationAbsolute === repositoryRoot ||
    !inside(repositoryRoot, destinationAbsolute)
  ) {
    fail('archive-foreign-directory', String(destination?.relative));
  }
  let directory;
  try {
    directory = lstatSync(destination.absolute);
  } catch (error) {
    fail('archive-foreign-directory', `${destination.relative}: ${error.message}`);
  }
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    fail('archive-foreign-directory', destination.relative);
  }

  let entries;
  try {
    entries = readdirSync(destination.absolute, { withFileTypes: true });
  } catch (error) {
    fail('archive-foreign-directory', `${destination.relative}: ${error.message}`);
  }
  const readmeEntry = entries.find((entry) => entry.name === 'README.md');
  if (!readmeEntry?.isFile() || readmeEntry.isSymbolicLink()) {
    fail('archive-foreign-file-set', 'README.md');
  }
  let readmeBytes;
  try {
    readmeBytes = readFileSync(path.join(destination.absolute, 'README.md'));
  } catch (error) {
    fail('archive-foreign-file-set', `README.md: ${error.message}`);
  }
  const manifest = parseArchiveManifest(readmeBytes);

  requireForeign(objectModel(manifest), 'root object');
  requireForeign(manifest.schema === 'aitm.co-review.archive/v1', 'schema');
  for (const field of ['protocol', 'artifact', 'participants', 'decision', 'budget', 'evidence']) {
    requireForeign(objectModel(manifest[field]), `${field} object`);
  }
  requireForeign(typeof manifest.normative === 'string' && manifest.normative, 'normative');
  requireForeign(/^[0-9a-f-]{36}$/i.test(manifest.protocol.id), 'protocol id');
  requireForeign(
    typeof manifest.protocol.schema === 'string' && manifest.protocol.schema,
    'protocol schema'
  );
  requireForeign(manifest.protocol.id !== currentProtocolId, 'same protocol');

  const mode = manifest.artifact.mode ?? 'legacy-copy';
  requireForeign(['reference', 'copy', 'legacy-copy'].includes(mode), 'artifact mode');
  safeRecordedPath(manifest.artifact.sourcePath, 'artifact source');
  requireForeign(/^[a-f0-9]{40}$/.test(manifest.artifact.acceptedCommit), 'artifact commit');
  requireForeign(/^[a-f0-9]{40}$/.test(manifest.artifact.gitBlob), 'artifact blob');
  requireForeign(validDigest(manifest.artifact.sha256), 'artifact digest');
  let artifactPath = null;
  if (mode !== 'reference') {
    artifactPath = safeArchiveBasename(manifest.artifact.archivePath, 'artifact archive');
    requireForeign(validDigest(manifest.artifact.archivedSha256), 'artifact archived digest');
    requireForeign(
      manifest.artifact.sha256 === manifest.artifact.archivedSha256,
      'artifact digest disagreement'
    );
  }

  requireForeign(
    typeof manifest.participants.owner === 'string' && manifest.participants.owner.trim(),
    'owner participant'
  );
  requireForeign(
    typeof manifest.participants.reviewer === 'string' && manifest.participants.reviewer.trim(),
    'reviewer participant'
  );
  requireForeign(manifest.decision.lifecycle === 'accepted', 'decision lifecycle');
  requireForeign(
    ['reviewer-consensus', 'human-good-enough'].includes(manifest.decision.basis),
    'decision basis'
  );
  requireForeign(!Number.isNaN(Date.parse(manifest.decision.at)), 'decision at');
  requireForeign(
    manifest.decision.basis === 'reviewer-consensus'
      ? typeof manifest.decision.reviewer === 'string' && manifest.decision.reviewer.trim()
      : typeof manifest.decision.approvedBy === 'string' && manifest.decision.approvedBy.trim(),
    'decision actor'
  );
  for (const field of ['reviewTurnsUsed', 'maxReviewTurns', 'remainingReviewTurns']) {
    requireForeign(
      Number.isInteger(manifest.budget[field]) && manifest.budget[field] >= 0,
      `budget ${field}`
    );
  }
  requireForeign(
    manifest.budget.reviewTurnsUsed + manifest.budget.remainingReviewTurns ===
      manifest.budget.maxReviewTurns,
    'budget relationship'
  );
  requireForeign(
    Number.isInteger(manifest.evidence.pairRound) && manifest.evidence.pairRound >= 1,
    'evidence pair round'
  );
  const responsePath = validateForeignEvidence(manifest.evidence.ownerResponse, 'owner response');
  const reviewPath = validateForeignEvidence(manifest.evidence.reviewerReview, 'reviewer review');
  validateOptionalRecovery(manifest.recovery);

  const required = [
    'README.md',
    responsePath,
    reviewPath,
    ...(mode === 'reference' ? [] : [artifactPath]),
  ];
  requireForeign(new Set(required).size === required.length, 'duplicate archive paths');
  const actual = entries.map((entry) => entry.name).sort();
  const expected = [...required].sort();
  if (!isDeepStrictEqual(actual, expected)) {
    fail(
      'archive-foreign-file-set',
      `expected ${expected.join(', ')}; actual ${actual.join(', ')}`
    );
  }
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      fail('archive-foreign-file-set', `non-file ${entry.name}`);
    }
  }
  const digests = [
    [responsePath, manifest.evidence.ownerResponse.archivedSha256],
    [reviewPath, manifest.evidence.reviewerReview.archivedSha256],
    ...(mode === 'reference' ? [] : [[artifactPath, manifest.artifact.archivedSha256]]),
  ];
  for (const [archivePath, expectedDigest] of digests) {
    let bytes;
    try {
      bytes = readFileSync(path.join(destination.absolute, archivePath));
    } catch (error) {
      fail('archive-foreign-file-set', `${archivePath}: ${error.message}`);
    }
    const actualDigest = digest(bytes);
    if (actualDigest !== expectedDigest) {
      fail(
        'archive-foreign-digest',
        `${archivePath}: expected ${expectedDigest}, actual ${actualDigest}`
      );
    }
  }
  return deepFreeze({
    manifest,
    protocolId: manifest.protocol.id,
    acceptedAt: manifest.decision.at,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function recordedFile(root, record, label) {
  if (!record || typeof record.path !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(record.sha256)) {
    fail('archive-evidence', `${label} record`);
  }
  const resolved = containedPath(root, record.path, label);
  let info;
  try {
    info = lstatSync(resolved.absolute);
  } catch (error) {
    fail('archive-source', `${label} ${record.path}: ${error.message}`);
  }
  if (!info.isFile() || info.isSymbolicLink()) fail('archive-source', `${label} ${record.path}`);
  const bytes = readFileSync(resolved.absolute);
  const actual = digest(bytes);
  if (actual !== record.sha256) {
    fail(
      'archive-source-drift',
      `${label} ${record.path}: expected ${record.sha256}, actual ${actual}`
    );
  }
  return { ...record, bytes };
}

function committedArtifact(root, record, repository) {
  if (
    !record ||
    typeof record.path !== 'string' ||
    !/^[a-f0-9]{40}$/.test(record.commit) ||
    !/^[a-f0-9]{40}$/.test(record.blob) ||
    !/^sha256:[a-f0-9]{64}$/.test(record.sha256)
  ) {
    fail('archive-evidence', 'authoritative artifact record');
  }
  const committed = repositoryCall(`${record.commit}:${record.path}`, () =>
    repository.committedArtifact(root, record.commit, record.path)
  );
  if (committed === null) {
    fail('archive-source', `${record.commit}:${record.path}`);
  }
  if (committed.blob !== record.blob) {
    fail(
      'archive-artifact-blob',
      `${record.path}: expected ${record.blob}, actual ${committed.blob}`
    );
  }
  const actual = digest(committed.bytes);
  if (actual !== record.sha256) {
    fail('archive-artifact-sha', `${record.path}: expected ${record.sha256}, actual ${actual}`);
  }
  return { ...record, bytes: committed.bytes };
}

function priorEvent(events, before, type) {
  for (let index = before - 1; index >= 0; index -= 1) {
    if (events[index]?.type === type) return { event: events[index], index };
  }
  return null;
}

function requireExactEvidence(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected))
    fail('archive-evidence', `${label} disagrees with state`);
}

function terminalEvidence(state, events) {
  const terminalIndex = events.length - 1;
  const terminal = events[terminalIndex];
  let owner;
  let reviewer;
  let decision;
  if (terminal?.type === 'reviewer-handoff' && terminal?.handoff?.decision === 'accepted') {
    reviewer = { event: terminal, index: terminalIndex };
    owner = priorEvent(events, terminalIndex, 'owner-handoff');
    decision = state.acceptance ?? {
      basis: 'reviewer-consensus',
      at: terminal.at,
      reviewer: state.roles?.reviewer,
    };
    if (
      decision.basis !== 'reviewer-consensus' ||
      !String(decision.reviewer || '').trim() ||
      decision.reviewer !== state.roles?.reviewer ||
      Number.isNaN(Date.parse(decision.at)) ||
      decision.at !== terminal.at
    ) {
      fail('archive-evidence', `consensus basis ${String(decision.basis)}`);
    }
  } else if (terminal?.type === 'human-good-enough') {
    owner = priorEvent(events, terminalIndex, 'owner-handoff');
    reviewer = owner ? priorEvent(events, owner.index, 'reviewer-handoff') : null;
    decision = state.acceptance ?? terminal.acceptance;
    if (
      decision?.basis !== 'human-good-enough' ||
      !String(decision.approvedBy || '').trim() ||
      Number.isNaN(Date.parse(decision.at)) ||
      decision.at !== terminal.at
    ) {
      fail('archive-evidence', 'human-good-enough provenance');
    }
  } else {
    fail('archive-ineligible', `${state.lifecycle}:${terminal?.type ?? 'no-events'}`);
  }
  if (!owner?.event?.handoff || !reviewer?.event?.handoff) {
    fail('archive-evidence', 'terminal owner/reviewer pair');
  }
  const ownerHandoff = owner.event.handoff;
  const reviewerHandoff = reviewer.event.handoff;
  if (
    ownerHandoff.from !== 'owner' ||
    reviewerHandoff.from !== 'reviewer' ||
    !ownerHandoff.artifact ||
    !ownerHandoff.artifacts?.response ||
    !reviewerHandoff.artifacts?.review
  ) {
    fail('archive-evidence', 'terminal handoff records');
  }
  if (reviewerHandoff.commit !== ownerHandoff.artifact.commit) {
    fail('archive-evidence', 'review does not reference selected owner commit');
  }
  if (owner.event.at !== ownerHandoff.at || reviewer.event.at !== reviewerHandoff.at) {
    fail('archive-evidence', 'terminal evidence timestamps');
  }
  if (
    !Number.isInteger(owner.event.round) ||
    owner.event.round < 1 ||
    !Number.isInteger(reviewer.event.round) ||
    reviewer.event.round < 1 ||
    (terminal.type === 'reviewer-handoff'
      ? owner.event.round >= reviewer.event.round
      : reviewer.event.round >= owner.event.round)
  ) {
    fail('archive-evidence', 'terminal evidence rounds');
  }
  requireExactEvidence(ownerHandoff.artifact, state.artifact, 'selected artifact');
  requireExactEvidence(
    ownerHandoff.artifacts.response,
    state.immutableArtifacts?.[ownerHandoff.artifacts.response.path],
    'owner response'
  );
  requireExactEvidence(
    reviewerHandoff.artifacts.review,
    state.immutableArtifacts?.[reviewerHandoff.artifacts.review.path],
    'reviewer review'
  );
  if (terminal.type === 'reviewer-handoff') {
    requireExactEvidence(reviewerHandoff, state.lastHandoff, 'accepting reviewer handoff');
  } else {
    if (
      reviewerHandoff.decision !== 'changes-requested' ||
      state.reviewTurnsUsed !== state.maxReviewTurns ||
      state.remainingReviewTurns !== 0 ||
      owner.event.lifecycle !== 'intervention-required' ||
      owner.event.remainingReviewTurns !== 0
    ) {
      fail('archive-evidence', 'human-good-enough requires author-completed exhaustion');
    }
    requireExactEvidence(ownerHandoff, state.lastHandoff, 'closing owner handoff');
    requireExactEvidence(
      reviewerHandoff.artifacts.review,
      ownerHandoff.artifacts.answeredReview,
      'unresolved reviewer evidence'
    );
    requireExactEvidence(terminal.acceptance, state.acceptance, 'human acceptance');
  }
  return {
    decision,
    ownerEvent: owner.event,
    reviewerEvent: reviewer.event,
    artifact: ownerHandoff.artifact,
    response: ownerHandoff.artifacts.response,
    review: reviewerHandoff.artifacts.review,
    pairRound: Math.max(owner.event.round, reviewer.event.round),
  };
}

function identityBase(identity) {
  const exact = String(identity ?? '');
  const lower = exact.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return {
    exact,
    lower,
    normalized: normalized || 'identity',
    lossy: !normalized || normalized !== lower,
  };
}

function identitySlugs(owner, reviewer) {
  const values = { owner: identityBase(owner), reviewer: identityBase(reviewer) };
  const collides = values.owner.normalized === values.reviewer.normalized;
  return Object.fromEntries(
    Object.entries(values).map(([role, value]) => {
      const suffix = createHash('sha256').update(value.exact).digest('hex').slice(0, 8);
      const slug = value.lossy || collides ? `${value.normalized}-${suffix}` : value.normalized;
      return [role, slug];
    })
  );
}

function outputFile(kind, outputPath, bytes) {
  return {
    kind,
    path: outputPath,
    sha256: digest(bytes),
    bytesBase64: bytes.toString('base64'),
  };
}

function decisionModel(decision) {
  if (decision.basis === 'reviewer-consensus') {
    return {
      lifecycle: 'accepted',
      basis: decision.basis,
      at: decision.at,
      reviewer: decision.reviewer,
    };
  }
  return {
    lifecycle: 'accepted',
    basis: decision.basis,
    at: decision.at,
    approvedBy: decision.approvedBy,
  };
}

function canReferenceArtifact(root, artifact, repository) {
  const resolved = repositoryCall(artifact.commit, () =>
    repository.resolveReachableCommit(root, artifact.commit)
  );
  return resolved.commit === artifact.commit && resolved.reachable === true;
}

function artifactManifest(artifact, mode, artifactFile) {
  const common = {
    ...(mode === 'legacy-copy' ? {} : { mode }),
    sourcePath: artifact.path,
    acceptedCommit: artifact.commit,
    gitBlob: artifact.blob,
    sha256: artifact.sha256,
  };
  return mode !== 'reference'
    ? {
        ...common,
        archivePath: artifactFile.path,
        archivedSha256: artifactFile.sha256,
      }
    : common;
}

function compareDecisionTimes(currentAcceptedAt, occupiedAcceptedAt) {
  const difference = Date.parse(currentAcceptedAt) - Date.parse(occupiedAcceptedAt);
  if (difference > 0) return 'newer-than-occupied';
  if (difference < 0) return 'older-than-occupied';
  return 'same-time-as-occupied';
}

function buildPrepared({ root, state, events, archiveDir, repository = REAL_REPOSITORY_BOUNDARY }) {
  if (!root || !state || !Array.isArray(events) || state.lifecycle !== 'accepted') {
    fail('archive-ineligible', `${state?.lifecycle ?? 'missing-state'}`);
  }
  const configured = state.initialization?.archiveDir;
  const selectedArchiveDir = archiveDir ?? configured;
  if (!selectedArchiveDir) fail('archive-dir-required', 'supply --archive-dir');
  const destination = resolveArchiveDestination({
    cwd: root,
    archiveDir: selectedArchiveDir,
    runtimeDir: state.initialization?.runtimeDir,
    repository,
  });
  const configuredDestination = configured
    ? resolveArchiveDestination({
        cwd: root,
        archiveDir: configured,
        runtimeDir: state.initialization?.runtimeDir,
        repository,
      })
    : null;
  const expectedRecovery = configured
    ? deriveRecoveryArchiveDir(configuredDestination.relative, state.protocolId)
    : null;
  const isConfigured = configuredDestination?.absolute === destination.absolute;
  const isRecovery = expectedRecovery === destination.relative;
  if (configuredDestination && !isConfigured && !isRecovery) {
    fail('archive-destination-mismatch', `${destination.relative}; configured ${configured}`);
  }
  const occupied = isRecovery
    ? inspectForeignArchive({
        root,
        destination: configuredDestination,
        currentProtocolId: state.protocolId,
      })
    : null;
  const evidence = terminalEvidence(state, events);
  const artifact = committedArtifact(root, evidence.artifact, repository);
  const response = recordedFile(root, evidence.response, 'owner-response');
  const review = recordedFile(root, evidence.review, 'reviewer-review');
  const artifactBasename = path.basename(artifact.path);
  const extension = path.extname(artifactBasename);
  const artifactStem = extension ? artifactBasename.slice(0, -extension.length) : artifactBasename;
  const slugs = identitySlugs(state.roles?.owner, state.roles?.reviewer);
  const artifactOutput = `artifact-${artifactBasename}`;
  const responseOutput = `${artifactStem}-r${evidence.pairRound}-owner-${slugs.owner}-response.md`;
  const reviewOutput = `${artifactStem}-r${evidence.pairRound}-reviewer-${slugs.reviewer}-review.md`;
  const paths = ['README.md', artifactOutput, responseOutput, reviewOutput];
  if (new Set(paths).size !== paths.length) fail('archive-name-conflict', paths.join(', '));

  const artifactFile = outputFile('artifact', artifactOutput, artifact.bytes);
  const reviewFile = outputFile('review', reviewOutput, review.bytes);
  const responseFile = outputFile('response', responseOutput, response.bytes);
  function candidate(mode) {
    const manifest = {
      schema: 'aitm.co-review.archive/v1',
      protocol: {
        id: state.protocolId,
        schema: state.schema,
      },
      artifact: artifactManifest(artifact, mode, artifactFile),
      participants: {
        owner: state.roles.owner,
        reviewer: state.roles.reviewer,
      },
      decision: decisionModel(evidence.decision),
      budget: {
        reviewTurnsUsed: state.reviewTurnsUsed,
        maxReviewTurns: state.maxReviewTurns,
        remainingReviewTurns: state.remainingReviewTurns,
      },
      evidence: {
        pairRound: evidence.pairRound,
        ownerResponse: {
          identity: state.roles.owner,
          eventRound: evidence.ownerEvent.round,
          sourcePath: response.path,
          sourceSha256: response.sha256,
          archivePath: responseFile.path,
          archivedSha256: responseFile.sha256,
        },
        reviewerReview: {
          identity: state.roles.reviewer,
          eventRound: evidence.reviewerEvent.round,
          sourcePath: review.path,
          sourceSha256: review.sha256,
          archivePath: reviewFile.path,
          archivedSha256: reviewFile.sha256,
        },
      },
      normative:
        'The accepted artifact remains normative; the archived review and owner response are evidence.',
      ...(occupied
        ? {
            recovery: {
              configuredDestination: configuredDestination.relative,
              occupiedProtocolId: occupied.protocolId,
              recoveryDestination: destination.relative,
              occupiedAcceptedAt: occupied.acceptedAt,
              relationship: compareDecisionTimes(evidence.decision.at, occupied.acceptedAt),
            },
          }
        : {}),
    };
    const manifestFile = outputFile('manifest', 'README.md', renderArchiveManifest(manifest));
    const files = [
      ...(mode === 'reference' ? [] : [artifactFile]),
      reviewFile,
      responseFile,
      manifestFile,
    ];
    return deepFreeze({
      schema: 'aitm.co-review.prepared-archive/v1',
      root,
      protocolId: state.protocolId,
      runtimeDir: state.initialization?.runtimeDir,
      destination,
      manifest,
      files,
    });
  }

  const candidates = [candidate('reference'), candidate('copy'), candidate('legacy-copy')];
  for (const prepared of candidates) {
    if (inspectExpected(destination, prepared.files).status === 'complete') return prepared;
  }
  return canReferenceArtifact(root, artifact, repository) ? candidates[0] : candidates[1];
}

function expectedBytes(file) {
  const bytes = Buffer.from(file.bytesBase64, 'base64');
  if (digest(bytes) !== file.sha256) fail('archive-prepared-integrity', file.path);
  return bytes;
}

function inspectExpected(destination, files) {
  if (!existsSync(destination.absolute)) {
    return deepFreeze({
      status: 'absent',
      destination,
      paths: files.map((file) => file.path),
      errors: [],
    });
  }
  const errors = [];
  let entries = [];
  try {
    const info = lstatSync(destination.absolute);
    if (!info.isDirectory() || info.isSymbolicLink())
      errors.push('destination is not a regular directory');
    else entries = readdirSync(destination.absolute, { withFileTypes: true });
  } catch (error) {
    errors.push(`destination unreadable: ${error.message}`);
  }
  const expectedNames = files.map((file) => file.path).sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink())
      errors.push(`unexpected non-file: ${entry.name}`);
  }
  for (const name of expectedNames)
    if (!actualNames.includes(name)) errors.push(`missing: ${name}`);
  for (const name of actualNames) if (!expectedNames.includes(name)) errors.push(`extra: ${name}`);
  for (const file of files) {
    if (!actualNames.includes(file.path)) continue;
    try {
      const actual = readFileSync(path.join(destination.absolute, file.path));
      if (!actual.equals(expectedBytes(file))) errors.push(`different: ${file.path}`);
    } catch (error) {
      errors.push(`unreadable: ${file.path}: ${error.message}`);
    }
  }
  return deepFreeze({
    status: errors.length === 0 ? 'complete' : 'conflict',
    destination,
    paths: expectedNames,
    errors,
  });
}

export function renderArchiveManifest(model) {
  const json = JSON.stringify(model, null, 2)
    .replaceAll('aitm-co-review-manifest:start', 'aitm-co-review-manifest\\u003astart')
    .replaceAll('aitm-co-review-manifest:end', 'aitm-co-review-manifest\\u003aend')
    .replaceAll('`', '\\u0060');
  const text = [
    '# Co-review finalization archive',
    '',
    'This directory preserves the terminal evidence selected by the governed co-review protocol.',
    'The accepted specification remains normative; the review and owner response are evidence.',
    ...(model.artifact?.mode === 'reference'
      ? [`Recover the accepted artifact with \`git cat-file blob ${model.artifact.gitBlob}\`.`]
      : []),
    ...(model.recovery
      ? [
          '',
          `This archive is a deterministic recovery sibling of the [configured archive](${path.posix.relative(
            model.recovery.recoveryDestination,
            `${model.recovery.configuredDestination}/README.md`
          )}).`,
          `The recovered protocol was accepted at ${model.decision.at}; the occupied protocol was accepted at ${model.recovery.occupiedAcceptedAt}; relationship: ${model.recovery.relationship}.`,
        ]
      : []),
    '',
    '<!-- aitm-co-review-manifest:start -->',
    '```json',
    json,
    '```',
    '<!-- aitm-co-review-manifest:end -->',
    '',
  ].join('\n');
  return Buffer.from(text, 'utf8');
}

export function inspectArchive(options = {}) {
  const prepared = options.prepared ?? buildPrepared(options);
  validatePrepared(prepared, options.repository);
  return inspectExpected(prepared.destination, prepared.files);
}

export function prepareArchive(options = {}) {
  const prepared = buildPrepared(options);
  validatePrepared(prepared, options.repository);
  const inspection = inspectExpected(prepared.destination, prepared.files);
  if (inspection.status === 'conflict') {
    fail('archive-conflict', inspection.errors.join('; '));
  }
  return deepFreeze({ ...prepared, status: inspection.status });
}

function validatePrepared(prepared, repository = REAL_REPOSITORY_BOUNDARY) {
  const mode = prepared?.manifest?.artifact?.mode;
  const legacyCopy = mode === undefined;
  const expectedKinds =
    mode === 'reference'
      ? ['review', 'response', 'manifest']
      : mode === 'copy' || legacyCopy
        ? ['artifact', 'review', 'response', 'manifest']
        : null;
  if (
    prepared?.schema !== 'aitm.co-review.prepared-archive/v1' ||
    !prepared.destination?.absolute ||
    !Array.isArray(prepared.files) ||
    !expectedKinds ||
    prepared.files.length !== expectedKinds.length
  ) {
    fail('archive-prepared-integrity', 'invalid prepared model');
  }
  const names = prepared.files.map((file) => file.path);
  if (new Set(names).size !== expectedKinds.length || !names.includes('README.md')) {
    fail('archive-prepared-integrity', 'expected exact mode-specific path tree');
  }
  const byKind = new Map();
  for (const file of prepared.files) {
    if (
      typeof file.path !== 'string' ||
      !file.path ||
      file.path === '.' ||
      file.path === '..' ||
      path.posix.basename(file.path) !== file.path ||
      path.win32.basename(file.path) !== file.path ||
      !expectedKinds.includes(file.kind) ||
      byKind.has(file.kind)
    ) {
      fail('archive-prepared-integrity', `unsafe file entry ${String(file.path)}`);
    }
    byKind.set(file.kind, file);
  }
  const artifactKeys = Object.keys(prepared.manifest?.artifact || {}).sort();
  const expectedArtifactKeys = [
    'acceptedCommit',
    ...(mode === 'copy' || legacyCopy ? ['archivePath', 'archivedSha256'] : []),
    'gitBlob',
    ...(legacyCopy ? [] : ['mode']),
    'sha256',
    'sourcePath',
  ].sort();
  if (!isDeepStrictEqual(artifactKeys, expectedArtifactKeys)) {
    fail('archive-prepared-integrity', 'artifact manifest shape');
  }
  committedArtifact(
    prepared.root,
    {
      path: prepared.manifest.artifact.sourcePath,
      commit: prepared.manifest.artifact.acceptedCommit,
      blob: prepared.manifest.artifact.gitBlob,
      sha256: prepared.manifest.artifact.sha256,
    },
    repository
  );
  if (
    (mode === 'copy' || legacyCopy) &&
    prepared.manifest.artifact.sha256 !== prepared.manifest.artifact.archivedSha256
  ) {
    fail('archive-prepared-integrity', 'artifact copy differs from accepted source');
  }
  const evidenceSources = [
    ['review', prepared.manifest?.evidence?.reviewerReview],
    ['response', prepared.manifest?.evidence?.ownerResponse],
  ];
  for (const [kind, evidence] of evidenceSources) {
    recordedFile(
      prepared.root,
      { path: evidence?.sourcePath, sha256: evidence?.sourceSha256 },
      `${kind}-source`
    );
    if (evidence.sourceSha256 !== evidence.archivedSha256) {
      fail('archive-prepared-integrity', `${kind} copy differs from recorded source`);
    }
  }
  const expectedEntries = [
    ...(mode === 'copy' || legacyCopy
      ? [
          [
            'artifact',
            prepared.manifest?.artifact?.archivePath,
            prepared.manifest?.artifact?.archivedSha256,
          ],
        ]
      : []),
    [
      'review',
      prepared.manifest?.evidence?.reviewerReview?.archivePath,
      prepared.manifest?.evidence?.reviewerReview?.archivedSha256,
    ],
    [
      'response',
      prepared.manifest?.evidence?.ownerResponse?.archivePath,
      prepared.manifest?.evidence?.ownerResponse?.archivedSha256,
    ],
    ['manifest', 'README.md', null],
  ];
  for (const [kind, expectedPath, expectedSha] of expectedEntries) {
    const file = byKind.get(kind);
    if (
      !file ||
      file.path !== expectedPath ||
      (expectedSha !== null && file.sha256 !== expectedSha)
    ) {
      fail('archive-prepared-integrity', `${kind} does not match manifest`);
    }
  }
  for (const file of prepared.files) expectedBytes(file);
  const manifest = byKind.get('manifest');
  if (!expectedBytes(manifest).equals(renderArchiveManifest(prepared.manifest))) {
    fail('archive-prepared-integrity', 'manifest bytes');
  }
  const currentDestination = resolveArchiveDestination({
    cwd: prepared.root,
    archiveDir: prepared.destination.relative,
    runtimeDir: prepared.runtimeDir,
    repository,
  });
  if (currentDestination.absolute !== prepared.destination.absolute) {
    fail('archive-destination-drift', prepared.destination.relative);
  }
}

function publicationResult(status, prepared) {
  return deepFreeze({
    status,
    destination: prepared.destination,
    paths: prepared.files.map((file) => file.path),
  });
}

export function publishPreparedArchive(
  prepared,
  {
    hooks = {},
    now = Date.now,
    randomUUID = systemRandomUUID,
    pid = process.pid,
    repository = REAL_REPOSITORY_BOUNDARY,
  } = {}
) {
  validatePrepared(prepared, repository);
  const initial = inspectExpected(prepared.destination, prepared.files);
  if (initial.status === 'complete') return publicationResult('complete', prepared);
  if (initial.status === 'conflict') fail('archive-conflict', initial.errors.join('; '));

  const parent = path.dirname(prepared.destination.absolute);
  mkdirSync(parent, { recursive: true });
  const protocol = String(prepared.protocolId).replace(/[^a-zA-Z0-9.-]+/g, '-');
  const staging = path.join(
    parent,
    `.${path.basename(prepared.destination.absolute)}.aitm-staging-${protocol}-${pid}-${now()}-${randomUUID()}`
  );
  mkdirSync(staging);
  const ordered = [
    ...prepared.files.filter((file) => file.path !== 'README.md'),
    prepared.files.find((file) => file.path === 'README.md'),
  ];
  for (const file of ordered) {
    writeFileSync(path.join(staging, file.path), expectedBytes(file), { flag: 'wx' });
    hooks.afterWrite?.({
      relative: file.path,
      staging,
      destination: prepared.destination.absolute,
    });
  }
  hooks.beforeValidate?.({ staging, destination: prepared.destination.absolute });
  const staged = inspectExpected(
    { absolute: staging, relative: path.basename(staging) },
    prepared.files
  );
  if (staged.status !== 'complete') fail('archive-staging-invalid', staged.errors.join('; '));
  hooks.beforeRename?.({ staging, destination: prepared.destination.absolute });
  try {
    renameSync(staging, prepared.destination.absolute);
  } catch (error) {
    if (!['EEXIST', 'ENOTDIR', 'ENOTEMPTY'].includes(error.code)) throw error;
    const raced = inspectExpected(prepared.destination, prepared.files);
    if (raced.status === 'complete') return publicationResult('complete', prepared);
    fail('archive-conflict', raced.errors.join('; '));
  }
  const published = inspectExpected(prepared.destination, prepared.files);
  if (published.status !== 'complete')
    fail('archive-publication-invalid', published.errors.join('; '));
  return publicationResult('published', prepared);
}
