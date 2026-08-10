import { isDeepStrictEqual } from 'node:util';

import {
  createIssueComment as writeComment,
  listIssueCommentsSince,
} from './github-comment-store.mjs';
import {
  createAitmRecordEnvelope,
  createRecordId,
  hashRecordPayload,
  renderAitmRecord,
} from './record-envelope.mjs';
import {
  createIssueDirectory,
  parseIssueDirectory,
  renderIssueDirectory,
  SINGLETON_KINDS,
  singletonLogicalIdentity,
} from './issue-directory.mjs';

const SINGLETON_SCHEMA = 'aitm.singleton/v1';
const SINGLETON_RECORD_TYPE = 'singleton-projection';
const FIRST_GITHUB_INSTANT = '1970-01-01T00:00:00.000Z';
const EVOLVED_SINGLETON_KINDS = Object.freeze({
  'aitm.delivery-contract/v1': 'delivery-contract',
  'aitm.coordination-singleton/v1': 'coordination',
  'aitm.evidence-projection/v1': 'evidence-projection',
  'aitm.timing-projection/v1': 'timing',
});

function initializerError(category) {
  return new TypeError(`singleton-initializer:${category}`);
}

function isRepository(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

function isOpaqueId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    value === value.trim() &&
    ![...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  );
}

function hasExactlyKeys(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

function resolveClock(now) {
  if (now === undefined) return () => new Date().toISOString();
  if (typeof now === 'string') return () => now;
  if (typeof now === 'function') return now;
  throw initializerError('input');
}

function resolveDependencies(
  deps = {},
  { needsCommentWrite = false, needsBodyWrite = false } = {}
) {
  if (
    typeof deps.readIssueBody !== 'function' ||
    (needsBodyWrite && typeof deps.writeIssueBody !== 'function')
  ) {
    throw initializerError('input');
  }
  const listIssueComments =
    deps.listIssueComments ??
    (typeof deps.graphql === 'function'
      ? ({ repository, issue }) =>
          listIssueCommentsSince({
            repository,
            issue,
            since: FIRST_GITHUB_INSTANT,
            graphql: deps.graphql,
          })
      : null);
  const createIssueComment =
    deps.createIssueComment ??
    (typeof deps.rest?.createIssueComment === 'function' && typeof deps.graphql === 'function'
      ? ({ repository, issue, body }) =>
          writeComment({ repository, issue, body, rest: deps.rest, graphql: deps.graphql })
      : null);
  if (
    typeof listIssueComments !== 'function' ||
    (needsCommentWrite && typeof createIssueComment !== 'function')
  ) {
    throw initializerError('input');
  }
  return {
    ...deps,
    listIssueComments,
    createIssueComment,
    createRecordId: deps.createRecordId ?? createRecordId,
  };
}

function assertInput({ repository, issue, issueNodeId, actor }, { needsActor = false } = {}) {
  if (
    !isRepository(repository) ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    !isOpaqueId(issueNodeId) ||
    (needsActor && !isOpaqueId(actor))
  ) {
    throw initializerError('input');
  }
}

function assertDirectoryInput(issueNodeId) {
  createIssueDirectory({
    issueNodeId,
    singletons: Object.fromEntries(
      SINGLETON_KINDS.map((kind) => [kind, `pending-directory-${kind}`])
    ),
  });
}

function singletonPayload({ repository, issue, kind }) {
  return Object.freeze({
    schema: SINGLETON_SCHEMA,
    kind,
    logicalId: singletonLogicalIdentity({ repository, issue, kind }),
  });
}

function assertSingletonRecord(record, { repository, issue }) {
  if (
    !isOpaqueId(record?.commentNodeId) ||
    record?.envelope?.recordType !== SINGLETON_RECORD_TYPE
  ) {
    throw initializerError('record');
  }
  const envelope = record.envelope;
  if (envelope.repository !== repository || envelope.issue !== issue) {
    throw initializerError('record');
  }
  const payload = envelope.payload;
  if (envelope.payloadHash !== hashRecordPayload(payload)) throw initializerError('record');
  if (payload?.schema === SINGLETON_SCHEMA) {
    if (envelope.authority?.epoch !== 1) throw initializerError('epoch');
    if (!hasExactlyKeys(payload, ['kind', 'logicalId', 'schema'])) {
      throw initializerError('record');
    }
    if (!SINGLETON_KINDS.includes(payload.kind)) throw initializerError('record');
    if (payload.logicalId !== singletonLogicalIdentity({ repository, issue, kind: payload.kind })) {
      throw initializerError('record');
    }
    return Object.freeze({ kind: payload.kind, record });
  }
  const kind = EVOLVED_SINGLETON_KINDS[payload?.schema];
  if (
    kind === undefined ||
    !Number.isSafeInteger(payload?.revision) ||
    payload.revision <= 0 ||
    !Number.isSafeInteger(envelope.authority?.epoch) ||
    envelope.authority.epoch <= 0
  ) {
    throw initializerError('record');
  }
  return Object.freeze({ kind, record });
}

function withDirectory(issueBody, directory) {
  return `${issueBody}${issueBody.endsWith('\n') ? '' : '\n'}\n${renderIssueDirectory(directory)}\n`;
}

async function readLiveBody({ repository, issue, deps }) {
  const body = await deps.readIssueBody({ repository, issue });
  if (typeof body !== 'string') throw initializerError('body-readback');
  return body;
}

async function emitCrash(crashAt, phase, kind) {
  if (typeof crashAt === 'function') await crashAt({ phase, kind });
}

async function writeAndReadBackDirectory({
  repository,
  issue,
  expectedBody,
  directory,
  intendedSingletons,
  deps,
  crashAt,
}) {
  const body = withDirectory(expectedBody, directory);
  await emitCrash(crashAt, 'before-body');
  await deps.writeIssueBody({ repository, issue, expectedBody, body });
  await emitCrash(crashAt, 'after-body');
  try {
    const readBack = await readLiveBody({ repository, issue, deps });
    if (
      readBack !== body ||
      !isDeepStrictEqual(parseIssueDirectory({ issueBody: readBack }), directory)
    ) {
      throw initializerError('body-readback');
    }
    const discovered = await discover({
      repository,
      issue,
      issueNodeId: directory.issueNodeId,
      deps,
      issueBody: readBack,
    });
    for (const kind of SINGLETON_KINDS) {
      if (discovered.singletons[kind].commentNodeId !== intendedSingletons[kind].commentNodeId) {
        throw initializerError('ambiguous');
      }
    }
    return readBack;
  } catch (error) {
    let current;
    try {
      current = await readLiveBody({ repository, issue, deps });
      if (current !== body) throw initializerError('body-compensation');
    } catch {
      throw initializerError('body-compensation');
    }
    await emitCrash(crashAt, 'before-compensation-body');
    try {
      await deps.writeIssueBody({ repository, issue, expectedBody: body, body: expectedBody });
      const restored = await readLiveBody({ repository, issue, deps });
      if (restored !== expectedBody || parseIssueDirectory({ issueBody: restored }) !== null) {
        throw initializerError('body-compensation');
      }
    } catch {
      throw initializerError('body-compensation');
    }
    await emitCrash(crashAt, 'after-compensation-body');
    throw error;
  }
}

async function discover({ repository, issue, issueNodeId, deps, issueBody }) {
  const directory = parseIssueDirectory({ issueBody });
  if (directory !== null && directory.issueNodeId !== issueNodeId)
    throw initializerError('issue-node');
  const records = await deps.listIssueComments({ repository, issue });
  if (!Array.isArray(records)) throw initializerError('record');
  const candidates = new Map(SINGLETON_KINDS.map((kind) => [kind, []]));
  for (const record of records) {
    if (record?.envelope?.recordType !== SINGLETON_RECORD_TYPE) continue;
    const singleton = assertSingletonRecord(record, { repository, issue });
    candidates.get(singleton.kind).push(singleton.record);
  }
  const singletons = {};
  const missing = [];
  for (const kind of SINGLETON_KINDS) {
    const matches = candidates.get(kind);
    if (matches.length > 1) throw initializerError('ambiguous');
    if (matches.length === 0) missing.push(kind);
    else singletons[kind] = matches[0];
  }
  if (directory !== null) {
    for (const kind of SINGLETON_KINDS) {
      if (singletons[kind] === undefined) throw initializerError('missing');
      if (directory.singletons[kind] !== singletons[kind].commentNodeId) {
        throw initializerError('directory-mismatch');
      }
    }
  }
  return Object.freeze({
    directory,
    issueBody,
    missing: Object.freeze(missing),
    singletons: Object.freeze({ ...singletons }),
  });
}

async function confirmPrePublicationSingletons({
  repository,
  issue,
  issueNodeId,
  deps,
  intendedSingletons,
}) {
  const issueBody = await readLiveBody({ repository, issue, deps });
  const discovered = await discover({ repository, issue, issueNodeId, deps, issueBody });
  if (discovered.directory !== null) throw initializerError('directory-race');
  if (discovered.missing.length > 0) throw initializerError('missing');
  for (const kind of SINGLETON_KINDS) {
    if (discovered.singletons[kind].commentNodeId !== intendedSingletons[kind].commentNodeId) {
      throw initializerError('ambiguous');
    }
  }
  return { issueBody, discovered };
}

export async function discoverIssueSingletons({
  repository,
  issue,
  issueNodeId,
  deps,
  actor,
} = {}) {
  assertInput({ repository, issue, issueNodeId, actor });
  const resolvedDeps = resolveDependencies(deps);
  const issueBody = await readLiveBody({ repository, issue, deps: resolvedDeps });
  return discover({ repository, issue, issueNodeId, deps: resolvedDeps, issueBody });
}

export async function initializeIssueDirectory({
  repository,
  issue,
  issueNodeId,
  actor,
  deps,
  now,
  crashAt,
  publishDirectory = true,
} = {}) {
  assertInput({ repository, issue, issueNodeId, actor }, { needsActor: true });
  if (typeof publishDirectory !== 'boolean') throw initializerError('input');
  assertDirectoryInput(issueNodeId);
  const clock = resolveClock(now);
  const resolvedDeps = resolveDependencies(deps, {
    needsCommentWrite: true,
    needsBodyWrite: true,
  });
  const issueBody = await readLiveBody({ repository, issue, deps: resolvedDeps });
  const found = await discover({ repository, issue, issueNodeId, deps: resolvedDeps, issueBody });
  if (found.directory !== null) {
    return Object.freeze({
      directory: found.directory,
      singletons: Object.freeze(Object.values(found.singletons)),
      initialized: false,
    });
  }

  const singletons = { ...found.singletons };
  for (const kind of found.missing) {
    const payload = singletonPayload({ repository, issue, kind });
    const envelope = createAitmRecordEnvelope({
      recordType: SINGLETON_RECORD_TYPE,
      repository,
      issue,
      payload,
      actor,
      epoch: 1,
      createdAt: clock(),
      recordId: resolvedDeps.createRecordId(),
      grantId: resolvedDeps.createRecordId(),
    });
    const body = renderAitmRecord({ envelope, visibleMarkdown: 'AITM singleton projection.\n' });
    await emitCrash(crashAt, 'before-comment', kind);
    const created = await resolvedDeps.createIssueComment({ repository, issue, body });
    await emitCrash(crashAt, 'after-comment', kind);
    assertSingletonRecord(created, { repository, issue });
    if (!isDeepStrictEqual(created.envelope, envelope) || created.body !== body) {
      throw initializerError('comment-readback');
    }
    singletons[kind] = created;
  }
  const directory = createIssueDirectory({
    issueNodeId,
    singletons: Object.fromEntries(
      SINGLETON_KINDS.map((kind) => [kind, singletons[kind].commentNodeId])
    ),
  });
  const prePublication = await confirmPrePublicationSingletons({
    repository,
    issue,
    issueNodeId,
    deps: resolvedDeps,
    intendedSingletons: singletons,
  });
  if (!publishDirectory) {
    return Object.freeze({
      directory,
      singletons: Object.freeze(SINGLETON_KINDS.map((kind) => singletons[kind])),
      initialized: true,
      published: false,
    });
  }
  await writeAndReadBackDirectory({
    repository,
    issue,
    expectedBody: prePublication.issueBody,
    directory,
    intendedSingletons: singletons,
    deps: resolvedDeps,
    crashAt,
  });
  return Object.freeze({
    directory,
    singletons: Object.freeze(SINGLETON_KINDS.map((kind) => singletons[kind])),
    initialized: true,
  });
}

export async function repairIssueDirectory({
  repository,
  issue,
  issueNodeId,
  actor,
  deps,
  crashAt,
} = {}) {
  assertInput({ repository, issue, issueNodeId, actor });
  assertDirectoryInput(issueNodeId);
  const resolvedDeps = resolveDependencies(deps, { needsBodyWrite: true });
  const issueBody = await readLiveBody({ repository, issue, deps: resolvedDeps });
  const found = await discover({ repository, issue, issueNodeId, deps: resolvedDeps, issueBody });
  if (found.directory !== null) {
    return Object.freeze({
      directory: found.directory,
      singletons: Object.freeze(Object.values(found.singletons)),
      repaired: false,
    });
  }
  if (found.missing.length > 0) throw initializerError('missing');
  const prePublication = await confirmPrePublicationSingletons({
    repository,
    issue,
    issueNodeId,
    deps: resolvedDeps,
    intendedSingletons: found.singletons,
  });
  const directory = createIssueDirectory({
    issueNodeId,
    singletons: Object.fromEntries(
      SINGLETON_KINDS.map((kind) => [kind, found.singletons[kind].commentNodeId])
    ),
  });
  await writeAndReadBackDirectory({
    repository,
    issue,
    expectedBody: prePublication.issueBody,
    directory,
    intendedSingletons: found.singletons,
    deps: resolvedDeps,
    crashAt,
  });
  return Object.freeze({
    directory,
    singletons: Object.freeze(Object.values(found.singletons)),
    repaired: true,
  });
}
