// @story #1406

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { getProvider, listProviders } from '../../../providers/index.mjs';
import {
  ProfiledProviderSessionError,
  resolveProfiledProviderSession,
} from '../../../review/lib/provider-session.mjs';
import {
  cleanupTemporaryRoots,
  memoryRepositoryFixture,
  readEvents,
  runCliDirect,
  snapshotProtocol,
} from '../../fixtures/co-review-fixture.mjs';

test.afterEach(cleanupTemporaryRoots);

const SUCCESS_CASES = [
  [
    'one Claude key',
    { CLAUDE_CODE_SESSION_ID: 'opaque-claude-a' },
    { provider: 'claude', sid: 'opaque-claude-a' },
  ],
  [
    'one Codex key',
    { CODEX_THREAD_ID: 'opaque-codex-a' },
    { provider: 'codex', sid: 'opaque-codex-a' },
  ],
  [
    'one Grok key',
    { GROK_SESSION_ID: 'opaque-grok-a' },
    { provider: 'grok', sid: 'opaque-grok-a' },
  ],
  [
    'identical aliases',
    { CODEX_THREAD_ID: 'opaque-codex-a', CODEX_SESSION_ID: 'opaque-codex-a' },
    { provider: 'codex', sid: 'opaque-codex-a' },
  ],
];

const FAILURE_CASES = [
  ['empty environment', {}, 'provider-session-id-required', []],
  [
    'orchestrator override only',
    { AI_TASK_MANAGER_SESSION_ID: 'opaque-orchestrator' },
    'provider-session-id-required',
    ['opaque-orchestrator'],
  ],
  [
    'Codex detection key only',
    { CODEX_HOME: '/opaque/codex-home' },
    'provider-session-id-required',
    ['/opaque/codex-home'],
  ],
  [
    'Grok detection key only',
    { GROK_AGENT: 'opaque-grok-agent' },
    'provider-session-id-required',
    ['opaque-grok-agent'],
  ],
  [
    'two contributing adapters',
    { CODEX_THREAD_ID: 'opaque-codex', CLAUDE_CODE_SESSION_ID: 'opaque-claude' },
    'provider-session-id-ambiguous',
    ['opaque-codex', 'opaque-claude'],
  ],
  [
    'conflicting Codex aliases',
    { CODEX_THREAD_ID: 'opaque-codex-a', CODEX_SESSION_ID: 'opaque-codex-b' },
    'provider-session-id-ambiguous',
    ['opaque-codex-a', 'opaque-codex-b'],
  ],
  [
    'conflicting Claude aliases',
    {
      CLAUDE_CODE_SESSION_ID: 'opaque-claude-a',
      CLAUDE_SESSION_ID: 'opaque-claude-b',
    },
    'provider-session-id-ambiguous',
    ['opaque-claude-a', 'opaque-claude-b'],
  ],
];

test('profiled provider sessions resolve from exactly one adapter native-key set', () => {
  for (const [name, env, expected] of SUCCESS_CASES) {
    assert.deepEqual(
      resolveProfiledProviderSession({ env, listProviders, getProvider }),
      expected,
      name
    );
  }
});

test('profiled provider sessions fail closed without leaking opaque values', () => {
  for (const [name, env, code, opaqueValues] of FAILURE_CASES) {
    assert.throws(
      () => resolveProfiledProviderSession({ env, listProviders, getProvider }),
      (error) => {
        assert.ok(error instanceof ProfiledProviderSessionError, name);
        assert.equal(error.code, code, name);
        for (const value of opaqueValues)
          assert.doesNotMatch(error.message, new RegExp(value), name);
        return true;
      }
    );
  }
});

test('profiled resolver does not use general provider or session-id helpers', () => {
  const source = readFileSync(
    new URL('../../../review/lib/provider-session.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /detectProvider|resolveSessionId|sessionIdEnvKeys\s*\(|FALLBACK_SESSION_ID/
  );
  assert.match(source, /listProviders/);
  assert.match(source, /getProvider/);
  assert.match(source, /\.sessionIdEnvKeys/);
});

test('each registered adapter carries both role turns through the CLI boundary', async () => {
  for (const provider of listProviders()) {
    const fixture = memoryRepositoryFixture();
    const dir = `.scratch/${provider}-profile`;
    const key = getProvider(provider).sessionIdEnvKeys[0];
    const ownerSid = `opaque-${provider}-owner`;
    const reviewerSid = `opaque-${provider}-reviewer`;
    const invoke = (args, sid) =>
      runCliDirect(args, { cwd: fixture.root, env: sid ? { [key]: sid } : {} });
    const initialized = await invoke(
      [
        'init',
        '--low-level',
        '--dir',
        dir,
        '--artifact',
        fixture.artifact,
        '--owner',
        'owner-agent',
        '--reviewer',
        'reviewer-agent',
        '--max-turns',
        '1',
      ],
      null
    );
    assert.equal(initialized.status, 0, `${provider}: ${initialized.stderr}`);
    assert.equal(
      (await invoke(['claim', '--dir', dir, '--actor', 'owner-agent'], ownerSid)).status,
      0,
      provider
    );
    const response = `${dir}/response.md`;
    writeFileSync(path.join(fixture.root, response), '# Response\n');
    assert.equal(
      (
        await invoke(
          [
            'handoff',
            '--dir',
            dir,
            '--actor',
            'owner-agent',
            '--response',
            response,
            '--artifact',
            fixture.artifact,
            '--commit',
            fixture.initialCommit,
            '--message',
            'ready',
          ],
          ownerSid
        )
      ).status,
      0,
      provider
    );
    assert.equal(
      (await invoke(['claim', '--dir', dir, '--actor', 'reviewer-agent'], reviewerSid)).status,
      0,
      provider
    );
    const review = `${dir}/review.md`;
    writeFileSync(path.join(fixture.root, review), '# Review\n\nAccepted.\n');
    const accepted = await invoke(
      [
        'handoff',
        '--dir',
        dir,
        '--actor',
        'reviewer-agent',
        '--review',
        review,
        '--review-of',
        fixture.initialCommit,
        '--decision',
        'accepted',
        '--message',
        'accepted',
      ],
      reviewerSid
    );
    assert.equal(accepted.status, 4, `${provider}: ${accepted.stderr}`);
    const events = readEvents(fixture.root, dir);
    for (const [event, role, sid] of [
      [events[1], 'owner', ownerSid],
      [events[2], 'owner', ownerSid],
      [events[3], 'reviewer', reviewerSid],
      [events[4], 'reviewer', reviewerSid],
    ]) {
      const claim = event.type === 'claim' ? event.claim : event.handoff.claim;
      assert.equal(claim.role, role, `${provider}:${event.type}`);
      assert.equal(claim.provider, provider, `${provider}:${event.type}`);
      assert.equal(claim.sid, sid, `${provider}:${event.type}`);
    }
  }
});

test('CLI refuses every non-native or ambiguous environment without mutation', async () => {
  for (const [, env, code] of FAILURE_CASES) {
    const fixture = memoryRepositoryFixture();
    const dir = '.scratch/profile-negative';
    await runCliDirect(
      [
        'init',
        '--low-level',
        '--dir',
        dir,
        '--artifact',
        fixture.artifact,
        '--owner',
        'owner-agent',
        '--reviewer',
        'reviewer-agent',
        '--max-turns',
        '1',
      ],
      { cwd: fixture.root, env: {} }
    );
    const before = readEvents(fixture.root, dir);
    const result = await runCliDirect(['claim', '--dir', dir, '--actor', 'owner-agent'], {
      cwd: fixture.root,
      env,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`co-review:${code}`));
    assert.deepEqual(readEvents(fixture.root, dir), before);
  }
});

test('reviewer index publication retries after the authoritative claim without duplicating it', async () => {
  const fixture = memoryRepositoryFixture();
  const dir = '.scratch/index-publication';
  await runCliDirect(
    [
      'init',
      '--low-level',
      '--dir',
      dir,
      '--artifact',
      fixture.artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '2',
    ],
    { cwd: fixture.root, env: {} }
  );
  const ownerEnv = { CODEX_THREAD_ID: 'index-owner-sid' };
  await runCliDirect(['claim', '--dir', dir, '--actor', 'owner-agent'], {
    cwd: fixture.root,
    env: ownerEnv,
  });
  const response = `${dir}/response.md`;
  writeFileSync(path.join(fixture.root, response), '# Response\n');
  await runCliDirect(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      fixture.artifact,
      '--commit',
      fixture.initialCommit,
      '--message',
      'ready',
    ],
    { cwd: fixture.root, env: ownerEnv }
  );
  const args = ['claim', '--dir', dir, '--actor', 'reviewer-agent'];
  const reviewerEnv = { CLAUDE_CODE_SESSION_ID: 'index-reviewer-sid' };
  const pending = await runCliDirect(args, {
    cwd: fixture.root,
    env: reviewerEnv,
    recordReviewerClaim() {
      throw new Error('temporary index write failure');
    },
  });
  assert.equal(pending.status, 1);
  assert.match(pending.stderr, /co-review:index-publication-pending/);
  assert.match(pending.stderr, /npx aitm co-review claim/);
  assert.equal(readEvents(fixture.root, dir).filter(({ type }) => type === 'claim').length, 2);
  const authoritative = snapshotProtocol(fixture.root, dir);
  let published;
  const repaired = await runCliDirect(args, {
    cwd: fixture.root,
    env: reviewerEnv,
    recordReviewerClaim(input) {
      published = input;
      return { status: 'claimed' };
    },
  });
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.deepEqual(snapshotProtocol(fixture.root, dir), authoritative);
  assert.equal(published.claim.provider, 'claude');
  assert.equal(published.claim.sid, 'index-reviewer-sid');
});

test('reviewer index authority conflicts are terminal and preserve the durable claim', async () => {
  const fixture = memoryRepositoryFixture();
  const dir = '.scratch/index-conflict';
  await runCliDirect(
    [
      'init',
      '--low-level',
      '--dir',
      dir,
      '--artifact',
      fixture.artifact,
      '--owner',
      'owner-agent',
      '--reviewer',
      'reviewer-agent',
      '--max-turns',
      '1',
    ],
    { cwd: fixture.root, env: {} }
  );
  const ownerEnv = { CODEX_THREAD_ID: 'conflict-owner-sid' };
  await runCliDirect(['claim', '--dir', dir, '--actor', 'owner-agent'], {
    cwd: fixture.root,
    env: ownerEnv,
  });
  const response = `${dir}/response.md`;
  writeFileSync(path.join(fixture.root, response), '# Response\n');
  await runCliDirect(
    [
      'handoff',
      '--dir',
      dir,
      '--actor',
      'owner-agent',
      '--response',
      response,
      '--artifact',
      fixture.artifact,
      '--commit',
      fixture.initialCommit,
      '--message',
      'ready',
    ],
    { cwd: fixture.root, env: ownerEnv }
  );
  const result = await runCliDirect(['claim', '--dir', dir, '--actor', 'reviewer-agent'], {
    cwd: fixture.root,
    env: { CLAUDE_CODE_SESSION_ID: 'conflict-reviewer-sid' },
    recordReviewerClaim() {
      throw new Error('co-review-index: conflicting registration for protocol');
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /co-review:index-authority-conflict/);
});
