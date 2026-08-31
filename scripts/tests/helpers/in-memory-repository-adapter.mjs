// @story #1453

import {
  fingerprint,
  renderBodyLedgerHead,
  renderSpillHeadComment,
} from '../../task-tracker/lib/resident-action-ledger-codec.mjs';
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
    super({
      body: seed.body ?? '',
      offlineBody: seed.body ?? '',
      statusState: seed.statusState ?? 'review',
      offlineStatusState: seed.statusState ?? 'review',
      stateVisitId: seed.stateVisitId ?? 'review:1',
      actionId: seed.actionId,
      gitSnapshot: seed.gitSnapshot ?? { headSha: 'abc123' },
      worktree: seed.worktree ?? { issue: 1117, cwd: '/worktree' },
      checks: seed.checks ?? [],
      moveSignals: seed.moveSignals ?? {
        sentinelState: seed.statusState ?? 'review',
        statusState: seed.statusState ?? 'review',
        entryMarkerPresent: true,
        exitRowPresent: true,
        entryRowPresent: true,
      },
    });
    this.body = seed.body ?? '';
    this.statusState = seed.statusState ?? 'review';
    this.comments = new Map();
    this.missingComments = new Set((seed.missingComments ?? []).map(String));
    this.missingCallbacks = new Map();
    this.rejectNetwork = seed.rejectNetwork === true;
    this.networkOperations = [];
    this.reads = { issueBody: 0, commentIds: [], timeline: 0 };
  }

  setBody(body) {
    this.body = body;
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
    return this.body;
  }

  async resolveLiveState() {
    this.recordNetwork('resolveLiveState');
    return this.statusState;
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
}

export function seededRepository(seed = {}) {
  return new InMemoryRepositoryAdapter(seed);
}
