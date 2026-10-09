import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildClaudeReviewerLaunch,
  buildClaudeReviewerResume,
  classifyClaudeReviewerOutcome,
  encodeClaudeEditRule,
  matchesClaudeEditRule,
  runClaudeReviewerLaunch,
} from '../../src/provider/claude-launch.mjs';

function fixture(prefix = 'claude launch ') {
  const scratch = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(path.join(scratch, prefix));
  const repositoryRoot = path.join(root, 'repository with spaces');
  const destination = path.join(repositoryRoot, 'docs', 'peer-reviews', 'spec', 'review-1');
  const workspace = path.join(repositoryRoot, '.scratch', 'peer-review', 'review-1');
  const artifact = path.join(repositoryRoot, 'docs', 'artifact.md');
  const invitation = path.join(destination, 'reviewer-invitation.md');
  const response = path.join(destination, 'reviewer-response-1.md');
  mkdirSync(destination, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  writeFileSync(artifact, '# Artifact\n');
  writeFileSync(invitation, '# Invitation\n');
  return {
    root,
    repositoryRoot,
    invitation,
    routing: {
      schema: 'ai-peer-review.invitation-routing/v1',
      review_id: 'review-1',
      artifact,
      workspace,
      response,
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('encodes a filesystem-root Edit rule instead of the reproduced project-relative rule', () => {
  const response = '/work/project/reviewer-response-1.md';
  assert.equal(encodeClaudeEditRule(response), 'Edit(//work/project/reviewer-response-1.md)');
  assert.equal(
    matchesClaudeEditRule('Edit(//work/project/reviewer-response-1.md)', response, {
      projectRoot: '/work/project',
    }),
    true
  );
  assert.equal(
    matchesClaudeEditRule('Edit(/work/project/reviewer-response-1.md)', response, {
      projectRoot: '/work/project',
    }),
    false
  );
});

test('normalizes a Windows drive path to Claude filesystem-root permission syntax', () => {
  const response = String.raw`C:\work\project\reviewer-response-1.md`;
  const projectRoot = String.raw`C:\work\project`;
  assert.equal(encodeClaudeEditRule(response), 'Edit(//c/work/project/reviewer-response-1.md)');
  assert.equal(
    matchesClaudeEditRule('Edit(//c/work/project/reviewer-response-1.md)', response, {
      projectRoot,
    }),
    true
  );
  assert.equal(
    matchesClaudeEditRule('Edit(/c/work/project/reviewer-response-1.md)', response, {
      projectRoot,
    }),
    false
  );
});

test('keeps spaces literal and refuses unsafe or noncanonical permission paths', () => {
  assert.equal(
    encodeClaudeEditRule('/work/review files/response.md'),
    'Edit(//work/review files/response.md)'
  );
  for (const candidate of [
    'relative/response.md',
    '/work/reviews/../response.md',
    '/work/reviews/*.md',
    '/work/reviews/response?.md',
    '/work/reviews/[response].md',
    '/work/reviews/response\\name.md',
  ]) {
    assert.throws(() => encodeClaudeEditRule(candidate), {
      code: 'APR_CLAUDE_PERMISSION_INVALID',
    });
  }
});

test('builds an immutable dontAsk launch that authorizes only the pending response', (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const contract = buildClaudeReviewerLaunch({
    repositoryRoot: fx.repositoryRoot,
    invitation: fx.invitation,
    routing: fx.routing,
    model: 'claude-opus-5',
    effort: 'high',
  });
  const invitationCommandPath = fx.invitation.replaceAll('\\', '/');
  const workspaceCommandPath = fx.routing.workspace.replaceAll('\\', '/');

  assert.equal(contract.schema, 'ai-peer-review.claude-launch/v1');
  assert.equal(contract.command.file, 'claude');
  assert.equal(contract.command.shell, false);
  assert.equal(contract.command.args.includes('dontAsk'), true);
  assert.deepEqual(contract.permissions.allow, [
    'Read',
    'Glob',
    'Grep',
    `Bash(peer-review join ${invitationCommandPath.includes(' ') ? `'${invitationCommandPath}'` : invitationCommandPath})`,
    `Bash(peer-review submit ${workspaceCommandPath.includes(' ') ? `'${workspaceCommandPath}'` : workspaceCommandPath})`,
    encodeClaudeEditRule(fx.routing.response),
  ]);
  assert.equal(
    contract.permissions.allow.some((rule) => rule.includes('\\')),
    false
  );
  assert.equal(
    contract.permissions.allow.some((rule) => /^Bash\([^)]*\*[^)]*\)$/.test(rule)),
    false
  );
  assert.deepEqual(contract.readiness, {
    exact_response: true,
    bad_single_slash_rejected: true,
    artifact_rejected: true,
    neighbor_rejected: true,
  });
  assert.equal(Object.isFrozen(contract), true);
  assert.equal(Object.isFrozen(contract.command.args), true);
  assert.equal(
    matchesClaudeEditRule(contract.permissions.allow.at(-1), fx.routing.artifact, {
      projectRoot: fx.repositoryRoot,
    }),
    false
  );
  assert.equal(
    matchesClaudeEditRule(
      contract.permissions.allow.at(-1),
      path.join(path.dirname(fx.routing.response), 'reviewer-response-2.md'),
      { projectRoot: fx.repositoryRoot }
    ),
    false
  );
});

test('fails closed for path escape, routing drift, symlinks, and incomplete launch identity', (t) => {
  const fx = fixture('claude launch invalid ');
  t.after(fx.cleanup);
  const base = {
    repositoryRoot: fx.repositoryRoot,
    invitation: fx.invitation,
    routing: fx.routing,
    model: 'claude-opus-5',
    effort: 'high',
  };

  for (const input of [
    { ...base, routing: { ...fx.routing, response: path.join(fx.root, 'outside.md') } },
    { ...base, invitation: path.join(fx.root, 'other-invitation.md') },
    { ...base, model: '' },
    { ...base, effort: '' },
  ]) {
    assert.throws(
      () => buildClaudeReviewerLaunch(input),
      (error) => ['APR_CLAUDE_PERMISSION_INVALID', 'APR_INVITATION_INVALID'].includes(error.code)
    );
  }

  const outside = path.join(fx.root, 'outside');
  mkdirSync(outside);
  const link = path.join(fx.repositoryRoot, 'linked-outside');
  symlinkSync(outside, link, 'dir');
  assert.throws(
    () =>
      buildClaudeReviewerLaunch({
        ...base,
        routing: { ...fx.routing, response: path.join(link, 'response.md') },
      }),
    { code: 'APR_CLAUDE_PERMISSION_INVALID' }
  );
});

function authority({ sequence = 3, revision = 2, state = 'reviewer-turn', events = [] } = {}) {
  return {
    state: {
      protocol: { review_id: 'review-1', sequence, revision, state },
      participants: {
        reviewer: { session_fingerprint: `sha256:${'a'.repeat(64)}` },
      },
    },
    events,
  };
}

function classificationContract() {
  return Object.freeze({
    review_id: 'review-1',
    invitation: '/work/project/reviewer-invitation.md',
    response: '/work/project/reviewer-response-1.md',
  });
}

test('classifies only a new expected reviewer decision as submitted', () => {
  const before = authority();
  const accepted = {
    sequence: 4,
    revision: 3,
    type: 'reviewer-accepted',
    actor: `sha256:${'a'.repeat(64)}`,
  };
  const after = authority({
    sequence: 4,
    revision: 3,
    state: 'acceptance-pending',
    events: [accepted],
  });
  const result = classifyClaudeReviewerOutcome({
    before,
    after,
    providerResult: { exit_code: 1, permission_denials: [] },
    contract: classificationContract(),
  });
  assert.equal(result.status, 'submitted');
  assert.equal(result.protocol_revision, 3);
  assert.equal(result.session_fingerprint, `sha256:${'a'.repeat(64)}`);
  assert.equal(result.recovery, null);
});

test('surfaces exact same-session recovery for a denied response write', () => {
  const unchanged = authority();
  const result = classifyClaudeReviewerOutcome({
    before: unchanged,
    after: unchanged,
    providerResult: {
      exit_code: 1,
      permission_denials: [{ tool: 'Edit', path: '/work/project/reviewer-response-1.md' }],
    },
    contract: classificationContract(),
  });
  assert.equal(result.status, 'permission-blocked');
  assert.equal(result.recovery.reason, 'response-permission-denied');
  assert.equal(
    result.recovery.command,
    'peer-review launch-reviewer /work/project/reviewer-invitation.md --host claude --resume'
  );
  assert.doesNotMatch(JSON.stringify(result), /raw-session|session-123/);
});

test('recognizes a Claude-normalized Windows response denial', () => {
  const unchanged = authority();
  const result = classifyClaudeReviewerOutcome({
    before: unchanged,
    after: unchanged,
    providerResult: {
      exit_code: 1,
      permission_denials: [{ tool: 'Edit', path: '/c/work/project/reviewer-response-1.md' }],
    },
    contract: {
      ...classificationContract(),
      response: String.raw`C:\work\project\reviewer-response-1.md`,
    },
  });
  assert.equal(result.status, 'permission-blocked');
});

test('keeps definite provider failure separate from ambiguous completion', () => {
  const unchanged = authority();
  assert.equal(
    classifyClaudeReviewerOutcome({
      before: unchanged,
      after: unchanged,
      providerResult: { exit_code: 2, permission_denials: [], error: 'provider unavailable' },
      contract: classificationContract(),
    }).status,
    'failed'
  );
  assert.equal(
    classifyClaudeReviewerOutcome({
      before: unchanged,
      after: unchanged,
      providerResult: {
        exit_code: 0,
        permission_denials: [],
        result: 'analysis complete',
      },
      contract: classificationContract(),
    }).status,
    'outcome-unknown'
  );
});

test('rejects a submission transition attributed to a different reviewer identity', () => {
  const before = authority();
  const after = authority({
    sequence: 4,
    revision: 3,
    state: 'acceptance-pending',
    events: [
      {
        sequence: 4,
        revision: 3,
        type: 'reviewer-accepted',
        actor: `sha256:${'b'.repeat(64)}`,
      },
    ],
  });
  assert.throws(
    () =>
      classifyClaudeReviewerOutcome({
        before,
        after,
        providerResult: { exit_code: 0, permission_denials: [] },
        contract: classificationContract(),
      }),
    { code: 'APR_IDENTITY_CONFLICT' }
  );
});

test('keeps the Claude session handle private and injects it only into exact resume execution', async (t) => {
  const fx = fixture('claude private resume ');
  t.after(fx.cleanup);
  const contract = buildClaudeReviewerLaunch({
    repositoryRoot: fx.repositoryRoot,
    invitation: fx.invitation,
    routing: fx.routing,
    model: 'claude-opus-5',
    effort: 'high',
  });
  const reviewerFingerprint = `sha256:${'a'.repeat(64)}`;
  const before = authority({ sequence: 1, revision: 0, events: [] });
  delete before.state.participants.reviewer;
  const joined = authority({ sequence: 3, revision: 1, events: [] });
  joined.state.participants.reviewer = { session_fingerprint: reviewerFingerprint };
  const accepted = authority({
    sequence: 4,
    revision: 2,
    state: 'acceptance-pending',
    events: [
      {
        sequence: 4,
        revision: 2,
        type: 'reviewer-accepted',
        actor: reviewerFingerprint,
      },
    ],
  });
  accepted.state.participants.reviewer = { session_fingerprint: reviewerFingerprint };
  const rawHandle = 'raw-session-123';
  const initialAuthorities = [before, joined];
  const initial = await runClaudeReviewerLaunch({
    contract,
    inspectAuthority: () => initialAuthorities.shift(),
    fingerprintSession: () => reviewerFingerprint,
    execFile: async () => ({
      stdout: JSON.stringify({
        session_id: rawHandle,
        permission_denials: [{ tool: 'Edit', path: contract.response }],
      }),
      stderr: '',
    }),
  });

  assert.equal(initial.status, 'permission-blocked');
  assert.doesNotMatch(JSON.stringify(initial), new RegExp(rawHandle));
  const stateFile = path.join(contract.workspace, 'provider', 'claude', 'launch-state.json');
  const privateState = JSON.parse(readFileSync(stateFile, 'utf8'));
  assert.equal(privateState.session_handle, rawHandle);
  assert.equal(privateState.model, 'claude-opus-5');
  assert.equal(privateState.effort, 'high');
  const resumeContract = buildClaudeReviewerResume({
    repositoryRoot: fx.repositoryRoot,
    invitation: fx.invitation,
    routing: fx.routing,
  });
  assert.equal(resumeContract.model, contract.model);
  assert.equal(resumeContract.effort, contract.effort);

  let resumedArgs;
  const resumeAuthorities = [joined, accepted];
  const resumed = await runClaudeReviewerLaunch({
    contract: resumeContract,
    resume: true,
    inspectAuthority: () => resumeAuthorities.shift(),
    fingerprintSession: () => reviewerFingerprint,
    execFile: async (_file, args) => {
      resumedArgs = args;
      return {
        stdout: JSON.stringify({ session_id: rawHandle, permission_denials: [] }),
        stderr: '',
      };
    },
  });

  assert.equal(resumed.status, 'submitted');
  assert.deepEqual(resumedArgs.slice(0, 2), ['--resume', rawHandle]);
  assert.doesNotMatch(JSON.stringify(resumed), new RegExp(rawHandle));
});
