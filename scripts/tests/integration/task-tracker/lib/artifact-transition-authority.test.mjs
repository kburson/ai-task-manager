// @story #2096
import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
import { artifactRepository } from '../../../helpers/artifact-repository.mjs';
import { setActiveTask } from '../../../../task-tracker/session-state.mjs';
import { captureArtifactOperator } from '../../../../task-tracker/lib/artifact-execution.mjs';
import { captureIssueProofAuthority } from '../../../../task-tracker/lib/issue-proof-authority.mjs';
import { mutateIssueBody } from '../../../../task-tracker/lib/issue-body-mutate.mjs';
import { stampEntryMarker } from '../../../../task-tracker/lib/stage-entry-markers.mjs';
import { writeLastKnownState } from '../../../../task-tracker/gh-timing-comment.mjs';
import {
  stampEntryMarkers,
  runStatusWrite,
} from '../../../../task-tracker/lib/move-state/github-mutation.mjs';
const { sid } = initializeFixtureActor(import.meta.url);
function fixture(t) {
  const r = artifactRepository(t);
  const binding = {
    issue: 2096,
    bindingGenerationId: 'generation',
    worktreePath: r.root,
    worktreeBranch: r.git('branch', '--show-current'),
    entryStartTs: '2026-10-26T20:00:00Z',
  };
  setActiveTask(sid, binding, r.root);
  const original =
    '## Scope\nExact source\n## Verification Commands\n- [ ] `git log --oneline -1` <!-- id=1 -->\n## AITM Progress Markers\n<!-- aitm-last-known-state state="develop" ts="2026-10-26T20:00:00Z" -->\n';
  const ctx = {
    issueArg: '2096',
    stateArg: 'test',
    resolvedFromState: 'develop',
    transitionId: 'move:artifact-test',
    projectDir: r.root,
    cfg: { repo: 'o/r', projectId: 'P', kanbanFieldId: 'S' },
    optionId: 'TEST',
    SKIP_NETWORK: false,
    postComment: async () => {},
    artifactSubject: { commitSha: r.candidate, treeSha: r.tree },
  };
  ctx.artifactTransitionAuthority = {
    operatorContext: captureArtifactOperator({ projectDir: r.root, issueNumber: 2096 }),
    body: original,
    proof: captureIssueProofAuthority(original),
  };
  return { ...r, ctx, binding, original };
}
for (const drift of ['actor', 'declaration'])
  test(`native entry stamp refuses ${drift} drift during fresh fetch`, async (t) => {
    const { root, ctx, binding, original } = fixture(t);
    let body = original,
      writes = 0;
    ctx._mutateBody = (input) =>
      mutateIssueBody({
        ...input,
        deps: {
          fetchBody: async () => {
            if (drift === 'actor')
              setActiveTask(sid, { ...binding, bindingGenerationId: 'changed' }, root);
            else body = body.replace('git log --oneline -1', 'npm run lint');
            return body;
          },
          pushBody: async (_r, _i, next) => {
            writes++;
            body = next;
          },
        },
      });
    ctx.gh = async () => body;
    await assert.rejects(stampEntryMarkers(ctx), /artifact.*(?:operator|binding|proof authority)/);
    assert.equal(writes, 0);
  });
for (const phase of ['resolution', 'retry'])
  test(`native Status refuses authority drift after ${phase}`, async (t) => {
    const { ctx, original } = fixture(t);
    let writes = 0;
    let body = writeLastKnownState(
      stampEntryMarker(original, 'test', '2026-10-26T20:01:00Z', ctx.transitionId),
      'test'
    );
    ctx.artifactTransitionAuthority.entryProof = captureIssueProofAuthority(body);
    ctx.projectItemForIssue = async () => {
      if (phase === 'resolution') body = body.replace('git log --oneline -1', 'npm run lint');
      return { itemId: 'I' };
    };
    ctx.gh = async (args) => {
      if (args[0] === 'issue') return body;
      writes++;
      return '';
    };
    ctx.readBackStatusOptionId = async () => {
      if (phase === 'retry' && writes === 1) {
        body = body.replace('git log --oneline -1', 'npm run lint');
        return 'DEVELOP';
      }
      return 'TEST';
    };
    const result = await runStatusWrite(ctx);
    assert.equal(result.exit, 19);
    assert.equal(writes, phase === 'resolution' ? 0 : 1);
  });

test('native entry conflict retry refuses changed declarations and compensates only its own entry', async (t) => {
  const { ctx, original } = fixture(t);
  let body = original,
    writes = 0,
    rollback = null;
  ctx._mutateBody = (input) =>
    mutateIssueBody({
      ...input,
      deps: {
        fetchBody: async () => body,
        pushBody: async (_repo, _issue, next) => {
          writes++;
          body = next.replace('git log --oneline -1', 'npm run lint');
        },
      },
    });
  ctx.gh = async () => body;
  ctx._rollbackRecordedState = async (_ctx, prior) => {
    rollback = prior;
    body = writeLastKnownState(body, prior);
  };
  await assert.rejects(stampEntryMarkers(ctx), /proof authority|conflict|overlap|read.?back/i);
  assert.equal(writes, 1);
  assert.equal(rollback, 'develop');
  assert.match(body, /npm run lint/);
  assert.match(body, /state="develop"/);
});
