// @story #2156
// Only provider transport and explicit unit-local operator seams are substituted.
import { stampBodyVersion } from '../../task-tracker/lib/body-version.mjs';

export const spikeUrl = 'https://github.com/owner/repo/issues/2156#issuecomment-50';
export const spikeTimestamp = '2026-11-05T11:00:00.000Z';

export function spikeProviderFixture() {
  const f = {
    cfg: { repo: 'owner/repo', projectId: 'PVT_a' },
    state: 'develop',
    issueState: 'OPEN',
    owners: ['owner'],
    currentUser: 'owner',
    clean: true,
    sourceHead: 'a'.repeat(40),
    timer: {
      active: '#2156',
      entryStartTs: '2026-11-05T10:00:00.000Z',
      pausedAtTs: null,
      bindingGenerationId: 'fixture-generation',
      worktreePath: '/fixture/spike',
      worktreeBranch: 'codex/2156-fixture',
    },
    operator: {
      worktreePath: '/fixture/spike',
      headSha: 'a'.repeat(40),
      branch: 'codex/2156-fixture',
      sessionId: 'fixture-native-2156',
      boundIssue: 2156,
      bindingGenerationId: 'fixture-generation',
    },
    comment: {
      id: 50,
      html_url: spikeUrl,
      body: '# Tested findings\n\nThe disposable experiment refused a missing native actor.',
      user: { login: 'owner', type: 'User' },
      created_at: '2026-11-04T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
    },
    writes: [],
    hooks: {},
    admitted: true,
  };
  f.body = stampBodyVersion(
    '<!-- aitm-last-known-state state="develop" ts="2026-11-05T10:00:00.000Z" -->\n' +
      '## User Story\n\nAs a native operator\nI want to publish findings because a writer is missing\nSo that genuine reports keep attributable evidence\n\n' +
      '## Scope\n\nOne bounded investigation report.\n\n' +
      '## Story Origin\n\n- **kind**: spike\n\n' +
      '## Acceptance Criteria\n\n- [ ] Publish genuine findings. <!-- aitm-verified vc-list="vc:1" -->\n\n' +
      '## Verification Commands\n\n- [ ] `git status --short` <!-- id=1 -->\n\n' +
      '## Definition of Done\n\n- [ ] Findings delivered.\n\n' +
      '## AITM Progress Markers\n\n<!-- aitm-issue-kind kind="spike" -->\n' +
      '<!-- aitm-entered-develop ts="2026-11-05T10:00:00.000Z" move="move:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" -->\n',
    1
  );
  f.pexec = async (binary, args) => {
    if (binary !== 'gh' || args[0] !== 'api') throw Error('unexpected fixture provider command');
    if (args[1] === 'user') return { stdout: f.currentUser + '\n', stderr: '' };
    if (args[1] === 'repos/owner/repo/issues/comments/50') {
      await f.hooks.beforeComment?.();
      return { stdout: JSON.stringify(f.comment), stderr: '' };
    }
    throw Error('unexpected fixture provider endpoint: ' + args[1]);
  };
  f.gql = async () => {
    await f.hooks.beforeAuthority?.();
    return {
      viewer: { login: f.currentUser },
      repository: {
        issue: {
          body: f.body,
          state: f.issueState,
          assignees: { nodes: f.owners.map((login) => ({ login })) },
          projectItems: {
            nodes: [
              { id: 'PVTI_a', project: { id: 'PVT_a' }, fieldValueByName: { name: f.state } },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    };
  };
  f.writeDeps = {
    fetchBody: async () => {
      await f.hooks.beforeFetch?.();
      return f.body;
    },
    pushBody: async (_repo, _issue, body) => {
      f.writes.push(body);
      if (f.hooks.push) return f.hooks.push(body);
      f.body = body;
      await f.hooks.afterPush?.();
    },
    warn: () => {},
  };
  f.transport = { pexec: f.pexec, gql: f.gql, writeDeps: f.writeDeps, now: () => spikeTimestamp };
  f.unitDeps = {
    ...f.transport,
    loadState: () => structuredClone(f.timer),
    captureOperator: () => structuredClone(f.operator),
    readSource: () => ({ headSha: f.sourceHead, clean: f.clean }),
    admitEffect: async () => {
      if (!f.admitted) throw Error('fixture scoped-deliverable refused');
    },
  };
  f.ctx = {
    cfg: f.cfg,
    projectDir: '/fixture/spike',
    statePath: '/fixture/spike/state.json',
    rest: ['2156', '--from-comment', '50'],
  };
  return f;
}
