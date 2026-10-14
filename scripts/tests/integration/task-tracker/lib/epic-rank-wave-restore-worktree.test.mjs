// @story #2014
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { retainedRecoveryFixture as fixture } from '../../../helpers/retained-recovery-fixture.mjs';
import {
  sealRankWaveRecord,
  rankWaveProposal,
} from '../../../../task-tracker/lib/epic-rank-wave-authority.mjs';
import { rankWaveDigest } from '../../../../task-tracker/lib/epic-rank-wave-policy.mjs';
import { serializeIssueWorktreeLocationMarker } from '../../../../task-tracker/lib/issue-worktree-location.mjs';

// Dropping registered restoration or resetting the existing branch must fail this real-Git contract.
test('registered restoration recreates only the retained checkout, preserves refs and is idempotent', async () => {
  const f = fixture();
  try {
    const refs = f.git(['show-ref']);
    const restored = await f.restore();
    assert.equal(restored.status, 'restored', JSON.stringify(restored));
    assert.equal(existsSync(path.join(f.binding.worktree, 'tracked.txt')), true);
    assert.equal(f.git(['-C', f.binding.worktree, 'rev-parse', 'HEAD']), f.head);
    assert.equal(f.git(['show-ref']), refs);
    assert.equal((await f.restore()).status, 'already-restored');
    assert.equal(f.git(['show-ref']), refs);
    assert.ok(f.sourceCalls.every((c) => c.through === '2026-10-04T01:00:00.000Z'));
  } finally {
    f.cleanup();
  }
});

for (const [name, change] of [
  [
    'unknown selector keys',
    (f) => {
      f.input.path = f.binding.worktree;
    },
  ],
  [
    'wrong rank',
    (f) => {
      f.input.rank = 1;
    },
  ],
  [
    'unrelated child',
    (f) => {
      f.input.child = 141;
    },
  ],
  [
    'non-Done child',
    (f) => {
      f.child.boardState = 'review';
    },
  ],
  [
    'reopened child',
    (f) => {
      f.child.issueState = 'open';
    },
  ],
  [
    'cancelled child',
    (f) => {
      f.child.closeReason = 'not_planned';
    },
  ],
  [
    'uncertain completion',
    (f) => {
      f.child.recoveryPhase = 'pending';
    },
  ],
  [
    'location drift',
    (f) => {
      f.child.body = serializeIssueWorktreeLocationMarker({
        worktreePath: f.binding.worktree + '-moved',
        worktreeBranch: 'child',
        ts: '2026-10-14T01:00:00.000Z',
      });
    },
  ],
  [
    'history tampering',
    (f) => {
      f.comments[0].wave.record.bindings[0].sessionId = 'replacement';
    },
  ],
  [
    'foreign repository',
    (f) => {
      f.comments[0].wave.record.repository = 'other/repo';
    },
  ],
  [
    'unverified historical source',
    (f) => {
      f.runtime.verifySource = async () => ({ status: 'blocked' });
    },
  ],
  [
    'unverified retained native identity',
    (f) => {
      f.runtime.verifyRetainedNative = async () => ({ verified: true, sessionId: 'replacement' });
    },
  ],
  [
    'active claim',
    (f) => {
      f.runtime.readRecoveryClaims = async () => ({
        140: { issue: 140, worktreePath: f.binding.worktree },
      });
    },
  ],
  [
    'conflicting path claim',
    (f) => {
      f.runtime.readRecoveryClaims = async () => ({
        141: { issue: 141, worktreePath: f.binding.worktree },
      });
    },
  ],
  [
    'wrong current parent',
    (f) => {
      f.runtime.assertRecoveryParent = async () => ({ ...f.parent, issue: 108 });
    },
  ],
  [
    'parent authority refusal',
    (f) => {
      f.runtime.assertRecoveryParent = async () => {
        throw new Error('role/session/generation/timer/owner refused');
      };
    },
  ],
  [
    'branch-head mismatch',
    (f) => {
      f.input.expectedHead = 'f'.repeat(40);
    },
  ],
]) {
  test(`restoration refuses ${name} before physical effects`, async () => {
    const f = fixture();
    try {
      const refs = f.git(['show-ref']);
      change(f);
      const result = await f.restore();
      assert.equal(result.status, 'blocked', JSON.stringify(result));
      assert.equal(existsSync(f.binding.worktree), false);
      assert.equal(f.git(['show-ref']), refs);
    } finally {
      f.cleanup();
    }
  });
}

test('a retained expired grant restores history without renewing the grant', async () => {
  const f = fixture();
  try {
    const record = f.comments[0].wave.record;
    record.expiresAt = '2026-10-05T01:00:00.000Z';
    const proposal = {
      schema: 'aitm.rank-wave-proposal/v1',
      operationId: record.id,
      repository: record.repository,
      epic: record.epic,
      rank: record.rank,
      members: record.members,
      graph: record.graph,
      bindings: record.bindings,
      parent: record.parent,
      expiresAt: record.expiresAt,
    };
    record.proposalDigest = rankWaveDigest(proposal);
    f.comments[0].wave = sealRankWaveRecord(record);
    f.input.retainedDigest = f.comments[0].wave.digest;
    const before = JSON.stringify(f.comments);
    assert.equal((await f.restore()).status, 'restored');
    assert.equal(JSON.stringify(f.comments), before);
  } finally {
    f.cleanup();
  }
});

test('authority race before effect refuses and preserves the missing checkout', async () => {
  const f = fixture();
  let reads = 0;
  try {
    f.runtime.readSnapshot = async () => ({
      children: [{ ...f.child, issueState: ++reads === 1 ? 'closed' : 'open' }],
    });
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(existsSync(f.binding.worktree), false);
  } finally {
    f.cleanup();
  }
});

test('authority change after effect is indeterminate and preserves the checkout', async () => {
  const f = fixture();
  let reads = 0;
  try {
    f.runtime.readSnapshot = async () => ({
      children: [{ ...f.child, issueState: ++reads < 3 ? 'closed' : 'open' }],
    });
    assert.equal((await f.restore()).status, 'indeterminate');
    assert.equal(existsSync(path.join(f.binding.worktree, 'tracked.txt')), true);
  } finally {
    f.cleanup();
  }
});

for (const code of ['EIO', 'ETIMEDOUT']) {
  test(`Git ${code} preserves partial effects and reports indeterminate`, async () => {
    const { mkdirSync } = await import('node:fs');
    const f = fixture();
    try {
      f.runtime.addRestoredWorktree = (b) => {
        mkdirSync(b.worktree);
        writeFileSync(path.join(b.worktree, 'partial'), 'evidence');
        throw Object.assign(new Error(code), { code });
      };
      assert.equal((await f.restore()).status, 'indeterminate');
      assert.equal(existsSync(path.join(f.binding.worktree, 'partial')), true);
    } finally {
      f.cleanup();
    }
  });
}

test('uncertain dirty read-back is indeterminate without cleanup', async () => {
  const f = fixture(),
    add = f.runtime.addRestoredWorktree;
  try {
    f.runtime.addRestoredWorktree = (b) => {
      add(b);
      writeFileSync(path.join(b.worktree, 'unexpected'), 'evidence');
    };
    assert.equal((await f.restore()).status, 'indeterminate');
    assert.equal(existsSync(path.join(f.binding.worktree, 'unexpected')), true);
  } finally {
    f.cleanup();
  }
});

test('stale registration is refused without pruning or resetting its branch', async () => {
  const f = fixture();
  try {
    f.git(['worktree', 'add', '--', f.binding.worktree, 'child']);
    rmSync(f.binding.worktree, { recursive: true, force: true });
    const registrations = f.git(['worktree', 'list', '--porcelain']);
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(f.git(['worktree', 'list', '--porcelain']), registrations);
    assert.equal(f.git(['rev-parse', 'child']), f.head);
  } finally {
    f.cleanup();
  }
});

for (const collision of ['directory', 'file', 'symlink']) {
  test(`existing ${collision} collision is refused without deleting it`, async () => {
    const { mkdirSync, symlinkSync, lstatSync } = await import('node:fs');
    const f = fixture();
    try {
      if (collision === 'directory') mkdirSync(f.binding.worktree);
      else if (collision === 'file') writeFileSync(f.binding.worktree, 'collision');
      else symlinkSync(f.root, f.binding.worktree);
      const inode = lstatSync(f.binding.worktree).ino;
      assert.equal((await f.restore()).status, 'blocked');
      assert.equal(lstatSync(f.binding.worktree).ino, inode);
    } finally {
      f.cleanup();
    }
  });
}

test('source ancestry mismatch refuses an unrelated existing child head', async () => {
  const f = fixture();
  try {
    const orphan = f.git(['hash-object', '-t', 'tree', '--stdin']);
    f.input.expectedHead = f.git(['commit-tree', orphan, '-m', 'unrelated']);
    f.git(['branch', '-f', 'child', f.input.expectedHead]);
    const refs = f.git(['show-ref']);
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(f.git(['show-ref']), refs);
  } finally {
    f.cleanup();
  }
});

test('ambient Git redirection cannot redirect restoration to another repository', async () => {
  const f = fixture(),
    prior = process.env.GIT_DIR;
  try {
    process.env.GIT_DIR = path.join(f.root, 'foreign.git');
    assert.equal((await f.restore()).status, 'restored');
    assert.equal(f.git(['rev-parse', 'child']), f.head);
  } finally {
    if (prior === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = prior;
    f.cleanup();
  }
});

test('real historical source verification excludes later pauses without admitting current continuation', async () => {
  const { createRankWaveSourceLoader, verifyRankWaveSource } =
    await import('../../../../task-tracker/lib/epic-rank-wave-source.mjs');
  const { hashAuthorizationStatement } =
    await import('../../../../task-tracker/lib/workflow-policy/authority-resolver.mjs');
  const f = fixture();
  try {
    const statement = 'Authorize epic 107 rank 2 members [140] in parallel.';
    const file = path.join(f.root, 'historical.jsonl');
    const sid = 'historical-human';
    writeFileSync(
      file,
      [
        { type: 'session_meta', payload: { id: sid, cwd: f.root } },
        {
          type: 'response_item',
          timestamp: '2026-10-04T00:59:00.000Z',
          payload: {
            type: 'message',
            id: 'm1',
            role: 'user',
            content: [{ type: 'input_text', text: statement }],
          },
        },
        {
          type: 'response_item',
          timestamp: '2026-10-04T02:00:00.000Z',
          payload: {
            type: 'message',
            id: 'later',
            role: 'user',
            content: [{ type: 'input_text', text: 'Pause epic 107 rank 2 now.' }],
          },
        },
      ]
        .map((x) => JSON.stringify(x))
        .join('\n') + '\n'
    );
    const record = f.comments[0].wave.record;
    record.source.messages[0].statementHash = hashAuthorizationStatement(statement);
    f.comments[0].wave = sealRankWaveRecord(record);
    f.input.retainedDigest = f.comments[0].wave.digest;
    const loadContext = createRankWaveSourceLoader({
      resolveTranscriptPath: async () => file,
      resolveRepository: async () => 'o/r',
    });
    f.runtime.verifySource = (args) => verifyRankWaveSource({ ...args, loadContext });
    const current = await f.runtime.verifySource({
      source: record.source,
      scope: { repository: 'o/r', epic: 107, rank: 2, members: [140] },
      recordingActor: record.recordingActor,
    });
    assert.equal(current.status, 'blocked');
    assert.equal((await f.restore()).status, 'restored');
  } finally {
    f.cleanup();
  }
});

test('native retained observation verifies an archived Codex identity without replacing ordinary physical verification', async () => {
  const { mkdirSync } = await import('node:fs');
  const { observeRetainedRankWaveNative, observeRankWaveNative } =
    await import('../../../../task-tracker/lib/epic-rank-wave-bindings.mjs');
  const f = fixture();
  try {
    const home = path.join(f.root, 'native-home');
    const binding = { ...f.binding, sessionId: '00000000-0000-4000-8000-000000000140' };
    const directory = path.join(home, '.codex', 'sessions', '2026', '10', '14');
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `rollout-2026-10-14T00-00-00-${binding.sessionId}.jsonl`);
    writeFileSync(
      file,
      JSON.stringify({
        type: 'session_meta',
        payload: { id: binding.sessionId, cwd: binding.worktree },
      }) + '\n'
    );
    assert.deepEqual(await observeRetainedRankWaveNative(binding, { home }), {
      verified: true,
      sessionId: binding.sessionId,
    });
    await assert.rejects(observeRankWaveNative(binding, { home }));
    writeFileSync(
      file,
      JSON.stringify({
        type: 'session_meta',
        payload: { id: 'other-native', cwd: binding.worktree },
      }) + '\n'
    );
    await assert.rejects(observeRetainedRankWaveNative(binding, { home }));
  } finally {
    f.cleanup();
  }
});

test('branch registered at a different path is refused without moving it', async () => {
  const f = fixture();
  try {
    const other = path.join(f.root, 'other-checkout');
    f.git(['worktree', 'add', '--', other, 'child']);
    const before = f.git(['worktree', 'list', '--porcelain']);
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(f.git(['worktree', 'list', '--porcelain']), before);
  } finally {
    f.cleanup();
  }
});

test('writable destination namespace is refused without changing its permissions', async () => {
  const { chmodSync, statSync } = await import('node:fs');
  const f = fixture();
  try {
    chmodSync(f.root, 0o777);
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(statSync(f.root).mode & 0o777, 0o777);
  } finally {
    f.cleanup();
  }
});

test('refs changing across pre-effect authority reads refuse without compensation', async () => {
  const f = fixture();
  let calls = 0;
  try {
    f.runtime.assertRecoveryParent = async () => {
      if (++calls === 2) f.git(['branch', 'concurrent-ref']);
      return structuredClone(f.parent);
    };
    assert.equal((await f.restore()).status, 'blocked');
    assert.equal(existsSync(f.binding.worktree), false);
    assert.equal(f.git(['rev-parse', 'concurrent-ref']), f.head);
  } finally {
    f.cleanup();
  }
});

test('unrelated claim heartbeats do not block restoration or get rewritten', async () => {
  const f = fixture();
  let heartbeat = 0;
  try {
    f.runtime.readRecoveryClaims = async () => ({
      141: {
        issue: 141,
        worktreePath: path.join(f.root, 'unrelated'),
        lastHeartbeatAt: ++heartbeat,
      },
    });
    assert.equal((await f.restore()).status, 'restored');
    assert.equal(heartbeat, 3);
  } finally {
    f.cleanup();
  }
});

test('production child dependency observations do not invalidate completed checkout restoration', async () => {
  const f = fixture();
  try {
    f.child.dependencyStates = new Map([[101, 'done']]);
    f.child.optionalObservation = undefined;
    assert.equal((await f.restore()).status, 'restored');
  } finally {
    f.cleanup();
  }
});

test('replaced destination ancestor after preflight is indeterminate and retains checkout', async () => {
  const { mkdirSync, renameSync } = await import('node:fs');
  const f = fixture();
  try {
    const namespace = path.join(f.root, 'namespace');
    mkdirSync(namespace);
    f.binding.worktree = path.join(namespace, 'retained-child');
    f.child.body = serializeIssueWorktreeLocationMarker({
      worktreePath: f.binding.worktree,
      worktreeBranch: f.binding.branch,
      sessionId: f.binding.sessionId,
      ts: '2026-10-04T01:00:00.000Z',
    });
    const record = { ...f.wave.record, bindings: [f.binding] };
    record.proposalDigest = rankWaveDigest(rankWaveProposal(record));
    f.comments[0].wave = sealRankWaveRecord(record);
    f.input.retainedDigest = f.comments[0].wave.digest;
    f.runtime.addRestoredWorktree = (binding) => {
      renameSync(namespace, namespace + '-retained');
      mkdirSync(namespace);
      f.git(['worktree', 'add', '--', binding.worktree, binding.branch]);
    };
    const refs = f.git(['show-ref']);
    const result = await f.restore();
    assert.equal(result.status, 'indeterminate', JSON.stringify(result));
    assert.equal(existsSync(path.join(f.binding.worktree, 'tracked.txt')), true);
    assert.equal(existsSync(namespace + '-retained'), true);
    assert.equal(f.git(['show-ref']), refs);
  } finally {
    f.cleanup();
  }
});

test('production recovery refuses uncertain retained timer evidence while allowing genuine absence', async () => {
  const { mkdirSync } = await import('node:fs');
  const { activeTaskPath } = await import('../../../../task-tracker/paths.mjs');
  const { createRankWaveRuntime } =
    await import('../../../../task-tracker/lib/epic-rank-wave-runtime.mjs');
  const f = fixture();
  try {
    const runtime = createRankWaveRuntime(
      { cfg: { repo: 'o/r' }, projectDir: f.root },
      { ports: { rows: () => ({}) } }
    );
    assert.deepEqual(await runtime.readRecoveryClaims(f.binding), {});
    assert.equal((await f.restore()).status, 'restored');
    writeFileSync(path.join(f.root, '.git', 'info', 'exclude'), '.tmp/\n');
    f.runtime.readRecoveryClaims = runtime.readRecoveryClaims;
    const file = activeTaskPath(f.binding.sessionId, f.binding.worktree);
    mkdirSync(path.dirname(file), { recursive: true });
    for (const raw of [
      '',
      '{',
      'null',
      '[]',
      '{}',
      '{"issue":"#140"}',
      '{"issue":"#140","entryStartTs":"invalid"}',
    ]) {
      writeFileSync(file, raw);
      await assert.rejects(runtime.readRecoveryClaims(f.binding), /retained worker timer/);
      assert.equal((await f.restore()).status, 'blocked');
    }
    rmSync(file);
    mkdirSync(file);
    await assert.rejects(runtime.readRecoveryClaims(f.binding), /retained worker timer/);
    assert.equal((await f.restore()).status, 'blocked');
    rmSync(file, { recursive: true });
    const active = { issue: '#140', entryStartTs: '2026-10-14T01:00:00.000Z' };
    writeFileSync(file, JSON.stringify(active));
    await assert.rejects(runtime.readRecoveryClaims(f.binding), /retained worker timer active/);
    for (const state of [
      { issue: null, entryStartTs: null },
      { ...active, pausedAtTs: '2026-10-14T02:00:00.000Z' },
      { ...active, closedAt: '2026-10-14T02:00:00.000Z' },
    ]) {
      writeFileSync(file, JSON.stringify(state));
      assert.deepEqual(await runtime.readRecoveryClaims(f.binding), {});
      assert.equal((await f.restore()).status, 'already-restored');
    }
  } finally {
    f.cleanup();
  }
});

test('retained native recovery recognizes authenticated historical worktree execution after primary checkout startup', async () => {
  const { mkdirSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const { observeRetainedRankWaveNative } =
    await import('../../../../task-tracker/lib/epic-rank-wave-bindings.mjs');
  const f = fixture();
  try {
    const home = path.join(f.root, 'native-home');
    const binding = { ...f.binding, sessionId: '00000000-0000-4000-8000-000000000141' };
    const directory = path.join(home, '.codex', 'sessions', '2026', '10', '14');
    mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `rollout-2026-10-14T00-00-00-${binding.sessionId}.jsonl`);
    const metadata = { type: 'session_meta', payload: { id: binding.sessionId, cwd: f.root } };
    const command = {
      type: 'event_msg',
      payload: {
        type: 'item_completed',
        thread_id: binding.sessionId,
        turn_id: 'fixture-turn',
        item: {
          type: 'CommandExecution',
          id: 'fixture-exec',
          cwd: pathToFileURL(binding.worktree).href,
          status: 'completed',
          exit_code: 0,
        },
      },
    };
    const save = (rows) =>
      writeFileSync(file, rows.map((e) => JSON.stringify(e)).join('\n') + '\n');
    save([metadata, command]);
    assert.deepEqual(await observeRetainedRankWaveNative(binding, { home }), {
      verified: true,
      sessionId: binding.sessionId,
    });
    assert.equal(existsSync(binding.worktree), false);
    for (const evidence of [
      { type: 'turn_context', payload: { cwd: binding.worktree } },
      {
        ...command,
        payload: { ...command.payload, item: { ...command.payload.item, cwd: binding.worktree } },
      },
    ]) {
      save([metadata, evidence]);
      assert.equal((await observeRetainedRankWaveNative(binding, { home })).verified, true);
    }
    for (const evidence of [
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: binding.worktree }],
        },
      },
      { ...command, payload: { ...command.payload, thread_id: 'foreign-thread' } },
      {
        ...command,
        payload: { ...command.payload, item: { ...command.payload.item, status: 'in_progress' } },
      },
      {
        ...command,
        payload: {
          ...command.payload,
          item: { ...command.payload.item, cwd: f.root, command: [binding.worktree] },
        },
      },
    ]) {
      save([metadata, evidence]);
      await assert.rejects(observeRetainedRankWaveNative(binding, { home }));
    }
    save([command, metadata]);
    await assert.rejects(observeRetainedRankWaveNative(binding, { home }));
    save([
      {
        ...metadata,
        payload: { ...metadata.payload, cwd: path.join(f.root, 'missing-foreign-root') },
      },
      command,
    ]);
    await assert.rejects(observeRetainedRankWaveNative(binding, { home }));
  } finally {
    f.cleanup();
  }
});
