#!/usr/bin/env node
// @story #113
import { strict as assert } from 'node:assert';
import { auditEvidenceMarkers, buildEvidenceBackfill } from '../../lib/evidence-markers.mjs';
import { runEvidenceMarkers } from '../../verbs/evidence-markers.mjs';

const metadata = [
  '<!-- ai-task-manager:fields:start -->',
  '```json',
  '{"schema":1,"values":{"size":"M"}}',
  '```',
  '<!-- ai-task-manager:fields:end -->',
].join('\n');

{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Plain AC',
    '',
    '### Verification Commands',
    '- [ ] `node scripts/task-tracker/tests/existing.test.mjs`',
    '',
    metadata,
  ].join('\n');
  const audit = auditEvidenceMarkers(body);
  assert.deepEqual(
    audit.missingEvidence.map((x) => x.label),
    ['Plain AC']
  );
  assert.deepEqual(audit.missingVerificationCommands, []);
}

{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Covered AC <!-- aitm-verified cmd="`node scripts/task-tracker/tests/new.test.mjs`" -->',
    '- [ ] Standard DoD AC <!-- aitm-verified cmd="`npm run lint`" -->',
    '',
    '### Verification Commands',
    '- [ ] `node scripts/task-tracker/tests/existing.test.mjs`',
    '',
    metadata,
  ].join('\n');
  const audit = auditEvidenceMarkers(body);
  assert.deepEqual(audit.missingEvidence, []);
  // #231 — `npm run lint` is no longer exempt from the VC-linkage requirement,
  // so it also surfaces as missing here.
  assert.deepEqual(audit.missingVerificationCommands, [
    'node scripts/task-tracker/tests/new.test.mjs',
    'npm run lint',
  ]);
  assert.deepEqual(audit.staleVerificationCommands, [
    'node scripts/task-tracker/tests/existing.test.mjs',
  ]);
}

{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Plain AC',
    '',
    '## Pickup Directive',
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '',
    metadata,
  ].join('\n');
  const result = buildEvidenceBackfill(body, {
    mappings: {
      'Plain AC': ['node scripts/task-tracker/tests/evidence-marker-backfill.test.mjs'],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.match(
    result.body,
    /Plain AC <!-- aitm-verified cmd="`node scripts\/task-tracker\/tests\/evidence-marker-backfill\.test\.mjs`" -->/
  );
  assert.match(
    result.body,
    /### Verification Commands\n\n- \[ \] `node scripts\/task-tracker\/tests\/evidence-marker-backfill\.test\.mjs`/
  );
  assert.ok(result.body.includes(metadata), 'hidden metadata is preserved');
}

{
  const body = ['## Acceptance Criteria', '- [ ] Ambiguous AC'].join('\n');
  const result = buildEvidenceBackfill(body, { mappings: {} });
  assert.equal(result.ok, false);
  assert.deepEqual(result.ambiguousLabels, ['Ambiguous AC']);
}

{
  let written = '';
  const body = ['## Acceptance Criteria', '- [ ] Plain AC'].join('\n');
  const result = await runEvidenceMarkers({
    issueNumber: 113,
    mode: 'backfill',
    cfg: { repo: 'o/r' },
    mappings: { 'Plain AC': ['node scripts/task-tracker/tests/evidence-marker-backfill.test.mjs'] },
    deps: {
      fetchIssueBody: async () => body,
      // #295 — verb now writes via mutateIssueBody closure.
      mutateIssueBody: async ({ mutate }) => {
        const next = mutate(body);
        if (next === body) return { status: 'no-op' };
        written = next;
        return { status: 'ok' };
      },
    },
  });
  assert.equal(result.status, 'backfilled');
  assert.match(written, /aitm-verified cmd=/);
}

// #296 — regression: when `### Verification Commands` (H3) is nested under
// a Deep-Dive H2 followed by sibling H3 subsections, the inserter must
// stop at the next same-or-higher-level heading (H1/H2/H3), not at the
// next H2. Pre-fix this dropped new bullets into the wrong logical
// section and audit kept reporting them as `missing-verification-command`.
{
  const body = [
    '## Acceptance Criteria',
    '- [ ] Plain AC',
    '',
    '## Deep-Dive Analysis',
    '',
    '### Verification Commands',
    '',
    '- [ ] `node scripts/task-tracker/tests/existing.test.mjs`',
    '',
    '### Identified risks',
    '',
    '- Some risk.',
    '',
    '### Sibling sub-issues',
    '',
    'None.',
    '',
    '## Dependency Map',
    '',
    'Depends on: none.',
    '',
    metadata,
  ].join('\n');
  const result = buildEvidenceBackfill(body, {
    mappings: {
      'Plain AC': ['node scripts/task-tracker/tests/regression-new.test.mjs'],
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const lines = result.body.split('\n');
  const newCmdIdx = lines.findIndex((l) =>
    l.includes('node scripts/task-tracker/tests/regression-new.test.mjs')
  );
  // The bullet for that command appears twice: once in the AC marker, once as a VC list item.
  const newBulletIdx = lines.findIndex((l) =>
    /^- \[ \] `node scripts\/task-tracker\/tests\/regression-new\.test\.mjs`/.test(l)
  );
  const identifiedRisksIdx = lines.findIndex((l) => /^###\s+Identified risks\b/.test(l));
  const dependencyMapIdx = lines.findIndex((l) => /^##\s+Dependency Map\b/.test(l));
  assert.ok(newCmdIdx >= 0, 'AC marker should reference the new command');
  assert.ok(newBulletIdx >= 0, 'a new VC bullet should be inserted');
  assert.ok(
    newBulletIdx < identifiedRisksIdx,
    `bullet should land before ### Identified risks (got bullet@${newBulletIdx}, risks@${identifiedRisksIdx})`
  );
  assert.ok(
    newBulletIdx < dependencyMapIdx,
    `bullet should land well before ## Dependency Map (got bullet@${newBulletIdx}, depMap@${dependencyMapIdx})`
  );
  // And the post-insert audit should be clean (no missing-verification-command).
  const post = auditEvidenceMarkers(result.body);
  assert.deepEqual(
    post.missingVerificationCommands,
    [],
    `missing-verification-command should be empty post-backfill; got ${JSON.stringify(post.missingVerificationCommands)}`
  );
}

// #422 — the declaration writer must NOT append a redundant `aitm-verified`
// declaration to a line that already carries an `aitm-dod-evidence` marker (the
// evidence marker is a strict content superset). A plain line with no evidence
// still gets the declaration. Both cases in one backfill.
{
  const dodEvidence =
    '<!-- aitm-dod-evidence key="tests" cmd="npm run test:all" exit="0" sha="abc1234" ts="2026-06-16T00:00:00.000Z" -->';
  const body = [
    '## Acceptance Criteria',
    `- [ ] Evidence-bearing AC ${dodEvidence}`,
    '- [ ] Plain AC',
    '',
    '## Pickup Directive',
    '> Follow: `.ai-task-manager/pickup-directive.md`',
    '',
    metadata,
  ].join('\n');
  // Key mappings off the audit's own labels (markers are retained in the
  // label text), mirroring how the real caller assembles `mappings`.
  const pre = auditEvidenceMarkers(body);
  const mappings = {};
  for (const item of pre.missingEvidence) {
    mappings[item.label] = item.label.startsWith('Evidence-bearing')
      ? ['npm run test:all']
      : ['node scripts/task-tracker/tests/evidence-marker-backfill.test.mjs'];
  }
  const result = buildEvidenceBackfill(body, { mappings });
  assert.equal(result.ok, true, JSON.stringify(result));
  const lines = result.body.split('\n');
  const evLine = lines.find((l) => l.includes('Evidence-bearing AC'));
  const plainLine = lines.find((l) => l.startsWith('- [ ] Plain AC'));
  // Case 1: evidence-bearing line keeps its aitm-dod-evidence and gains NO
  // redundant aitm-verified declaration.
  assert.ok(evLine.includes('aitm-dod-evidence'), 'evidence marker preserved');
  assert.ok(
    !evLine.includes('aitm-verified'),
    `no redundant declaration on evidence-bearing line; got: ${evLine}`
  );
  // Case 2: plain line (no evidence) still receives the declaration.
  assert.match(
    plainLine,
    /Plain AC <!-- aitm-verified cmd="`node scripts\/task-tracker\/tests\/evidence-marker-backfill\.test\.mjs`" -->/
  );
}

console.log('evidence-marker-backfill.test.mjs: all passed');
