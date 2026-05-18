import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAcceptanceCriteria,
  parseCommitShas,
  findCommitTrailComment,
  gateCodeComplete,
} from '../lib/code-complete-gate.mjs';

const cfg = { repo: 'o/r' };

const PASSING_BODY = `# Title

## Acceptance Criteria

- [x] First AC <!-- aitm-verified-by: \`node scripts/run-tests.mjs\` -->
- [x] Second AC <!-- aitm-verified-by: \`gh issue view 1\` -->

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
- [x] Ticked <!-- aitm-verified-by: \`x\` -->
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

test('gateCodeComplete: aitm-verified-by:TBD treated as unverified', async () => {
  const body = `## Acceptance Criteria
- [x] AC with TBD <!-- aitm-verified-by: TBD -->
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

console.log('All code-complete-gate tests passed.');
