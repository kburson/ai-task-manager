// @story #136
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAcceptanceCriteria,
  parseCommitShas,
  findCommitTrailComment,
  gateCodeComplete,
} from '../../lib/code-complete-gate.mjs';

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

console.log('All code-complete-gate tests passed.');
