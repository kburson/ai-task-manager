import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resumeReview, startReview } from '../../src/cli/run.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';

const NOW = '2026-09-13T06:00:00.000Z';

function repositoryFixture(t, suffix) {
  const root = mkdtempSync(path.join(os.tmpdir(), `apr-communication-${suffix}-`));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/example.md'), '# Example\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/example.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return root;
}

function identity(session) {
  return participantIdentity({
    role: 'author',
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: NOW,
  });
}

function automaticObservation() {
  return {
    capability: 'live-wait',
    adapter_version: '2.0.0',
    lease: {
      schema: 'ai-peer-review.resident-lease/v1',
      process_instance_id: 'codex-process-01',
      pid: null,
      opaque_handle: 'codex:author-session',
      host: 'codex',
      adapter_version: '2.0.0',
      heartbeat_sequence: 1,
      observed_at: '2026-09-13T05:59:55.000Z',
      expires_at: '2026-09-13T06:00:30.000Z',
    },
  };
}

const MODES = [
  ['manual', {}],
  ['resume-only', { transportMode: 'resume-only', transportCapability: 'resume-only' }],
  [
    'automatic-required',
    { transportMode: 'automatic-required', transportObservation: automaticObservation() },
  ],
  ['no-commit', { noCommit: true, testHumanAuthority: 'communication-policy-fixture' }],
];

for (const [mode, options] of MODES) {
  test(`${mode} startup directs both participants to durable documents and keeps resume bounded`, async (t) => {
    const root = repositoryFixture(t, mode);
    const started = await startReview({
      cwd: root,
      artifact: 'docs/example.md',
      artifactKind: 'spec',
      identity: identity(`author-${mode}`),
      reviewId: `review-communication-${mode}`,
      now: NOW,
      ...options,
    });

    for (const file of [started.paths.author_startup, started.paths.reviewer_invitation]) {
      const bytes = readFileSync(file, 'utf8');
      assert.match(bytes, /## Communication policy \(v1\)/);
      assert.match(bytes, /do not rely on a chat summary/i);
      assert.match(bytes, /unless the human explicitly requests it/i);
    }

    const resumed = resumeReview(started.paths.workspace, { now: NOW });
    assert.equal(
      resumed.instructions,
      `Join from the exact sealed invitation: ${resumed.next_action.command}`
    );
    assert.doesNotMatch(resumed.instructions, /findings|dispositions|verification evidence/i);
  });
}
