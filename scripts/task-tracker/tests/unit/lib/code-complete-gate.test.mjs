// @story #136
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAcceptanceCriteria,
  parseCommitShas,
  findCommitTrailComment,
  gateCodeComplete,
} from '../../../lib/code-complete-gate.mjs';
import { resolveContractSource } from '../../../lib/github-records/contract-source.mjs';

const cfg = { repo: 'o/r' };

const PASSING_BODY = `# Title

## Acceptance Criteria

- [x] First AC <!-- aitm-verified cmd="\`node scripts/run-tests.mjs\`" -->
- [x] Second AC <!-- aitm-verified cmd="\`gh issue view 1\`" -->

## Definition of Done

### Lifecycle

- [ ] Closed via /task close
- [ ] Linked PR merged

## Other

text
`;

test('parseAcceptanceCriteria: returns null when no AC section', () => {
  assert.equal(parseAcceptanceCriteria('# Title\n\nNo AC.'), null);
});

test('parseAcceptanceCriteria: parses only ## Acceptance Criteria section, ignores DoD', () => {
  const items = parseAcceptanceCriteria(PASSING_BODY);
  assert.equal(items.length, 2);
  assert.equal(items[0].checked, true);
  assert.match(items[0].verifiedBy, /run-tests/);
  assert.equal(items[1].checked, true);
  assert.match(items[1].verifiedBy, /gh issue view/);
});

test('parseAcceptanceCriteria: recognizes a combined single-marker AC (cmd + run-props) as verified (#481)', () => {
  // #481 — after the collapse, a verified AC carries ONE aitm-verified marker
  // bearing both the cmd declaration AND the run-props (exit/sha/ts/key). The
  // gate reads the cmd DECLARATION via resolveVerifiedBy; the upserted run-props
  // must not mask it.
  const body = `## Acceptance Criteria

- [x] Combined AC <!-- aitm-verified cmd="\`npm test\`" exit="0" sha="abc1234" ts="2026-06-20T00:00:00Z" key="deadbeef" -->
`;
  const items = parseAcceptanceCriteria(body);
  assert.equal(items.length, 1);
  assert.equal(items[0].checked, true);
  assert.match(items[0].verifiedBy, /npm test/);
});

test('gateCodeComplete: combined single-marker AC passes the verification gate (#481)', async () => {
  const body = `## Acceptance Criteria

- [x] Combined AC <!-- aitm-verified cmd="\`npm test\`" exit="0" sha="abc1234" ts="2026-06-20T00:00:00Z" key="deadbeef" -->

## Definition of Done

### Lifecycle

- [ ] Closed via /task close
`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc1234 -->' }],
      filesForSha: async () => ['src/foo.js'],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
});

test('gateCodeComplete: resolves record authority exactly once instead of trusting legacy AC state', async () => {
  let resolutionCalls = 0;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1125,
    body: PASSING_BODY,
    deps: {
      resolveContractSource: async (input) => {
        resolutionCalls += 1;
        assert.deepEqual(input, {
          repository: cfg.repo,
          issue: 1125,
          issueBody: PASSING_BODY,
          graphql: undefined,
          readContractRecord: undefined,
        });
        return {
          sourceKind: 'github-records/v1',
          contract: {
            acceptanceCriteria: [
              {
                logicalId: 'ac-record-authority',
                text: 'Record authority wins.',
                declaration:
                  'Record authority wins. <!-- aitm-verified cmd="`node --test record-authority.test.mjs`" -->',
                checked: false,
              },
            ],
          },
          authority: { contractRecordId: 'record-1125' },
        };
      },
      listComments: async () => [
        { body: '### 🔗 Commits\n<!-- aitm-commits: record-authority -->' },
      ],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });

  assert.equal(resolutionCalls, 1);
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((blocker) =>
      blocker.startsWith('code-complete-ac-unticked: Record authority wins.')
    ),
    JSON.stringify(r.blockers)
  );
});

test('gateCodeComplete: resolver refusal fails closed without legacy AC fallback', async () => {
  let resolutionCalls = 0;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1125,
    body: PASSING_BODY,
    deps: {
      resolveContractSource: async () => {
        resolutionCalls += 1;
        throw new Error('contract-source:unavailable');
      },
      listComments: async () => [
        { body: '### 🔗 Commits\n<!-- aitm-commits: record-authority -->' },
      ],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });

  assert.equal(resolutionCalls, 1);
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.includes('code-complete-contract-source-failed: contract-source:unavailable'),
    JSON.stringify(r.blockers)
  );
});

test('gateCodeComplete: legacy and record contracts share the same AC policy matrix', async () => {
  const cases = [
    {
      name: 'checked verified',
      declaration: 'Checked verified AC <!-- aitm-verified cmd="`npm test`" -->',
      checked: true,
      audit: false,
      expectedAcBlockers: [],
    },
    {
      name: 'unchecked verified',
      declaration: 'Unchecked verified AC <!-- aitm-verified cmd="`npm test`" -->',
      checked: false,
      audit: false,
      expectedAcBlockers: ['code-complete-ac-unticked: Unchecked verified AC'],
    },
    {
      name: 'checked unverified',
      declaration: 'Checked unverified AC',
      checked: true,
      audit: false,
      expectedAcBlockers: ['code-complete-ac-unverified: Checked unverified AC'],
    },
    {
      name: 'checked non-demonstrable',
      declaration: 'Non-demonstrable AC <!-- aitm-non-demonstrable -->',
      checked: true,
      audit: false,
      expectedAcBlockers: [],
    },
    {
      name: 'checked audit-waived',
      declaration: 'Audit-waived AC <!-- aitm-ac-waived by="audit" -->',
      checked: true,
      audit: true,
      expectedAcBlockers: [],
    },
  ];

  for (const scenario of cases) {
    const body = [
      '## Acceptance Criteria',
      '',
      `- [${scenario.checked ? 'x' : ' '}] ${scenario.declaration}`,
      '',
      '## AITM Progress Markers',
      '',
      ...(scenario.audit
        ? ['<!-- aitm-issue-kind kind="audit" -->', '<!-- aitm-deliverable-posted -->']
        : []),
      '',
    ].join('\n');
    const blockersBySource = new Map();

    for (const sourceKind of ['legacy-body/v1', 'github-records/v1']) {
      let resolutionCalls = 0;
      const r = await gateCodeComplete({
        cfg,
        issueNumber: 1126,
        body,
        deps: {
          resolveContractSource: async (input) => {
            resolutionCalls += 1;
            if (sourceKind === 'legacy-body/v1') return resolveContractSource(input);
            return {
              sourceKind,
              contract: {
                acceptanceCriteria: [
                  {
                    logicalId: `ac-${scenario.name.replaceAll(' ', '-')}`,
                    text: scenario.declaration.replace(/<!--.*?-->/g, '').trim(),
                    declaration: scenario.declaration,
                    checked: scenario.checked,
                  },
                ],
              },
              authority: { contractRecordId: `record-${scenario.name.replaceAll(' ', '-')}` },
            };
          },
          listComments: async () => [
            { body: '### 🔗 Commits\n<!-- aitm-commits: policy-parity -->' },
          ],
          filesForSha: async () => [],
          dirtyFiles: async () => new Set(),
        },
      });

      assert.equal(resolutionCalls, 1, `${scenario.name}: ${sourceKind}`);
      blockersBySource.set(
        sourceKind,
        r.blockers.filter((blocker) => blocker.startsWith('code-complete-ac-'))
      );
    }

    assert.deepEqual(
      blockersBySource.get('legacy-body/v1'),
      scenario.expectedAcBlockers,
      `${scenario.name}: legacy policy`
    );
    assert.deepEqual(
      blockersBySource.get('github-records/v1'),
      scenario.expectedAcBlockers,
      `${scenario.name}: record policy`
    );
  }
});

test('parseCommitShas: extracts comma-separated SHAs', () => {
  const body = '### 🔗 Commits\n<!-- aitm-commits: abc123, def456,ghi789 -->';
  assert.deepEqual(parseCommitShas(body), ['abc123', 'def456', 'ghi789']);
});

test('parseCommitShas: empty marker → []', () => {
  assert.deepEqual(parseCommitShas('<!-- aitm-commits:  -->'), []);
});

test('findCommitTrailComment: finds comment with both heading and marker', () => {
  const comments = [{ body: 'random' }, { body: '### 🔗 Commits\n<!-- aitm-commits: abc -->' }];
  assert.ok(findCommitTrailComment(comments));
  assert.equal(findCommitTrailComment([{ body: 'no trail' }]), null);
});

test('gateCodeComplete: all-passing → ok:true', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: PASSING_BODY,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc123 -->' }],
      filesForSha: async () => ['src/foo.js'],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.shas, ['abc123']);
});

test('gateCodeComplete: missing AC section → blocker', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: '# Title\n\nno AC',
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.startsWith('code-complete-no-ac-section')));
});

test('gateCodeComplete: unticked AC → blocker', async () => {
  const body = `## Acceptance Criteria
- [ ] Unticked AC
- [x] Ticked <!-- aitm-verified cmd="\`x\`" -->
`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: a -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.includes('ac-unticked: Unticked AC')));
});

test('gateCodeComplete: ticked without aitm-verified-by → blocker', async () => {
  const body = `## Acceptance Criteria
- [x] Ticked but unverified
`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: a -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.includes('ac-unverified: Ticked but unverified')));
});

test('gateCodeComplete: aitm-verified cmd="TBD" treated as unverified', async () => {
  const body = `## Acceptance Criteria
- [x] AC with TBD <!-- aitm-verified cmd="TBD" -->
`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: a -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.includes('ac-unverified')));
});

test('gateCodeComplete: missing commit-trail comment → blocker', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: PASSING_BODY,
    deps: {
      listComments: async () => [{ body: 'no trail here' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.startsWith('code-complete-commits-missing')));
});

test('gateCodeComplete: empty aitm-commits marker → blocker', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: PASSING_BODY,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits:  -->' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(r.blockers.some((b) => b.startsWith('code-complete-commits-empty')));
});

test('gateCodeComplete: dirty file in touch-set → blocker names file', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: PASSING_BODY,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc -->' }],
      filesForSha: async () => ['src/foo.js', 'src/bar.js'],
      dirtyFiles: async () => new Set(['src/foo.js', 'unrelated.js']),
    },
  });
  assert.equal(r.ok, false);
  const dirtyBlocker = r.blockers.find((b) => b.startsWith('code-complete-dirty-files'));
  assert.ok(dirtyBlocker);
  assert.match(dirtyBlocker, /src\/foo\.js/);
  assert.doesNotMatch(dirtyBlocker, /unrelated/);
});

test('gateCodeComplete: lifecycle DoD unticked ignored when functional ACs pass', async () => {
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body: PASSING_BODY,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc -->' }],
      filesForSha: async () => ['src/foo.js'],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true);
});

test('gateCodeComplete: docs-only body takes the commit-trail path, not the deliverable lane (#923)', async () => {
  // docs-only is commit-bearing (NOT a no-commit kind), so it must satisfy the
  // `### 🔗 Commits` trail like any code issue — it must NOT be routed onto the
  // `aitm-deliverable-posted` deliverable lane, and the gate never demands a
  // `tests` DoD stamp. A docs-only body with a commit trail passes.
  const body = `${PASSING_BODY}\n<!-- aitm-issue-kind kind="docs-only" -->\n`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: '### 🔗 Commits\n<!-- aitm-commits: abc123 -->' }],
      filesForSha: async () => ['docs/guides/foo.md'],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, true, JSON.stringify(r.blockers));
  assert.deepEqual(r.blockers, []);
  assert.deepEqual(r.shas, ['abc123']);
});

test('gateCodeComplete: docs-only with NO commit trail still blocks (not deliverable-waived) (#923)', async () => {
  const body = `${PASSING_BODY}\n<!-- aitm-issue-kind kind="docs-only" -->\n`;
  const r = await gateCodeComplete({
    cfg,
    issueNumber: 1,
    body,
    deps: {
      listComments: async () => [{ body: 'no trail here' }],
      filesForSha: async () => [],
      dirtyFiles: async () => new Set(),
    },
  });
  assert.equal(r.ok, false);
  assert.ok(
    r.blockers.some((b) => b.startsWith('code-complete-commits-missing')),
    JSON.stringify(r.blockers)
  );
});

console.log('All code-complete-gate tests passed.');
