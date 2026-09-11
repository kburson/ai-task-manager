// @story #1486
import assert from 'node:assert/strict';
import { test } from 'node:test';

const moduleUrl = new URL('../../../../task-tracker/lib/graph-node-authority.mjs', import.meta.url);

async function loadContract() {
  const contract = await import(moduleUrl).catch(() => null);
  assert.ok(contract, 'graph-node-authority shared module must exist');
  assert.equal(typeof contract.buildGraphNodeAuthority, 'function');
  assert.equal(typeof contract.fetchParentIssueBody, 'function');
  return contract;
}

function marker({ path = '/work/epic', branch = 'codex/custom-epic', ts = '2026-09-11T00:00:00Z' } = {}) {
  return `<!-- aitm-worktree-location worktree="${path}" branch="${branch}" sid="test" ts="${ts}" -->`;
}

test('shared graph-node authority contract exists', async () => {
  await loadContract();
});

test('maps parent custom authority and preserves marker-free fallback', async () => {
  const { buildGraphNodeAuthority } = await loadContract();
  assert.deepEqual(
    buildGraphNodeAuthority({ parent: '1485', children: [{ number: '1486' }], parentBody: marker() }),
    { parent: 1485, children: [1486], parentAuthoritativeBranch: 'codex/custom-epic' }
  );
  assert.deepEqual(buildGraphNodeAuthority({ parent: 1485, children: [], parentBody: '## Epic' }), {
    parent: 1485,
    children: [],
  });
});

test('maps own worktree authority independently of parent authority', async () => {
  const { buildGraphNodeAuthority } = await loadContract();
  assert.deepEqual(
    buildGraphNodeAuthority({
      parent: 1485,
      children: [],
      ownBody: marker({ path: '/work/child', branch: 'codex/custom-child' }),
      parentBody: marker(),
    }),
    {
      parent: 1485,
      children: [],
      authoritativeBranch: 'codex/custom-child',
      authoritativeWorktree: '/work/child',
      parentAuthoritativeBranch: 'codex/custom-epic',
    }
  );
});

test('captures malformed and ambiguous authority without inventing a branch', async () => {
  const { buildGraphNodeAuthority } = await loadContract();
  const malformed = buildGraphNodeAuthority({
    parent: 1485,
    parentBody: '<!-- aitm-worktree-location worktree="/work/epic" ts="2026-09-11T00:00:00Z" -->',
  });
  assert.match(malformed.parentAuthorityError, /malformed/);
  assert.equal('parentAuthoritativeBranch' in malformed, false);

  const ambiguousBody = [
    marker(),
    marker({ path: '/work/other', branch: 'codex/other-epic' }),
  ].join('\n');
  const ambiguous = buildGraphNodeAuthority({ parent: 1485, parentBody: ambiguousBody });
  assert.match(ambiguous.parentAuthorityError, /ambiguous/);
  assert.equal('parentAuthoritativeBranch' in ambiguous, false);

  const ownMalformed = buildGraphNodeAuthority({
    ownBody: '<!-- aitm-worktree-location branch="codex/child" ts="2026-09-11T00:00:00Z" -->',
  });
  assert.match(ownMalformed.authorityError, /malformed/);
  assert.equal('authoritativeBranch' in ownMalformed, false);
});

test('supports rich child mapping while validating default identities', async () => {
  const { buildGraphNodeAuthority } = await loadContract();
  const child = { number: '1486', title: 'Child', stateReason: 'COMPLETED' };
  assert.deepEqual(
    buildGraphNodeAuthority({
      children: [child],
      mapChild: (value) => ({
        number: Number(value.number),
        title: value.title,
        closeReason: value.stateReason,
      }),
    }).children,
    [{ number: 1486, title: 'Child', closeReason: 'COMPLETED' }]
  );
  assert.throws(() => buildGraphNodeAuthority({ parent: 0 }), /parent issue must be a positive integer/);
  assert.throws(() => buildGraphNodeAuthority({ children: [{ number: 'nope' }] }), /child issue/);
  assert.throws(() => buildGraphNodeAuthority({ children: null }), /children must be an array/);
  assert.throws(() => buildGraphNodeAuthority({ mapChild: null }), /mapChild must be a function/);
});

test('requires a body for a non-null parent and allows a null-parent node', async () => {
  const { buildGraphNodeAuthority } = await loadContract();
  assert.throws(
    () => buildGraphNodeAuthority({ parent: 1485 }),
    /graph-node-authority: parent #1485 body unavailable/
  );
  assert.deepEqual(buildGraphNodeAuthority(), { parent: null, children: [] });
});

test('fetches a parameterized parent body through injected dependencies', async () => {
  const { fetchParentIssueBody } = await loadContract();
  const calls = [];
  const body = await fetchParentIssueBody({
    parentIssue: '1485',
    cfg: { repo: 'owner/repo' },
    deps: {
      splitRepo(value) {
        assert.equal(value, 'owner/repo');
        return { owner: 'owner', repoName: 'repo' };
      },
      async gql(query, variables) {
        calls.push({ query, variables });
        return { repository: { issue: { body: '## Parent' } } };
      },
    },
  });
  assert.equal(body, '## Parent');
  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /query\(\$owner: String!, \$repo: String!, \$issue: Int!\)/);
  assert.deepEqual(calls[0].variables, { owner: 'owner', repo: 'repo', issue: 1485 });
});

test('null parents do not fetch and unavailable fetched bodies fail closed', async () => {
  const { fetchParentIssueBody } = await loadContract();
  let called = false;
  const deps = {
    splitRepo: () => ({ owner: 'owner', repoName: 'repo' }),
    gql: async () => {
      called = true;
      return { repository: { issue: null } };
    },
  };
  assert.equal(await fetchParentIssueBody({ parentIssue: null, deps }), undefined);
  assert.equal(called, false);
  await assert.rejects(
    fetchParentIssueBody({ parentIssue: 1485, cfg: { repo: 'owner/repo' }, deps }),
    /graph-node-authority: parent #1485 body unavailable/
  );
});
