import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildClaudeReviewerLaunch,
  classifyClaudeReviewerOutcome,
  matchesClaudeEditRule,
} from '../../src/provider/claude-launch.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';
import { inspectReviewAuthority } from '../../src/protocol/service.mjs';
import { joinReview, startReview, submitReviewTurn } from '../helpers/internal-api.mjs';
import { run } from '../../src/cli/run.mjs';

const NOW = '2026-09-14T12:00:00.000Z';

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function identity(role, session) {
  return participantIdentity({
    role,
    host: role === 'reviewer' ? 'claude-code' : 'codex',
    provider: role === 'reviewer' ? 'anthropic' : 'openai',
    modelId: role === 'reviewer' ? 'claude-opus-5' : 'gpt-test',
    modelDisplay: role === 'reviewer' ? 'Claude Opus 5' : 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt: NOW,
  });
}

function fixture() {
  const scratch = path.join(process.cwd(), '.scratch', 'test');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(path.join(scratch, 'claude-conformance-'));
  git(root, ['init', '-b', 'trunk']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs', 'artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, '.git', 'info', 'exclude'), '.scratch/peer-review/\n');
  git(root, ['add', 'docs/artifact.md']);
  git(root, ['commit', '-m', 'fixture']);
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function routingFromInvitation(file) {
  const text = readFileSync(file, 'utf8');
  const encoded = text.match(/^<!-- ai-peer-review-invitation data="([A-Za-z0-9_-]+)" -->$/m)?.[1];
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}

function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

function legacyContract(contract) {
  const goodRule = contract.permissions.allow.at(-1);
  const badRule = `Edit(${contract.response})`;
  return {
    ...contract,
    permissions: { allow: [...contract.permissions.allow.slice(0, -1), badRule] },
    command: {
      ...contract.command,
      args: contract.command.args.map((argument) => (argument === goodRule ? badRule : argument)),
    },
  };
}

function conformantClaude({ root, invitation, reviewer }) {
  let joined = null;
  const analysis = 'The provider retained this completed analysis across the denied write.';
  return {
    session: reviewer.session_fingerprint,
    analysis,
    async turn(contract) {
      if (!joined) {
        joined = await joinReview({ cwd: root, invitation, identity: reviewer, now: NOW });
      }
      const rule = contract.permissions.allow.find((entry) => entry.startsWith('Edit('));
      const controls = {
        artifact: matchesClaudeEditRule(rule, path.join(root, 'docs', 'artifact.md'), {
          projectRoot: root,
        }),
        neighbor: matchesClaudeEditRule(
          rule,
          path.join(path.dirname(joined.paths.response), 'reviewer-response-2.md'),
          { projectRoot: root }
        ),
        response: matchesClaudeEditRule(rule, joined.paths.response, { projectRoot: root }),
      };
      if (!controls.response) {
        return {
          exit_code: 1,
          session_fingerprint: reviewer.session_fingerprint,
          analysis,
          controls,
          permission_denials: [{ tool: 'Edit', path: joined.paths.response }],
        };
      }
      assert.deepEqual(controls, { artifact: false, neighbor: false, response: true });
      replaceSection(joined.paths.response, 'Summary', analysis);
      replaceSection(joined.paths.response, 'Findings', 'None.');
      replaceSection(joined.paths.response, 'Required changes', 'None.');
      replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
      replaceSection(joined.paths.response, 'Decision', 'accepted');
      await submitReviewTurn({
        cwd: root,
        workspace: contract.workspace,
        identity: reviewer,
        decision: 'accepted',
        now: '2026-09-14T12:01:00.000Z',
      });
      return {
        exit_code: 0,
        session_fingerprint: reviewer.session_fingerprint,
        analysis,
        controls,
        permission_denials: [],
      };
    },
  };
}

test('reproduces single-slash denial then submits from the same corrected Claude session', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: identity('author', 'author-session'),
    reviewId: 'review-claude-permission',
    now: NOW,
  });
  const routing = routingFromInvitation(started.paths.reviewer_invitation);
  const contract = buildClaudeReviewerLaunch({
    repositoryRoot: fx.root,
    invitation: started.paths.reviewer_invitation,
    routing,
    model: 'claude-opus-5',
    effort: 'high',
  });
  const invitationCommandPath = started.paths.reviewer_invitation.replaceAll('\\', '/');
  const workspaceCommandPath = started.paths.workspace.replaceAll('\\', '/');
  assert.equal(
    contract.permissions.allow.includes(`Bash(peer-review join ${invitationCommandPath})`),
    true
  );
  assert.equal(
    contract.permissions.allow.includes(`Bash(peer-review submit ${workspaceCommandPath})`),
    true
  );
  const reviewer = identity('reviewer', 'same-claude-session');
  const provider = conformantClaude({
    root: fx.root,
    invitation: started.paths.reviewer_invitation,
    reviewer,
  });
  const beforeDenied = inspectReviewAuthority(started.paths.workspace);
  const deniedProviderResult = await provider.turn(legacyContract(contract));
  const afterDenied = inspectReviewAuthority(started.paths.workspace);
  const denied = classifyClaudeReviewerOutcome({
    before: beforeDenied,
    after: afterDenied,
    providerResult: deniedProviderResult,
    contract,
  });

  assert.equal(denied.status, 'permission-blocked');
  assert.deepEqual(deniedProviderResult.controls, {
    artifact: false,
    neighbor: false,
    response: false,
  });
  assert.equal(afterDenied.state.protocol.state, 'reviewer-turn');
  assert.equal(readFileSync(path.join(fx.root, 'docs', 'artifact.md'), 'utf8'), '# Artifact\n');
  assert.match(denied.recovery.command, /launch-reviewer .* --host claude --resume$/);

  const beforeCorrected = inspectReviewAuthority(started.paths.workspace);
  const correctedProviderResult = await provider.turn(contract);
  const afterCorrected = inspectReviewAuthority(started.paths.workspace);
  const corrected = classifyClaudeReviewerOutcome({
    before: beforeCorrected,
    after: afterCorrected,
    providerResult: correctedProviderResult,
    contract,
  });

  assert.equal(corrected.status, 'submitted');
  assert.equal(corrected.session_fingerprint, provider.session);
  assert.equal(correctedProviderResult.analysis, provider.analysis);
  assert.equal(afterCorrected.state.protocol.state, 'acceptance-pending');
  assert.equal(
    afterCorrected.events.filter((event) => event.type === 'reviewer-accepted').length,
    1
  );
});

test('launch-reviewer CLI emits the sanitized governed result', async (t) => {
  const fx = fixture();
  t.after(fx.cleanup);
  const started = await startReview({
    cwd: fx.root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: identity('author', 'cli-author-session'),
    reviewId: 'review-claude-cli',
    now: NOW,
  });
  const routing = routingFromInvitation(started.paths.reviewer_invitation);
  const contract = buildClaudeReviewerLaunch({
    repositoryRoot: fx.root,
    invitation: started.paths.reviewer_invitation,
    routing,
    model: 'claude-opus-5',
    effort: 'high',
  });
  const provider = conformantClaude({
    root: fx.root,
    invitation: started.paths.reviewer_invitation,
    reviewer: identity('reviewer', 'cli-reviewer-session'),
  });
  const stdout = [];
  const stderr = [];
  const exitCode = await run(
    [
      'launch-reviewer',
      started.paths.reviewer_invitation,
      '--host',
      'claude',
      '--model',
      'claude-opus-5',
      '--effort',
      'high',
      '--json',
    ],
    {
      cwd: fx.root,
      env: {},
      stdout: { write: (value) => stdout.push(String(value)) },
      stderr: { write: (value) => stderr.push(String(value)) },
      execFile: async () => {
        const result = await provider.turn(contract);
        return {
          stdout: JSON.stringify({ ...result, session_id: 'cli-reviewer-session' }),
          stderr: '',
        };
      },
    }
  );
  assert.equal(exitCode, 0);
  assert.deepEqual(stderr, []);
  const result = JSON.parse(stdout.join(''));
  assert.equal(result.command, 'launch-reviewer');
  assert.equal(result.status, 'submitted');
  assert.equal(result.response, routing.response);
  assert.doesNotMatch(JSON.stringify(result), /cli-reviewer-session/);
});
