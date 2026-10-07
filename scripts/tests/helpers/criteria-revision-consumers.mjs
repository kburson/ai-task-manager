import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { stampEntryMarker } from '../../task-tracker/lib/stage-entry-markers.mjs';
import { writeLastKnownState } from '../../task-tracker/gh-timing-comment.mjs';
import { validateGovernedLinkedPlan } from '../../task-tracker/lib/governed-plan-policy.mjs';
import { resolveStoryIntentSource } from '../../task-tracker/lib/story-intent-source.mjs';
import { planSourceBindings } from '../../task-tracker/lib/criteria-revision/plan-approval.mjs';
// @story #1855
import assert from 'node:assert/strict';
import { createIssueDirectory, renderIssueDirectory } from '../../task-tracker/lib/github-records/issue-directory.mjs';
import { makeLegacyRevisionFixture, makeCanonicalRevisionFixture } from '../fixtures/criteria-revision.mjs';
import { createRevisionMemory } from '../../task-tracker/lib/criteria-revision/store.mjs';
import { applyRevision } from '../../task-tracker/lib/criteria-revision/engine.mjs';
import { runPlanApprove } from '../../task-tracker/verbs/plan-approve.mjs';
import { deriveProposal, renderApprovalStatement } from '../../task-tracker/lib/criteria-revision/proposal.mjs';
import { hashBytes } from '../../task-tracker/lib/criteria-revision/schema.mjs';
export async function fixture(state, { functionalKeys = false, worktree } = {}) {
  const f = makeLegacyRevisionFixture();
  if (worktree) { f.observation.executor.worktree = worktree; f.context.executor.worktree = worktree; }
  let request = f.request, rawUserMessage = f.rawUserMessage;
  if (functionalKeys) {
    f.observation.body.bytes = f.observation.body.bytes.replace('Shared DoD ', 'Shared DoD <!-- dod:functional:tests --> ').replace('Independent DoD ', 'Independent DoD <!-- dod:functional:lint --> ');
  }
  if (functionalKeys || worktree) {
    const proposal = deriveProposal({ ...f.context, observation: f.observation });
    const statement = renderApprovalStatement(proposal);
    request = { ...f.request, proposal, authorizationSource: { ...f.authorizationSource, statementHash: hashBytes(statement) } };
    rawUserMessage = { ...f.rawUserMessage, content: [{ type: 'input_text', text: statement }] };
  }
  const backend = createRevisionMemory({ observation: f.observation, comments: [], hostMessages: [rawUserMessage] });
  const context = { repository: f.observation.repository, issue: f.observation.issue, executor: f.observation.executor };
  if (state === 'pending') {
    backend.failAfter = 'event-write:prepared';
    await assert.rejects(applyRevision({ context, request, deps: backend }), /interrupted/);
    backend.failAfter = null;
  } else if (state === 'stale') {
    assert.equal((await applyRevision({ context, request, deps: backend })).status, 'applied');
  } else if (state === 'unavailable') backend.pageFault = { nextPage: 2 };
  return { backend, context };
}

export async function approvedFixture({ unstampedIndependent = false, kind = 'legacy', worktree = process.cwd(), branch, sessionId, sharedDodCitation = false, linkedPlan = null, writerDomain = null, bodyState = null, bodyStages = [], nativeStageLayout = false, independentCommand = null } = {}) {
  const f = kind === 'canonical' ? makeCanonicalRevisionFixture() : makeLegacyRevisionFixture();
  f.observation.executor.worktree = worktree;
  f.context.executor.worktree = worktree;
  if (writerDomain) f.observation.writerDomain = structuredClone(writerDomain);
  if (sessionId !== undefined) {
    f.observation.executor.sessionId = sessionId;
    f.context.executor.sessionId = sessionId;
    f.rawUserMessage.sessionId = sessionId;
    f.request.authorizationSource.sessionId = sessionId;
  }
  if (branch !== undefined) { f.observation.executor.branch = branch; f.context.executor.branch = branch; }
  f.observation.body.bytes = '## User Story\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Deep-Dive Analysis\n### Story Intent\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n\n' + f.observation.body.bytes;
  if (nativeStageLayout) f.observation.body.bytes = f.observation.body.bytes.replace('## Deep-Dive Analysis', '## Pickup Directive\nExercise the sandbox release checks against source.txt before requesting native Test entry.\n\n## Deep-Dive Analysis') + '\n' + formatIssueFieldDb({});
  if (independentCommand) f.observation.body.bytes = f.observation.body.bytes.replaceAll('node --test independent.test.mjs', independentCommand);
  for (const stage of bodyStages) f.observation.body.bytes = stampEntryMarker(f.observation.body.bytes, stage, '2026-09-30T12:00:00.000Z');
  if (bodyState) f.observation.body.bytes = writeLastKnownState(f.observation.body.bytes, bodyState);
  if (linkedPlan) {
    f.observation.body.bytes += `\n## Plan Metadata\n- **Source-plan**: ${linkedPlan}\n`;
    const policy = validateGovernedLinkedPlan({ body: f.observation.body.bytes, projectDir: worktree });
    const resolved = resolveStoryIntentSource({ body: f.observation.body.bytes, projectDir: worktree, governedPlan: policy });
    assert.ok(policy.ok && resolved.ok);
    f.observation.protectedSourceBindings.push(...planSourceBindings(resolved, policy));
  }
  if (kind === 'legacy') f.observation.body.bytes = f.observation.body.bytes.replace('Shared DoD ', 'Shared DoD <!-- dod:functional:tests --> ').replace('Independent DoD ', 'Independent DoD <!-- dod:functional:lint --> ');
  if (sharedDodCitation) f.observation.body.bytes = f.observation.body.bytes.replace(/(Shared DoD <!-- dod:functional:tests --> <!-- aitm-verified )cmd="[^"]*"/, '$1vc-list="vc:1"');
  if (unstampedIndependent) f.observation.body.bytes = f.observation.body.bytes.replace(/(Independent requirement <!-- aitm-verified vc-list="vc:2") [^>]*-->/, '$1 -->');
  if (kind === 'canonical') f.observation.body.bytes += '\n' + renderIssueDirectory(createIssueDirectory({ issueNodeId: 'synthetic-issue', singletons: { 'delivery-contract': 'synthetic-contract', coordination: 'synthetic-coordination', 'evidence-projection': 'synthetic-evidence', timing: 'synthetic-timing' } }));
  const proposal = deriveProposal({ ...f.context, observation: f.observation });
  const statement = renderApprovalStatement(proposal);
  const backend = createRevisionMemory({ observation: f.observation, comments: [], hostMessages: [{ ...f.rawUserMessage, content: [{ type: 'input_text', text: statement }] }] });
  const context = { repository: f.observation.repository, issue: f.observation.issue, executor: f.observation.executor };
  const initialObservation = backend.observation;
  assert.equal((await applyRevision({ context, request: { ...f.request, proposal, authorizationSource: { ...f.authorizationSource, statementHash: hashBytes(statement) } }, deps: backend })).status, 'applied');
  backend.replacePlanning({ schema: 'aitm.memory-planning/v1', cfg: { repo: context.repository }, repository: context.repository, issue: context.issue, bodyHash: hashBytes(backend.observation.body.bytes), epicChildren: [], trunkSha: null });
  const approved = await runPlanApprove({ issueNumber: context.issue, cfg: { repo: context.repository }, projectDir: worktree, deps: { revisionBackend: backend, env: { TT_FULL_AUTO: '1' } } });
  assert.equal(approved.status, 'approved', JSON.stringify(approved));
  return { backend, context, initialObservation };
}

