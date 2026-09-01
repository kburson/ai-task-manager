// @story #1453

import {
  canonicalJson,
  fingerprint,
  renderBodyLedgerHead,
  renderSpillHeadComment,
} from '../../task-tracker/lib/resident-action-ledger-codec.mjs';
import {
  advanceActionLedgerHead as writeActionLedgerHead,
  appendActionEvent as writeActionEvent,
} from '../../task-tracker/lib/resident-action-ledger-write.mjs';
import { RepositoryAdapter } from '../../task-tracker/lib/repository-adapter.mjs';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

export function validSpillHead(overrides = {}) {
  return renderSpillHeadComment({
    schema: 'aitm.resident-action-head/v1',
    visit: 'review:1',
    commit: null,
    definition: HASH_B,
    audit: null,
    actions: {},
    ...overrides,
  });
}

export function bodyPointingAt(commentId, commentBody = validSpillHead()) {
  return renderBodyLedgerHead({
    mode: 'spill',
    visit: 'review:1',
    commit: `100:${HASH_A}`,
    audit: `100:${HASH_A}`,
    head: `${commentId}:${fingerprint(commentBody)}`,
  });
}

export class InMemoryRepositoryAdapter extends RepositoryAdapter {
  constructor(seed = {}) {
    const shared = seed.sharedStore ?? {
      repo: seed.repo ?? 'kburson/ai-task-manager',
      issue: seed.issue ?? 1117,
      body: seed.body ?? '',
      statusState: seed.statusState ?? 'review',
      stateVisitId: seed.stateVisitId ?? `${seed.statusState ?? 'review'}:1`,
      actionId: seed.actionId,
      correlation: seed.correlation,
      comments: new Map(),
      nextCommentId: 100,
      missingComments: new Set((seed.missingComments ?? []).map(String)),
      missingCallbacks: new Map(),
      abortAt: seed.abortAt ?? null,
      abortDisabled: false,
      aborted: false,
      now: seed.now,
      checkpoints: new Map(),
      providerEffects: new Map(),
      boundaryCount: 0,
      mutations: { body: 0, comments: 0, providerEffects: 0, boundaries: 0 },
    };
    super({
      body: shared.body,
      offlineBody: shared.body,
      statusState: shared.statusState,
      offlineStatusState: shared.statusState,
      stateVisitId: shared.stateVisitId,
      actionId: shared.actionId,
      now: shared.now,
      gitSnapshot: seed.gitSnapshot ?? { headSha: 'abc123' },
      worktree: seed.worktree ?? { issue: shared.issue, cwd: '/worktree' },
      checks: seed.checks ?? [],
    });
    this.store = shared;
    this.comments = shared.comments;
    this.missingComments = shared.missingComments;
    this.missingCallbacks = shared.missingCallbacks;
    this.rejectNetwork = seed.rejectNetwork === true;
    this.networkOperations = [];
    this.reads = { issueBody: 0, commentIds: [], timeline: 0 };
  }

  get body() {
    return this.store.body;
  }

  get statusState() {
    return this.store.statusState;
  }

  get providerEffectCount() {
    return this.store.providerEffects.size;
  }

  get boundaryCount() {
    return this.store.boundaryCount;
  }

  setBody(body) {
    this.store.body = body;
    this.store.mutations.body += 1;
    this.capabilities = Object.freeze({
      ...this.capabilities,
      body,
      offlineBody: body,
    });
  }

  addComment(commentId, body) {
    this.comments.set(String(commentId), { id: String(commentId), body });
    this.missingComments.delete(String(commentId));
  }

  onMissingComment(commentId, callback) {
    this.missingCallbacks.set(String(commentId), callback);
  }

  recordNetwork(operation) {
    if (this.rejectNetwork) throw new Error(`network-refused:${operation}`);
    this.networkOperations.push(operation);
  }

  async readIssueBody() {
    this.recordNetwork('readIssueBody');
    this.reads.issueBody += 1;
    return this.store.body;
  }

  async resolveLiveState() {
    this.recordNetwork('resolveLiveState');
    return this.store.statusState;
  }

  async readMoveSignals() {
    return {
      sentinelState: this.store.statusState,
      statusState: this.store.statusState,
      entryMarkerPresent: true,
      exitRowPresent: true,
      entryRowPresent: true,
    };
  }

  async readComment({ commentId }) {
    const id = String(commentId);
    this.recordNetwork(`readComment:${id}`);
    this.reads.commentIds.push(id);
    if (this.missingComments.has(id) || !this.comments.has(id)) {
      const callback = this.missingCallbacks.get(id);
      if (callback) callback();
      return null;
    }
    return this.comments.get(id);
  }

  async hydrateTask(args = {}) {
    this.capabilities = Object.freeze({
      ...this.capabilities,
      stateVisitId: this.store.stateVisitId,
      actionId: args.actionId ?? this.store.actionId,
      body: this.store.body,
      offlineBody: this.store.body,
      statusState: this.store.statusState,
      offlineStatusState: this.store.statusState,
    });
    return super.hydrateTask(args);
  }

  mutationSnapshot() {
    return Object.freeze({ ...this.store.mutations });
  }

  freshAdapter() {
    return new InMemoryRepositoryAdapter({ sharedStore: this.store });
  }

  disableAbort() {
    this.store.abortDisabled = true;
  }

  async checkpoint(point) {
    const count = (this.store.checkpoints.get(point) ?? 0) + 1;
    this.store.checkpoints.set(point, count);
    const configured = this.store.abortAt;
    const target = typeof configured === 'string' ? configured : configured?.point;
    const occurrence =
      configured && typeof configured === 'object' ? (configured.occurrence ?? 1) : 1;
    if (
      !this.store.abortDisabled &&
      !this.store.aborted &&
      point === target &&
      count === occurrence
    ) {
      this.store.aborted = true;
      throw new Error(`abort:${point}`);
    }
  }

  resolveCorrelation({ action }) {
    return (
      this.store.correlation ?? {
        key: `${this.store.stateVisitId}:${action.id}`,
      }
    );
  }

  async withCorrelationIntent({ correlation }, operation) {
    return operation(correlation);
  }

  async withIssueLock(_args, operation) {
    return operation();
  }

  async appendActionEvent(args) {
    return writeActionEvent({
      ...args,
      repository: this.store.repo,
      deps: this.writerDependencies(),
    });
  }

  async advanceActionLedgerHead(args) {
    return writeActionLedgerHead({
      ...args,
      repo: args.repo ?? this.store.repo,
      deps: this.writerDependencies(),
    });
  }

  writerDependencies() {
    return {
      checkpoint: (point, details) => this.checkpoint(point, details),
      now: () => Date.parse('2026-08-31T12:01:00.000Z'),
      fetchBody: async () => this.store.body,
      pushBody: async (_repo, _issue, body) => this.setBody(body),
      createComment: async (_issue, body) => {
        const id = String(this.store.nextCommentId++);
        const comment = { id, body };
        this.comments.set(id, comment);
        this.store.mutations.comments += 1;
        return comment;
      },
      readComment: async (_issue, id) => this.comments.get(String(id)) ?? null,
      findEventById: async (_issue, eventId) => {
        for (const comment of this.comments.values()) {
          if (comment.body.includes(`id="${eventId}"`)) return comment;
        }
        return null;
      },
    };
  }

  async recordProviderEffect({ correlation, apply } = {}) {
    const key = canonicalJson(correlation ?? {});
    if (this.store.providerEffects.has(key)) return this.store.providerEffects.get(key);
    const record = Object.freeze({ correlation });
    this.store.providerEffects.set(key, record);
    this.store.mutations.providerEffects += 1;
    await apply?.();
    return record;
  }

  async requestLegacyBoundary({ target }) {
    this.store.statusState = target;
    this.store.stateVisitId = `${target}:1`;
    this.store.boundaryCount += 1;
    this.store.mutations.boundaries += 1;
    return { kind: 'moved', phase: 'commit', exit: 0 };
  }
}

export function seededRepository(seed = {}) {
  return new InMemoryRepositoryAdapter(seed);
}
