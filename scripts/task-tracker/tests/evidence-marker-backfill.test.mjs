#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { auditEvidenceMarkers, buildEvidenceBackfill } from '../lib/evidence-markers.mjs';
import { runEvidenceMarkers } from '../verbs/evidence-markers.mjs';

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
    '- [ ] Covered AC <!-- aitm-verified-by: `node scripts/task-tracker/tests/new.test.mjs` -->',
    '- [ ] Standard DoD AC <!-- aitm-verified-by: `npm run lint` -->',
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
    /Plain AC <!-- aitm-verified-by: `node scripts\/task-tracker\/tests\/evidence-marker-backfill\.test\.mjs` -->/
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
      writeIssueBody: async ({ body: next }) => {
        written = next;
      },
    },
  });
  assert.equal(result.status, 'backfilled');
  assert.match(written, /aitm-verified-by/);
}

console.log('evidence-marker-backfill.test.mjs: all passed');
