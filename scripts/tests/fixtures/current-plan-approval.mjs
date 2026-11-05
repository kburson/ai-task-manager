// @story #2153
// Real local Git and approval producer; only provider transport is substituted.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';
import { runPlanApprove } from '../../task-tracker/verbs/plan-approve.mjs';
import { renderTransitionCommitComment } from '../../task-tracker/lib/move-state/transition-commit.mjs';
import {
  renderPlanTransitionAuthorityComment,
  resolvePlanTransitionAuthority,
} from '../../task-tracker/lib/plan-transition-authority.mjs';

export function currentScopeFixture(t, scratchBase = projectScratchDir('test')) {
  const projectDir = mkdtempSync(path.join(scratchBase, 'current-approval-'));
  t.after(() => rmSync(projectDir, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: projectDir, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Approval Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const plan =
    '# Current approval fixture\n\n## Story Intent\n\n- **Beneficiary:** release operator\n- **Capability:** stop partial publication\n- **Need:** registry checks can fail\n- **Value or failure prevented:** consumers receive complete releases\n';
  writeFileSync(path.join(projectDir, 'plan.md'), plan);
  git('add', 'plan.md');
  git('commit', '--quiet', '-m', 'Fixture source');
  const move = 'move:bbec1b1c-b113-4ae3-8037-9db4ea1152b0';
  const visit = `<!-- aitm-entered-develop ts="2026-11-04T01:51:59.359Z" move="${move}" -->`;
  let body =
    '## User Story\n\nAs a release operator\nI want to stop partial publication because registry checks can fail\nSo that consumers receive complete releases\n\n## Scope\n\nPrevent partial publication from incomplete registry checks.\n\n## Plan Metadata\n\n- Implementation-plan: plan.md\n\n## Deep-Dive Analysis\n\nInvestigated publication boundaries and reviewed the current plan.\n\n## Acceptance Criteria\n\n- [ ] Stop partial publication. <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n\n- [ ] `node --test scripts/tests/fixture.test.mjs` <!-- id=1 -->\n\n<!-- aitm-entered-plan ts="2026-11-04T01:50:00Z" -->\n<!-- aitm-deep-dive-complete ts="2026-11-04T01:51:00Z" -->\n' +
    visit +
    '\n<!-- aitm-move-complete state=review ts=2026-11-05T06:01:54Z move=move:97389e5b-c278-4371-aaaf-31b03b6f90f2 -->';
  const record = resolvePlanTransitionAuthority({
    repository: 'o/r',
    issue: 2153,
    transitionId: move,
    scopeIdentity: `sha256:${'4'.repeat(64)}`,
    recordedAt: '2026-11-04T01:51:48.142Z',
    sessionPolicy: { gates: { analysisToDevelopment: false } },
  });
  const obs = (id, body, createdAt) => ({
    id,
    body,
    createdAt,
    updatedAt: createdAt,
    author: { login: 'owner' },
    authorAssociation: 'OWNER',
  });
  const comments = [
    obs('1', renderPlanTransitionAuthorityComment(record), '2026-11-04T01:51:50Z'),
    obs(
      '2',
      renderTransitionCommitComment({
        schema: 'aitm.transition-commit/v1',
        transitionId: move,
        repository: 'o/r',
        issue: 2153,
        source: 'plan',
        target: 'develop',
        visitMarker: visit,
        actor: 'owner',
        sentinelFingerprint: `sha256:${'a'.repeat(64)}`,
      }),
      '2026-11-04T01:52:06Z'
    ),
  ];
  let state = 'review',
    trunk = git('rev-parse', 'HEAD'),
    now = '2026-11-05T07:00:00Z';
  const calls = { writes: 0, audits: 0, waiverReads: 0 };
  const deps = {
    env: { TT_FULL_AUTO: '1' },
    fetchIssueBody: async () => body,
    getBoardState: async () => state,
    fetchEpicChildren: async () => [],
    readDirectoryContract: async () => null,
    resolveTrunkSha: async () => trunk,
    nowIso: () => now,
    listEvidenceComments: async () => comments,
    listComments: async () => comments,
    listWorkflowExceptionRecords: async () => {
      calls.waiverReads++;
      throw Error('waiver reconstruction must not run');
    },
    listIssueBodyHistory: async () => {
      throw Error('legacy history reader must not run');
    },
    mutateIssueBody: async ({ mutate, validateFreshBase, validateFreshBaseAsync }) => {
      await validateFreshBaseAsync?.(body);
      validateFreshBase?.(body);
      const next = await mutate(body);
      if (next !== body) {
        calls.writes++;
        body = next;
      }
      return { body, status: 'ok' };
    },
    postComment: async ({ body: audit }) => {
      calls.audits++;
      comments.push(obs(String(comments.length + 1), audit, now));
    },
  };
  return {
    projectDir,
    git,
    deps,
    calls,
    comments,
    get body() {
      return body;
    },
    set body(x) {
      body = x;
    },
    set state(x) {
      state = x;
    },
    set trunk(x) {
      trunk = x;
    },
    set now(x) {
      now = x;
    },
    run: (overrides = {}) =>
      runPlanApprove({
        issueNumber: 2153,
        cfg: { repo: 'o/r', trunkRef: 'HEAD' },
        projectDir,
        currentScope: true,
        deps,
        ...overrides,
      }),
  };
}
