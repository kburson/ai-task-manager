import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { canonicalChallengeBytes } from '../../src/authority/canonicalize.mjs';
import { requestGrant } from '../../src/authority/challenge.mjs';
import * as api from './internal-api.mjs';
import { participantIdentity } from '../../src/identity/registry.mjs';

export const NOW = '2026-09-09T02:00:00.000Z';

export function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'apr-intervention-'));
  execFileSync('git', ['init', '-b', 'trunk'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  mkdirSync(path.join(root, 'docs'));
  writeFileSync(path.join(root, 'docs/artifact.md'), '# Artifact\n');
  writeFileSync(path.join(root, '.git/info/exclude'), '.scratch/peer-review/\n');
  execFileSync('git', ['add', 'docs/artifact.md'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root, stdio: 'ignore' });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function identity(role, session, joinedAt = NOW) {
  return participantIdentity({
    role,
    host: 'codex',
    provider: 'openai',
    modelId: 'gpt-test',
    modelDisplay: 'GPT Test',
    sessionId: session,
    source: 'runtime',
    joinedAt,
  });
}

export function replaceSection(file, heading, content) {
  const text = readFileSync(file, 'utf8');
  const pattern = new RegExp(`(## ${heading}\\r?\\n\\r?\\n)[\\s\\S]*?(?=\\r?\\n\\r?\\n## |$)`);
  writeFileSync(file, text.replace(pattern, `$1${content}`));
}

function fixturePrivateKey(fixtureId) {
  const seed = createHash('sha256')
    .update(`ai-peer-review.test-authority/v1\n${fixtureId}`)
    .digest();
  return createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

export function fixtureAuthority(fixtureId) {
  const publicKey = createPublicKey(fixturePrivateKey(fixtureId));
  const fingerprint = `sha256:${createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')}`;
  return {
    authority_policy: 'detection-allowed',
    challenge_ttl_ms: 15 * 60 * 1000,
    verifier: {
      kind: 'ed25519',
      verifier_id: `test:${fixtureId}`,
      verifier_fingerprint: fingerprint,
      public_key: publicKey.export({ type: 'spki', format: 'pem' }),
      assurance_grade: 'mutable-local',
      signer_strength: 'cryptographic-local',
    },
  };
}

export async function signedGrant(
  workspace,
  action,
  parameters,
  fixtureId,
  requester,
  now,
  source = 'test-fixture'
) {
  const challenge = await requestGrant(workspace, action, parameters, {
    requesterFingerprint: requester.session_fingerprint,
    now,
  });
  const privateKey = fixturePrivateKey(fixtureId);
  const publicKey = createPublicKey(privateKey);
  const fingerprint = `sha256:${createHash('sha256')
    .update(publicKey.export({ type: 'spki', format: 'der' }))
    .digest('hex')}`;
  return {
    schema: 'ai-peer-review.grant/v1',
    challenge,
    parameters,
    authorization: {
      source,
      signer_id: `test:${fixtureId}`,
      signer_fingerprint: fingerprint,
      verifier_fingerprint: fingerprint,
      signature: sign(null, canonicalChallengeBytes(challenge), privateKey).toString('base64url'),
    },
  };
}

export async function budgetIntervention(root, reviewId = 'budget-intervention', authorDeps = {}) {
  const fixtureId = `${reviewId}-authority`;
  const author = identity('author', `${reviewId}-author`);
  const reviewer = identity('reviewer', `${reviewId}-reviewer`);
  const started = await api.startReview({
    cwd: root,
    artifact: 'docs/artifact.md',
    artifactKind: 'spec',
    identity: author,
    reviewId,
    maxTurns: 1,
    noCommit: true,
    testHumanAuthority: fixtureId,
    now: NOW,
  });
  const joined = await api.joinReview({
    cwd: root,
    invitation: started.paths.reviewer_invitation,
    identity: reviewer,
    now: NOW,
  });
  replaceSection(joined.paths.response, 'Summary', 'One repair.');
  replaceSection(joined.paths.response, 'Findings', '### R1-F001 — Repair\n\nFix it.');
  replaceSection(joined.paths.response, 'Required changes', '- Address R1-F001.');
  replaceSection(joined.paths.response, 'Optional suggestions', 'None.');
  replaceSection(joined.paths.response, 'Decision', 'revisions-requested');
  const handoff = await api.submitReviewTurn({
    cwd: root,
    workspace: started.paths.workspace,
    identity: reviewer,
    decision: 'revisions-requested',
    now: '2026-09-09T02:01:00.000Z',
  });
  replaceSection(handoff.paths.response, 'Summary', 'Repaired.');
  replaceSection(handoff.paths.response, 'Finding dispositions', '- R1-F001: addressed');
  replaceSection(handoff.paths.response, 'Changes made', 'Rationale only.');
  replaceSection(handoff.paths.response, 'Declined changes and rationale', 'No byte change.');
  replaceSection(handoff.paths.response, 'Verification', 'Verified.');
  const closed = await api.submitAuthorTurn(
    {
      cwd: root,
      workspace: started.paths.workspace,
      identity: author,
      noArtifactChange: true,
      reason: 'No byte change.',
      now: '2026-09-09T02:02:00.000Z',
    },
    authorDeps
  );
  return { author, reviewer, started, closed, fixtureId };
}
