// @story #2093 #2105
// Offline fixture: isolate external GitHub reads, keep real hook/Git/state/policy.
import { mock } from 'node:test';
import * as assignments from '../../task-tracker/lib/assignment-snapshot.mjs';
import * as github from '../../gh/lib/gh-client.mjs';

mock.module(new URL('../../task-tracker/lib/assignment-snapshot.mjs', import.meta.url).href, {
  namedExports: {
    ...assignments,
    fetchAssignmentSnapshot: async ({ issueNumber, cfg }) => {
      if (issueNumber !== 2105 || cfg.projectId !== 'PVT_native_branch_fixture')
        throw new Error('unexpected fixture issue/project');
      return { state: 'develop', assignees: ['fixture-owner'] };
    },
  },
});

mock.module(new URL('../../gh/lib/gh-client.mjs', import.meta.url).href, {
  namedExports: {
    ...github,
    pexec: async (command, args) => {
      if (command !== 'gh') throw new Error('unexpected fixture executable');
      if (args.join(' ') === 'api user --jq .login')
        return { stdout: 'fixture-owner\n', stderr: '' };
      if (args.join(' ') === 'issue view 2105 -R kburson/ai-task-manager --json state,body') {
        return {
          stdout: JSON.stringify({
            state: 'OPEN',
            body:
              '<!-- aitm-last-known-state state="develop" ts="2026-10-01T00:00:00Z" -->\n' +
              '<!-- aitm-worktree-location worktree="' +
              process.cwd() +
              '" branch="feature/child/1166" sid="native-renewal-offline-fixture" ts="2026-10-01T00:00:00Z" -->\n',
          }),
          stderr: '',
        };
      }
      throw new Error('unexpected fixture GitHub read: ' + args.join(' '));
    },
  },
});
