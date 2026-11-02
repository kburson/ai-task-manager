// @story #2049
// A local observation is never a freshness, ownership, proof or completion grant.
import { types } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalRecordJson as json } from '../github-records/canonical-json.mjs';
import { validateManifest } from './manifest.mjs';
import { validateRecoveryJournal } from './journal.mjs';
import { readRetainedNativePlanApproval, validateStoryFieldCandidate } from './view-payloads.mjs';
import { readPublishedNativeTimingEvents } from './completion-receipt.mjs';
import { inspectStoryWriterScope } from './writer-registry.mjs';
import { readStoryGenerationObservation } from './writer-handoff-bindings.mjs';
import { storyCachePath } from './store.mjs';
import { gql, splitRepo } from '../../../gh/lib/github-projects.mjs';
export { timingAuthority } from './timing-authority.mjs';
const byteLength = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength'
).get;
function assertDataTree(value, depth = 0) {
  if (!value || typeof value !== 'object') return;
  if (depth >= 64 || types.isProxy(value)) fail('generation-data');
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null && proto !== Array.prototype)
    fail('generation-data');
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !Object.hasOwn(field, 'value')) fail('generation-accessor');
    assertDataTree(field.value, depth + 1);
  }
}
const clone = (value) => {
  assertDataTree(value);
  return JSON.parse(json(value));
};
const nativeViews = new WeakSet();
const same = (a, b) => json(a) === json(b);
function fail(reason) {
  throw new TypeError('story-view:' + reason);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function recordCopy(input) {
  if (!input || types.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
    fail('generation');
  const fields = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(fields).sort().join(',') !== 'generation,manifest,payloads' ||
    Object.values(fields).some((f) => !f.enumerable || !Object.hasOwn(f, 'value'))
  )
    fail('generation-shape');
  const source = fields.payloads.value;
  if (
    !source ||
    types.isProxy(source) ||
    Object.getPrototypeOf(source) !== Map.prototype ||
    Reflect.ownKeys(source).length
  )
    fail('payload-map');
  const payloads = new Map();
  for (const [key, bytes] of Map.prototype.entries.call(source)) {
    if (typeof key !== 'string' || types.isProxy(bytes)) fail('payload-bytes');
    if (typeof bytes === 'string') payloads.set(key, bytes);
    else if (Buffer.isBuffer(bytes)) {
      const copy = Buffer.alloc(Reflect.apply(byteLength, bytes, []));
      Reflect.apply(Uint8Array.prototype.set, copy, [bytes]);
      payloads.set(key, copy);
    } else fail('payload-bytes');
  }
  const record = {
    manifest: clone(fields.manifest.value),
    generation: clone(fields.generation.value),
    payloads,
  };
  const verified = validateManifest(record.manifest, {
    identity: record.generation.identity,
    payloads,
  });
  if (!same(verified.generation, record.generation)) fail('generation-mismatch');
  validateRecoveryJournal(record);
  return record;
}
function publication(g, resources) {
  const effects = g.batch?.effects ?? [];
  const pendingEffects = effects
    .filter((e) => e.outcome?.state !== 'confirmed')
    .map((e) => ({
      key: e.key,
      kind: e.kind,
      attempted: e.attempted,
      state: e.outcome?.state ?? 'pending',
    }));
  const uncertain = effects.some((e) => ['uncertain', 'dispatching'].includes(e.outcome?.state));
  const conflict = g.conflicts.length > 0 || g.batch?.status === 'conflict';
  const timingResource = resources[g.timing.canonicalCommentKey];
  const publishedEvents = readPublishedNativeTimingEvents(
    timingResource?.body ?? '',
    g.timing.events
  );
  const eventIds = new Set(publishedEvents.map((e) => e.eventId));
  const timingPending =
    g.timing.events.some((e) => !eventIds.has(e.eventId)) ||
    (g.timing.events.length === 0 && g.timing.ingestedCursor !== g.timing.publishedCursor);
  const pending = g.batch !== null && g.batch.status !== 'complete';
  const status = conflict
    ? 'conflict'
    : uncertain || g.batch?.status === 'uncertain'
      ? 'uncertain'
      : pending
        ? 'pending'
        : g.dirtyKeys.length || timingPending
          ? 'dirty'
          : 'clean';
  return {
    status,
    dirtyKeys: g.dirtyKeys,
    conflicts: g.conflicts,
    timingPending,
    pendingEffects,
    batchId: g.batch?.batchId ?? null,
    recovery: conflict
      ? {
          operation: null,
          kind: 'manual-intervention',
          reason: 'frozen-conflict',
          completesTransition: false,
        }
      : uncertain ||
          ['dispatching', 'uncertain'].includes(g.batch?.status) ||
          (pending &&
            g.batch.status !== 'confirmed' &&
            effects.every((e) => e.outcome?.state === 'confirmed'))
        ? { operation: 'recoverStoryBatch', allowMutation: false, completesTransition: false }
        : pending &&
            g.batch.status === 'prepared' &&
            g.batch.effects.every((e) => !e.attempted && e.outcome === null)
          ? {
              operation: 'releaseUnattemptedTransition',
              batchId: g.batch.batchId,
              requires: ['registered-owner', 'no-attempted-effects'],
              nextOperation: 'runTransitionBatch',
              mayCompleteTransition: false,
            }
          : pending && g.batch.status === 'confirmed'
            ? {
                operation: 'runTransitionBatch',
                requires: ['registered-owner', 'exact-frozen-intent', 'fresh-native-guards'],
                mayCompleteTransition: true,
              }
            : pending
              ? {
                  operation: null,
                  kind: 'manual-intervention',
                  reason: 'retained-intent-not-resumable',
                  completesTransition: false,
                }
              : null,
  };
}
/** Exact integrity-checked generation, with an explicit authority purpose on every read. */
export function storyView({ generation, authority } = {}) {
  if (!['working', 'published'].includes(authority)) fail('authority');
  const record = recordCopy(generation);
  const g = record.generation;
  const text = (ref) =>
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      typeof record.payloads.get(ref.payloadPath) === 'string'
        ? Buffer.from(record.payloads.get(ref.payloadPath))
        : record.payloads.get(ref.payloadPath)
    );
  const resources = Object.fromEntries(
    Object.entries(g.baseSnapshot.resources).map(([key, ref]) => [
      key,
      { kind: ref.kind, digest: ref.digest, body: text(ref), source: 'published' },
    ])
  );
  const publishedResources = clone(resources);
  const fields = clone(g.baseSnapshot.fields);
  let title = g.baseSnapshot.title;
  if (authority === 'working') {
    for (const key of g.dirtyKeys) {
      const ref = g.working[key];
      const raw = text(ref);
      if (ref.kind === 'project-field') {
        const field = JSON.parse(raw);
        validateStoryFieldCandidate(field);
        const prefix = 'project-field:' + g.identity.projectItemId + ':';
        const fieldId = key.startsWith(prefix) ? key.slice(prefix.length) : null;
        const index = fields.findIndex((row) => row.fieldId === fieldId);
        const before = fields[index];
        if (
          json(field) !== raw ||
          !before ||
          ref.capabilityRef !== null ||
          field.fieldId !== fieldId ||
          field.itemId !== g.identity.projectItemId ||
          !same({ ...before, value: field.value }, field)
        )
          fail('field-target');
        fields[index] = field;
        resources[key] = { kind: ref.kind, digest: ref.digest, field, source: 'working' };
      } else if (ref.kind === 'issue') {
        // Native staging stores a composite only when body and title travel together.
        let candidate;
        try {
          candidate = JSON.parse(raw);
        } catch {
          /* plain body is the original accepted representation */
        }
        const approved = readRetainedNativePlanApproval(record);
        if (approved) {
          title = approved.title;
          resources[key] = {
            kind: ref.kind,
            digest: ref.digest,
            body: approved.body,
            source: 'working',
          };
        } else if (ref.capabilityRef !== null) {
          fail('retained-capability');
        } else if (
          typeof candidate?.schema === 'string' &&
          candidate.schema.startsWith('aitm.story-issue-update/')
        ) {
          if (
            candidate.schema !== 'aitm.story-issue-update/v1' ||
            Object.keys(candidate).sort().join(',') !== 'body,schema,title' ||
            json(candidate) !== raw ||
            typeof candidate.body !== 'string' ||
            typeof candidate.title !== 'string' ||
            !candidate.title.trim() ||
            /[\p{Cc}\p{Zl}\p{Zp}]/u.test(candidate.title)
          )
            fail('issue-candidate');
          title = candidate.title;
          resources[key] = {
            kind: ref.kind,
            digest: ref.digest,
            body: candidate.body,
            source: 'working',
          };
        } else
          resources[key] = { kind: ref.kind, digest: ref.digest, body: raw, source: 'working' };
      } else resources[key] = { kind: ref.kind, digest: ref.digest, body: raw, source: 'working' };
    }
  }
  const view = freeze({
    schema: 'aitm.story-view/v1',
    authority,
    identity: g.identity,
    generation: g.generation,
    publicationGeneration: g.publicationGeneration,
    fresh: false,
    completionVerified: false,
    body: resources['issue:' + g.identity.issueNodeId].body,
    title,
    resources,
    fields,
    assignees: g.baseSnapshot.assignees,
    inventory: g.baseSnapshot.inventory,
    publishedInventory: g.baseSnapshot.inventory,
    workingCommentKeys: Object.keys(resources).filter((key) => key.startsWith('comment:')),
    publication: publication(g, publishedResources),
  });
  nativeViews.add(view);
  return view;
}
/** Bind the one detached view to independently supplied subject facts. */
function checkSubject(view, { identity, repository, issue, host, projectId } = {}) {
  if (!nativeViews.has(view)) fail('view');
  if (view.authority !== 'published') fail('authority');
  const requested = {
    repository: repository?.toLowerCase(),
    issueNumber: issue,
    ...(host !== undefined ? { host: host.toLowerCase() } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
  };
  const retained = identity === undefined ? {} : clone(identity);
  for (const facts of [requested, retained])
    for (const [key, value] of Object.entries(facts))
      if (value !== undefined && view.identity[key] !== value) fail('identity');
  const expected = { ...requested, ...retained };
  return ['host', 'repository', 'issueNumber', 'issueNodeId', 'projectId', 'projectItemId'].every(
    (key) => expected[key] !== undefined
  );
}
/** Guard inputs always use the fresh observed body, never cached candidate bytes. */
export function publishedStoryBody({ body, generation, view, ...subject } = {}) {
  if (typeof body !== 'string') fail('published-body');
  const selected = view ?? (generation ? storyView({ generation, authority: 'published' }) : null);
  if (selected) checkSubject(selected, subject);
  return body;
}
/** Existing untrusted diagnostic channel; one private view is checked and rendered once. */
export function storyViewDiagnostic({ generation, view, ...subject } = {}) {
  const selected = view ?? storyView({ generation, authority: 'published' });
  const bound = checkSubject(selected, subject);
  return freeze({
    guardId: 'authority-collection',
    untrusted: true,
    text: json(
      bound
        ? {
            schema: selected.schema,
            authority: selected.authority,
            identity: selected.identity,
            generation: selected.generation,
            fresh: false,
            completionVerified: false,
            publication: selected.publication,
          }
        : {
            schema: 'aitm.story-view/v1',
            authority: 'published',
            available: false,
            reason: 'identity-incomplete',
            fresh: false,
            completionVerified: false,
          }
    ),
  });
}
/** Read-only local discovery through the native retained registry and private-byte reader. */
export function readLocalStoryView({
  projectRoot,
  repository,
  issue,
  projectId,
  host = 'github.com',
} = {}) {
  // Only genuine absence permits remote-only reads. Malformed paths are local evidence.
  for (const relative of ['.tmp', path.join('.tmp', 'gh')]) {
    let stat;
    try {
      stat = fs.lstatSync(path.join(projectRoot, relative));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('cache-path');
  }
  const observed = inspectStoryWriterScope({ projectRoot, host, repository, issueNumber: issue });
  if (!observed) {
    const repoHash = createHash('sha256').update(repository.toLowerCase()).digest('hex');
    if (fs.existsSync(path.join(projectRoot, '.tmp', 'gh', host, repoHash, String(issue))))
      fail('unclaimed-cache');
    return null;
  }
  if (observed.claim.worktree !== projectRoot) return null;
  if (observed.claim.cachePath !== storyCachePath({ projectRoot, identity: observed.identity }))
    fail('cache-path');
  const record = readStoryGenerationObservation(observed.claim, observed.identity);
  const view = storyView({ generation: record, authority: 'published' });
  checkSubject(view, { identity: observed.identity, repository, issue, host, projectId });
  return { view, identity: clone(observed.identity) };
}

const nativePublishedQuery = (document, variables, options) => gql(document, variables, options);
/** One bounded fresh target read. Incomplete project membership disables cache attachment. */
export async function readPublishedStoryObservation({
  repository,
  issue,
  projectId,
  host = process.env.GH_HOST || 'github.com',
  transport = nativePublishedQuery,
} = {}) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository ?? '') || !Number.isSafeInteger(issue) || issue <= 0)
    fail('published-subject');
  if (typeof host !== 'string' || !/^[a-z0-9.-]+$/i.test(host)) fail('published-host');
  const boundHost = host.toLowerCase();
  const { owner, repoName } = splitRepo(repository);
  const data = await transport(
    `query($owner:String!,$repo:String!,$issue:Int!){repository(owner:$owner,name:$repo){issue(number:$issue){id number repository{nameWithOwner} body projectItems(first:50){nodes{id project{id}} pageInfo{hasNextPage}}}}}`,
    { owner, repo: repoName, issue },
    { env: { ...process.env, GH_HOST: boundHost } }
  );
  const node = data?.repository?.issue;
  if (
    !node ||
    node.number !== issue ||
    typeof node.id !== 'string' ||
    !node.id ||
    /[\s\p{Cc}]/u.test(node.id) ||
    typeof node.body !== 'string'
  )
    fail('published-observation');
  if (node.repository?.nameWithOwner?.toLowerCase() !== repository.toLowerCase())
    fail('published-identity');
  const subject = {
    host: boundHost,
    repository: repository.toLowerCase(),
    issueNumber: issue,
    issueNodeId: node.id,
    ...(projectId ? { projectId } : {}),
  };
  const items = node.projectItems;
  const identifier = (v) => typeof v === 'string' && v.length > 0 && !/[\s\p{Cc}]/u.test(v);
  const completeMembership =
    Array.isArray(items?.nodes) &&
    items.nodes.length <= 50 &&
    items?.pageInfo?.hasNextPage === false &&
    items.nodes.every(
      (item) =>
        item !== null &&
        typeof item === 'object' &&
        identifier(item.id) &&
        identifier(item.project?.id)
    ) &&
    new Set(items.nodes.map((item) => item.id)).size === items.nodes.length;
  const matches = completeMembership
    ? items.nodes.filter((item) => item.project.id === projectId)
    : [];
  const identity =
    identifier(projectId) && completeMembership && matches.length === 1
      ? { ...subject, projectItemId: matches[0].id }
      : null;
  return freeze({ authority: 'published', fresh: true, body: node.body, subject, identity });
}
