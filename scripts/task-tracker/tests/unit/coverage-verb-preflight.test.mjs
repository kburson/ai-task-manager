// @story #633
// Coverage-lift unit test for `lib/verb-preflight.mjs`: `runPreflight` (pure
// core), the two module-private default fetchers (driven through the #633
// `deps.gql`/`deps.exec` default-through seam), and the `preflightVerb` wrapper
// (driven with stubbed `process.exit`/stdout/stderr). Zero subprocess.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runPreflight,
  preflightVerb,
  EXIT_BIND_MISMATCH,
  EXIT_HUMAN_MOVE,
  EXIT_ASSIGNEE_MISMATCH,
} from '../../lib/verb-preflight.mjs';

const cfg = { repo: 'kburson/ai-task-manager', projectId: 'P_1' };
const noGateCfg = { ...cfg, preferences: { gateAssigneeMatch: false } };

// ---- runPreflight guards --------------------------------------------------

test('runPreflight: missing stateBefore throws', async () => {
  await assert.rejects(() => runPreflight({}), /stateBefore is required/);
});

test('runPreflight: bind mismatch returns exit 7 verdict', async () => {
  const res = await runPreflight({ stateBefore: { active: '#999' }, target: '633' });
  assert.equal(res.ok, false);
  assert.equal(res.code, EXIT_BIND_MISMATCH);
  assert.equal(res.kind, 'bind-mismatch');
});

test('runPreflight: no bound issue returns ok/no-change', async () => {
  const res = await runPreflight({ stateBefore: { active: null }, target: null });
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
});

test('runPreflight: TT_SKIP_NETWORK=1 short-circuits to ok', async () => {
  const prev = process.env.TT_SKIP_NETWORK;
  process.env.TT_SKIP_NETWORK = '1';
  try {
    const res = await runPreflight({ stateBefore: { active: '633' } });
    assert.equal(res.ok, true);
    assert.equal(res.skippedNetwork, true);
  } finally {
    if (prev === undefined) delete process.env.TT_SKIP_NETWORK;
    else process.env.TT_SKIP_NETWORK = prev;
  }
});

test('runPreflight: missing cfg returns ok', async () => {
  const prev = process.env.TT_SKIP_NETWORK;
  delete process.env.TT_SKIP_NETWORK;
  try {
    const res = await runPreflight({ stateBefore: { active: '633' }, cfg: null });
    assert.equal(res.ok, true);
    assert.equal(res.changed, false);
  } finally {
    if (prev !== undefined) process.env.TT_SKIP_NETWORK = prev;
  }
});

// ---- assignee gate --------------------------------------------------------

test('runPreflight: assignee mismatch returns EXIT_ASSIGNEE_MISMATCH', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg,
    deps: {
      fetchAssignees: async () => ['alice'],
      fetchCurrentUser: async () => 'bob',
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, EXIT_ASSIGNEE_MISMATCH);
  assert.equal(res.kind, 'assignee-mismatch');
});

test('runPreflight: a throwing assignee check is swallowed and proceeds to ok', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg,
    deps: {
      fetchCurrentUser: async () => {
        throw new Error('user-boom');
      },
      fetchLive: async () => '',
    },
  });
  assert.equal(res.ok, true);
});

// ---- drift ----------------------------------------------------------------

test('runPreflight: fetchLive throwing degrades to empty → ok', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => {
        throw new Error('live-boom');
      },
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
});

test('runPreflight: marker equal to live → ok (no drift)', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'develop',
    },
  });
  assert.equal(res.ok, true);
  assert.equal(res.changed, false);
});

test('runPreflight: absent marker → ok', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => null,
    },
  });
  assert.equal(res.ok, true);
});

test('runPreflight: marker != live → human-move (exit 9) with actor', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'refine',
      fetchLastStatusActor: async () => ({ login: 'alice', type: 'User' }),
    },
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, EXIT_HUMAN_MOVE);
  assert.equal(res.kind, 'human-move');
  assert.equal(res.live, 'develop');
  assert.equal(res.marker, 'refine');
  assert.deepEqual(res.actor, { login: 'alice', type: 'User' });
});

test('runPreflight: a throwing actor fetch degrades to null actor', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'refine',
      fetchLastStatusActor: async () => {
        throw new Error('actor-boom');
      },
    },
  });
  assert.equal(res.kind, 'human-move');
  assert.equal(res.actor, null);
});

// ---- default fetchers via deps.gql / deps.exec ----------------------------

const MARKER_BODY = 'preamble\n<!-- aitm-last-known-state: refine -->\n';

test('default fetchers: deps.gql marker + deps.exec timeline actor drive human-move', async () => {
  const timeline = JSON.stringify([
    { event: 'labeled' },
    { event: 'moved_columns_in_project', actor: { login: 'carol', type: 'User' } },
  ]);
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      gql: async () => ({ repository: { issue: { body: MARKER_BODY } } }),
      exec: async () => ({ stdout: timeline }),
    },
  });
  assert.equal(res.kind, 'human-move');
  assert.equal(res.marker, 'refine');
  assert.deepEqual(res.actor, { login: 'carol', type: 'User' });
});

test('default fetchers: a throwing gql yields null marker → ok', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      gql: async () => {
        throw new Error('gql-boom');
      },
    },
  });
  assert.equal(res.ok, true);
});

test('default fetchers: non-array timeline → null actor', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      gql: async () => ({ repository: { issue: { body: MARKER_BODY } } }),
      exec: async () => ({ stdout: '{}' }),
    },
  });
  assert.equal(res.kind, 'human-move');
  assert.equal(res.actor, null);
});

test('default fetchers: no moved-columns event → null actor', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      gql: async () => ({ repository: { issue: { body: MARKER_BODY } } }),
      exec: async () => ({ stdout: JSON.stringify([{ event: 'labeled' }]) }),
    },
  });
  assert.equal(res.kind, 'human-move');
  assert.equal(res.actor, null);
});

test('default fetchers: a throwing exec yields null actor', async () => {
  const res = await runPreflight({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    deps: {
      fetchLive: async () => 'develop',
      gql: async () => ({ repository: { issue: { body: MARKER_BODY } } }),
      exec: async () => {
        throw new Error('exec-boom');
      },
    },
  });
  assert.equal(res.kind, 'human-move');
  assert.equal(res.actor, null);
});

// ---- preflightVerb wrapper (stub process.exit + writes) -------------------

function runVerb(opts) {
  const realExit = process.exit;
  const realOut = process.stdout.write;
  const realErr = process.stderr.write;
  const out = [];
  const err = [];
  let exitCode;
  process.stdout.write = (s) => {
    out.push(String(s));
    return true;
  };
  process.stderr.write = (s) => {
    err.push(String(s));
    return true;
  };
  process.exit = (code) => {
    exitCode = code;
    throw new Error(`__EXIT__${code}`);
  };
  return preflightVerb(opts)
    .then((stateAfter) => ({ stateAfter, out, err, exitCode }))
    .catch((e) => {
      if (!String(e.message).startsWith('__EXIT__')) throw e;
      return { out, err, exitCode };
    })
    .finally(() => {
      process.exit = realExit;
      process.stdout.write = realOut;
      process.stderr.write = realErr;
    });
}

test('preflightVerb: ok path returns stateAfter (no exit)', async () => {
  const stateBefore = { active: null };
  const { stateAfter, exitCode } = await runVerb({ stateBefore, target: null });
  assert.equal(exitCode, undefined);
  assert.equal(stateAfter, stateBefore);
});

test('preflightVerb: bind-mismatch prints PROMPT_REQUIRED and exits 7', async () => {
  const { out, exitCode } = await runVerb({
    stateBefore: { active: '#999' },
    target: '633',
    verb: 'promote',
  });
  assert.equal(exitCode, EXIT_BIND_MISMATCH);
  assert.ok(out.join('').includes('PROMPT_REQUIRED: bind-mismatch'));
});

test('preflightVerb: assignee-mismatch prints PROMPT_REQUIRED and exits', async () => {
  const { out, exitCode } = await runVerb({
    stateBefore: { active: '633' },
    cfg,
    verb: 'promote',
    deps: {
      fetchAssignees: async () => ['alice'],
      fetchCurrentUser: async () => 'bob',
    },
  });
  assert.equal(exitCode, EXIT_ASSIGNEE_MISMATCH);
  assert.ok(out.join('').includes('PROMPT_REQUIRED'));
});

test('preflightVerb: human-move prints PROMPT_REQUIRED and exits 9', async () => {
  const { out, exitCode } = await runVerb({
    stateBefore: { active: '633' },
    cfg: noGateCfg,
    verb: 'promote',
    deps: {
      fetchLive: async () => 'develop',
      fetchLastKnownState: async () => 'refine',
      fetchLastStatusActor: async () => ({ login: 'alice', type: 'User' }),
    },
  });
  assert.equal(exitCode, EXIT_HUMAN_MOVE);
  assert.ok(out.join('').includes('PROMPT_REQUIRED: human-move'));
});
