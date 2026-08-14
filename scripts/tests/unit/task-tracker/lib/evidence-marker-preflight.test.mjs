#!/usr/bin/env node
// @story #113
import { strict as assert } from 'node:assert';
import { runReviewPreflight } from '../../../../task-tracker/lib/review-preflight.mjs';

const SHA = 'abcdef1234567890';
const TRAIL = [
  '### 🔗 Commits',
  '',
  '<!-- aitm-commits: abcdef1234567890 -->',
  '',
  '| SHA | Subject | Author | When |',
  '|---|---|---|---|',
  '| [`abcdef1`](https://github.com/o/r/commit/abcdef1234567890) | s | a | t |',
].join('\n');

const baseDeps = {
  gitStatus: async () => '',
  gitHeadSha: async () => SHA,
  findTrailComment: async () => ({ body: TRAIL }),
  // #733 — attribution is message-based; the retired `gitIsAncestor` dep is
  // ignored, so inject the current `hasAttributingCommit` seam instead.
  hasAttributingCommit: async () => true,
};

{
  const r = await runReviewPreflight({
    issueNumber: '113',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      ...baseDeps,
      getIssueBody: async () =>
        [
          '## Acceptance Criteria',
          '- [ ] Existing issue can be audited',
          '',
          '### Verification Commands',
          '- [ ] `node scripts/tests/unit/task-tracker/evidence-marker-preflight.test.mjs`',
        ].join('\n'),
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join('\n'), /Existing issue can be audited/);
  assert.match(r.reasons.join('\n'), /missing `aitm-verified cmd="..."` evidence declaration/);
}

{
  const r = await runReviewPreflight({
    issueNumber: '113',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      ...baseDeps,
      getIssueBody: async () =>
        [
          '## Acceptance Criteria',
          '- [ ] Existing issue can be audited <!-- aitm-verified cmd="`node scripts/tests/unit/task-tracker/evidence-marker-preflight.test.mjs`" -->',
          '',
          '### Verification Commands',
          '- [ ] `node scripts/tests/unit/task-tracker/other.test.mjs`',
        ].join('\n'),
    },
  });
  assert.equal(r.ok, false);
  assert.match(
    r.reasons.join('\n'),
    /evidence command missing from Verification Commands: node scripts\/tests\/unit\/task-tracker\/evidence-marker-preflight\.test\.mjs/
  );
}

{
  const r = await runReviewPreflight({
    issueNumber: '113',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      ...baseDeps,
      getIssueBody: async () =>
        [
          '## Acceptance Criteria',
          '- [ ] Existing issue can be audited <!-- aitm-verified cmd="`node scripts/tests/unit/task-tracker/evidence-marker-preflight.test.mjs`" -->',
          '- [ ] Standard DoD command may prove an AC <!-- aitm-verified cmd="`npm test`" -->',
          '',
          '### Verification Commands',
          '- [ ] `node scripts/tests/unit/task-tracker/evidence-marker-preflight.test.mjs`',
          '- [ ] `npm test`',
        ].join('\n'),
    },
  });
  assert.equal(r.ok, true, r.reasons.join('\n'));
}

// #326 regression: standard DoD command (e.g. `npm test`) named in an AC's
// aitm-verified-by marker but ABSENT from ### Verification Commands must be
// refused. The directive used to exempt standard DoD commands from
// Verification Commands ("do not duplicate"); #326 closed that exemption so
// the sandbox actually runs every named command.
{
  const r = await runReviewPreflight({
    issueNumber: '326-regression',
    repo: 'o/r',
    projectDir: '/repo',
    deps: {
      ...baseDeps,
      getIssueBody: async () =>
        [
          '## Acceptance Criteria',
          '- [ ] Standard DoD command may prove an AC <!-- aitm-verified cmd="`npm test`" -->',
          '',
          '### Verification Commands',
          '- [ ] `node scripts/tests/unit/task-tracker/other.test.mjs`',
        ].join('\n'),
    },
  });
  assert.equal(r.ok, false);
  assert.match(
    r.reasons.join('\n'),
    /evidence command missing from Verification Commands: npm test/,
    '#326: standard DoD commands named in AC evidence markers must appear in Verification Commands'
  );
}

console.log('evidence-marker-preflight.test.mjs: all passed');
