// @story #1787 #1796
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import {
  projectLocalTrunkCloseJournal,
  validateLocalTrunkCloseJournalEntry,
} from './local-trunk-close-receipt.mjs';

const ENTRY_SCHEMA = 'aitm.delivery-waiver-journal-entry/v1';
const BURN_SCHEMA = 'aitm.delivery-waiver-consumption/v1';
const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const STATES = [
  'intent-requesting',
  'intent-confirmed',
  'burned',
  'receipt-requesting',
  'completed',
];
const ENTRY_KEYS = [
  'schema',
  'sequence',
  'predecessorOid',
  'repository',
  'issue',
  'deliveryOperationId',
  'state',
  'intentPublication',
  'burn',
  'publication',
];
const INTENT_KEYS = [
  'originalIntentId',
  'originalIntentDigest',
  'intentId',
  'intentBody',
  'intentDigest',
  'runId',
  'commentNodeId',
  'createdAt',
];
const BURN_KEYS = [
  'schema',
  'repository',
  'issue',
  'deliveryOperationId',
  'waiverRecordId',
  'waiverRevision',
  'waiverScopeDigest',
  'waiverReasonDigest',
  'acceptedHeadSha',
  'intentId',
  'mergeCommitSha',
  'authorizedAt',
  'grantDigest',
];
const PUBLICATION_KEYS = ['receiptBody', 'receiptDigest', 'runId', 'commentNodeId'];
const MAX_ENTRY_BYTES = 128 * 1024;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_HISTORY = 10000;

export class DeliveryWaiverJournalError extends Error {
  constructor(category, outcome = 'indeterminate') {
    super(`delivery-waiver-journal:${category}`);
    this.name = 'DeliveryWaiverJournalError';
    this.category = category;
    this.outcome = outcome;
  }
}
const refuse = (category, outcome) => {
  throw new DeliveryWaiverJournalError(category, outcome);
};
const exact = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const bounded = (value, max = 1024) =>
  typeof value === 'string' && value.length > 0 && Buffer.byteLength(value, 'utf8') <= max;
const digestOf = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const iso = (value) =>
  bounded(value, 64) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);

export function validateDeliveryWaiverBurn(burn, { repository, issue, deliveryOperationId } = {}) {
  if (
    !exact(burn, BURN_KEYS) ||
    burn.schema !== BURN_SCHEMA ||
    !REPO.test(burn.repository) ||
    !Number.isSafeInteger(burn.issue) ||
    burn.issue < 1 ||
    !bounded(burn.deliveryOperationId) ||
    !bounded(burn.waiverRecordId) ||
    !Number.isSafeInteger(burn.waiverRevision) ||
    burn.waiverRevision < 1 ||
    ![burn.waiverScopeDigest, burn.waiverReasonDigest, burn.grantDigest].every((v) =>
      DIGEST.test(v)
    ) ||
    !SHA.test(burn.acceptedHeadSha) ||
    !SHA.test(burn.mergeCommitSha) ||
    !bounded(burn.intentId) ||
    !iso(burn.authorizedAt) ||
    (repository !== undefined && burn.repository !== repository) ||
    (issue !== undefined && burn.issue !== issue) ||
    (deliveryOperationId !== undefined && burn.deliveryOperationId !== deliveryOperationId)
  )
    refuse('burn-schema');
  canonicalRecordJson(burn);
  return burn;
}

export function validateDeliveryWaiverJournalEntry(entry) {
  if (
    !exact(entry, ENTRY_KEYS) ||
    entry.schema !== ENTRY_SCHEMA ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 1 ||
    !(entry.predecessorOid === null || SHA.test(entry.predecessorOid)) ||
    !REPO.test(entry.repository) ||
    !Number.isSafeInteger(entry.issue) ||
    entry.issue < 1 ||
    !bounded(entry.deliveryOperationId) ||
    !STATES.includes(entry.state)
  )
    refuse('entry-schema');
  const p = entry.intentPublication;
  if (
    !exact(p, INTENT_KEYS) ||
    ![p.originalIntentId, p.intentId, p.runId].every((v) => bounded(v)) ||
    !DIGEST.test(p.originalIntentDigest) ||
    !bounded(p.intentBody, MAX_BODY_BYTES) ||
    p.intentDigest !== digestOf(p.intentBody) ||
    !(p.commentNodeId === null || bounded(p.commentNodeId)) ||
    !(p.createdAt === null || iso(p.createdAt)) ||
    (p.commentNodeId === null) !== (p.createdAt === null)
  )
    refuse('intent-schema');
  if (entry.state === 'intent-requesting' && p.commentNodeId !== null) refuse('intent-state');
  if (entry.state !== 'intent-requesting' && p.commentNodeId === null) refuse('intent-state');
  if (entry.burn !== null) validateDeliveryWaiverBurn(entry.burn, entry);
  if (STATES.indexOf(entry.state) >= STATES.indexOf('burned') && entry.burn === null)
    refuse('burn-state');
  if (STATES.indexOf(entry.state) < STATES.indexOf('burned') && entry.burn !== null)
    refuse('burn-state');
  const r = entry.publication;
  if (STATES.indexOf(entry.state) >= STATES.indexOf('receipt-requesting')) {
    if (
      !exact(r, PUBLICATION_KEYS) ||
      !bounded(r.receiptBody, MAX_BODY_BYTES) ||
      r.receiptDigest !== digestOf(r.receiptBody) ||
      !bounded(r.runId) ||
      !(r.commentNodeId === null || bounded(r.commentNodeId)) ||
      (entry.state === 'receipt-requesting' && r.commentNodeId !== null) ||
      (entry.state === 'completed' && r.commentNodeId === null)
    )
      refuse('publication-schema');
  } else if (r !== null) refuse('publication-state');
  if (entry.burn && entry.burn.intentId !== p.intentId) refuse('burn-intent');
  const bytes = canonicalRecordJson(entry);
  if (Buffer.byteLength(bytes, 'utf8') > MAX_ENTRY_BYTES) refuse('entry-size');
  return bytes;
}

function validateTransition(previous, entry) {
  if (previous === null) {
    if (
      entry.sequence !== 1 ||
      entry.predecessorOid !== null ||
      entry.state !== 'intent-requesting'
    )
      refuse('root');
    return;
  }
  if (entry.repository !== previous.repository || entry.issue !== previous.issue)
    refuse('sequence');
  const same = previous.deliveryOperationId === entry.deliveryOperationId;
  if (!same) {
    if (entry.state !== 'intent-requesting') refuse('new-operation-state');
    return;
  }
  const from = STATES.indexOf(previous.state);
  const to = STATES.indexOf(entry.state);
  if (to !== from + 1) refuse('state-transition');
  const oldP = previous.intentPublication;
  const newP = entry.intentPublication;
  for (const key of INTENT_KEYS.filter((k) => !['commentNodeId', 'createdAt'].includes(k))) {
    if (oldP[key] !== newP[key]) refuse('intent-mismatch', 'missing');
  }
  if (previous.state !== 'intent-requesting' && !equal(oldP, newP)) refuse('intent-mutation');
  if (previous.burn !== null && !equal(previous.burn, entry.burn)) refuse('burn-mutation');
  if (previous.publication !== null) {
    for (const key of PUBLICATION_KEYS.filter((k) => k !== 'commentNodeId')) {
      if (previous.publication[key] !== entry.publication?.[key]) refuse('publication-mutation');
    }
  }
}

export function projectDeliveryWaiverJournal(events, { repository, issue } = {}) {
  if (!Array.isArray(events) || events.length > MAX_HISTORY) refuse('history-size');
  const operations = new Map();
  const originalIntentOwners = new Map();
  let last = null;
  for (const { oid, entry } of events) {
    if (!SHA.test(oid) || entry.repository !== repository || entry.issue !== issue)
      refuse('history-identity');
    validateDeliveryWaiverJournalEntry(entry);
    if (entry.predecessorOid !== (last?.oid ?? null)) refuse('history-parent');
    const previous = operations.get(entry.deliveryOperationId)?.entry ?? null;
    if (last && entry.sequence !== last.entry.sequence + 1) refuse('history-sequence');
    if (!last && entry.sequence !== 1) refuse('history-root');
    if (previous) validateTransition(previous, entry);
    else if (entry.state !== 'intent-requesting') refuse('operation-root');
    const owner = originalIntentOwners.get(entry.intentPublication.originalIntentId);
    if (owner && owner !== entry.deliveryOperationId) refuse('original-intent-owner', 'missing');
    originalIntentOwners.set(entry.intentPublication.originalIntentId, entry.deliveryOperationId);
    const old = operations.get(entry.deliveryOperationId);
    operations.set(entry.deliveryOperationId, {
      state: entry.state,
      intentPublication: entry.intentPublication,
      burn: entry.burn,
      burnOid: entry.state === 'burned' ? oid : (old?.burnOid ?? null),
      publication: entry.publication,
      entry,
    });
    last = { oid, entry };
  }
  return {
    oid: last?.oid ?? null,
    sequence: last?.entry.sequence ?? 0,
    operations,
    originalIntentOwners,
  };
}

function runGit(cwd, args, input = '', trim = true) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'AITM Delivery Journal',
        GIT_AUTHOR_EMAIL: 'aitm@localhost',
        GIT_COMMITTER_NAME: 'AITM Delivery Journal',
        GIT_COMMITTER_EMAIL: 'aitm@localhost',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      stdout += data;
      if (stdout.length > 1024 * 1024) child.kill();
    });
    child.stderr.on('data', (data) => {
      stderr += data;
      if (stderr.length > 1024 * 1024) child.kill();
    });
    child.on('error', reject);
    // Git commands that do not read stdin can exit before Node closes the
    // pipe. An empty-input EPIPE is harmless; the child exit code still owns
    // the command result. A failed write of real input must remain fatal.
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE' || input.length > 0) reject(error);
    });
    child.on('close', (code) =>
      code === 0
        ? resolve(trim ? stdout.trim() : stdout)
        : reject(new Error(`git ${args[0]} failed: ${stderr.slice(0, 512)}`))
    );
    child.stdin.end(input);
  });
}

function remoteRepository(url, { host, allowLocalRemote }) {
  let path;
  const scp = /^git@([A-Za-z0-9.-]+):([^?#]+)$/.exec(url);
  if (scp) {
    if (scp[1].toLowerCase() !== host.toLowerCase()) return null;
    path = scp[2];
  } else if (url.startsWith('/') && allowLocalRemote) {
    path = url;
  } else {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (parsed.protocol === 'file:' && allowLocalRemote && !parsed.host) {
      path = parsed.pathname;
    } else if (
      ['https:', 'ssh:'].includes(parsed.protocol) &&
      parsed.hostname.toLowerCase() === host.toLowerCase() &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      (parsed.protocol !== 'ssh:' || parsed.username === 'git')
    ) {
      path = parsed.pathname;
    } else {
      return null;
    }
  }
  const match = /^\/?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(path);
  if (match) return `${match[1]}/${match[2]}`;
  if (!allowLocalRemote || !path.startsWith('/')) return null;
  const parts = path
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/');
  const owner = parts.at(-2);
  const repo = parts.at(-1);
  return owner && repo && REPO.test(`${owner}/${repo}`) ? `${owner}/${repo}` : null;
}

export function confirmsJournalEntry(snapshot, entry, mode) {
  const recorded =
    mode === 'local-trunk' && entry.schema === 'aitm.local-trunk-revision-barrier/v1'
      ? snapshot.barriers.get(entry.priorGrantRecordId)?.entry
      : mode === 'local-trunk' && entry.schema === 'aitm.local-trunk-revision-post/v1'
        ? snapshot.barriers.get(entry.priorGrantRecordId)?.post?.entry
        : snapshot.operations.get(entry.deliveryOperationId)?.entry;
  return Boolean(recorded && equal(recorded, entry));
}

export function createDeliveryWaiverJournal({
  cwd,
  repository,
  issue,
  remote = 'origin',
  host = 'github.com',
  allowLocalRemote = false,
  mode = 'waiver',
} = {}) {
  if (
    !bounded(cwd, 4096) ||
    !REPO.test(repository) ||
    !Number.isSafeInteger(issue) ||
    issue < 1 ||
    !/^[A-Za-z0-9._-]+$/.test(remote) ||
    !/^[A-Za-z0-9.-]+$/.test(host) ||
    !['waiver', 'local-trunk'].includes(mode)
  )
    refuse('configuration');
  const ref = `refs/heads/aitm/${mode === 'local-trunk' ? 'local-trunk-closes' : 'delivery-waivers'}/${issue}`;
  const project =
    mode === 'local-trunk' ? projectLocalTrunkCloseJournal : projectDeliveryWaiverJournal;
  const validate =
    mode === 'local-trunk'
      ? validateLocalTrunkCloseJournalEntry
      : validateDeliveryWaiverJournalEntry;
  const git = (args, input) => runGit(cwd, args, input);
  const gitRaw = (args, input) => runGit(cwd, args, input, false);
  let lastSeen = null;
  async function assertRemote() {
    const [fetchUrls, pushUrls] = await Promise.all([
      git(['remote', 'get-url', '--all', remote]),
      git(['remote', 'get-url', '--push', '--all', remote]),
    ]);
    const fetch = fetchUrls.split('\n');
    const push = pushUrls.split('\n');
    if (
      fetch.length !== 1 ||
      push.length !== 1 ||
      remoteRepository(fetch[0], { host, allowLocalRemote }) !== repository ||
      remoteRepository(push[0], { host, allowLocalRemote }) !== repository ||
      fetch[0] !== push[0]
    )
      refuse('remote-identity');
  }
  async function remoteTip() {
    const output = await git(['ls-remote', remote, ref]);
    if (!output) return null;
    const lines = output.split('\n');
    const [oid, advertisedRef] = lines[0].split(new RegExp('\\s+'));
    if (lines.length !== 1 || !SHA.test(oid) || advertisedRef !== ref) refuse('remote-ref');
    return oid;
  }
  async function read() {
    await assertRemote();
    const tip = await remoteTip();
    if (!tip) {
      if (lastSeen) refuse('history-reset');
      return project([], { repository, issue });
    }
    await git(['fetch', '--no-tags', remote, ref]);
    const fetched = await git(['rev-parse', 'FETCH_HEAD']);
    if (fetched !== tip) refuse('remote-drift');
    const reversed = [];
    const visited = new Set();
    let oid = tip;
    while (oid) {
      if (!SHA.test(oid) || visited.has(oid) || reversed.length >= MAX_HISTORY)
        refuse('history-cycle');
      visited.add(oid);
      const raw = await git(['cat-file', '-p', oid]);
      const [header] = raw.split('\n\n');
      const tree = /^tree ([0-9a-f]{40})$/m.exec(header)?.[1];
      const parents = [...header.matchAll(/^parent ([0-9a-f]{40})$/gm)].map((m) => m[1]);
      if (!tree || parents.length > 1) refuse('commit-shape');
      const listing = await git(['ls-tree', tree]);
      const blob = /^100644 blob ([0-9a-f]{40})\tentry\.json$/.exec(listing)?.[1];
      if (!blob) refuse('tree-shape');
      const body = await gitRaw(['cat-file', 'blob', blob]);
      if (Buffer.byteLength(body) > MAX_ENTRY_BYTES) refuse('entry-size');
      let entry;
      try {
        entry = JSON.parse(body);
      } catch {
        refuse('entry-json');
      }
      if (validate(entry) !== body) refuse('entry-canonical');
      if (entry.predecessorOid !== (parents[0] ?? null)) refuse('commit-parent');
      reversed.push({ oid, entry });
      oid = parents[0] ?? null;
    }
    const events = reversed.reverse();
    if (lastSeen && !events.some((event) => event.oid === lastSeen)) refuse('history-reset');
    lastSeen = tip;
    return project(events, { repository, issue });
  }
  async function compareAndAppend({ expectedOid, entry }) {
    await assertRemote();
    const before = await read();
    if (before.oid !== expectedOid) return { status: 'stale', snapshot: before };
    if (
      entry.predecessorOid !== expectedOid ||
      entry.sequence !== before.sequence + 1 ||
      entry.repository !== repository ||
      entry.issue !== issue
    )
      refuse('append-boundary');
    const projected = project(
      [...(await historyFromTip(before.oid)), { oid: '0'.repeat(40), entry }],
      { repository, issue }
    );
    if (
      mode === 'local-trunk' && entry.schema === 'aitm.local-trunk-revision-barrier/v1'
        ? !projected.barriers.has(entry.priorGrantRecordId)
        : mode === 'local-trunk' && entry.schema === 'aitm.local-trunk-revision-post/v1'
          ? !projected.barriers.get(entry.priorGrantRecordId)?.post
          : !projected.operations.has(entry.deliveryOperationId)
    )
      refuse('append-projection');
    const body = validate(entry);
    const blob = await git(['hash-object', '-w', '--stdin'], body);
    const tree = await git(['mktree'], `100644 blob ${blob}\tentry.json\n`);
    const args = [
      'commit-tree',
      tree,
      '-m',
      mode === 'waiver' ? 'AITM delivery waiver journal' : 'AITM local trunk journal',
    ];
    if (expectedOid) args.push('-p', expectedOid);
    const nextOid = await git(args);
    if (!SHA.test(nextOid)) refuse('created-oid');
    let pushError = null;
    try {
      await git([
        'push',
        '--porcelain',
        '--no-follow-tags',
        `--force-with-lease=${ref}:${expectedOid ?? ''}`,
        remote,
        `${nextOid}:${ref}`,
      ]);
    } catch (error) {
      pushError = error;
    }
    let after;
    try {
      after = await read();
    } catch {
      refuse('push-outcome');
    }
    if (after.oid === nextOid) return { status: 'appended', snapshot: after };
    if (confirmsJournalEntry(after, entry, mode)) {
      return { status: 'confirmed', snapshot: after };
    }
    if (pushError && after.oid === expectedOid) refuse('push-refused', 'missing');
    return { status: 'stale', snapshot: after };
  }
  async function historyFromTip(tip) {
    if (!tip) return [];
    const events = [];
    let oid = tip;
    while (oid) {
      const raw = await git(['cat-file', '-p', oid]);
      const tree = /^tree ([0-9a-f]{40})$/m.exec(raw)?.[1];
      const parent = /^parent ([0-9a-f]{40})$/m.exec(raw)?.[1] ?? null;
      const blob = /^100644 blob ([0-9a-f]{40})\tentry\.json$/.exec(
        await git(['ls-tree', tree])
      )?.[1];
      events.push({ oid, entry: JSON.parse(await gitRaw(['cat-file', 'blob', blob])) });
      oid = parent;
    }
    return events.reverse();
  }
  return Object.freeze({ read, compareAndAppend, ref });
}
