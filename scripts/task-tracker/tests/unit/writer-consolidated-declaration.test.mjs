#!/usr/bin/env node
// @story #419
// cspell:ignore tmpl backticked
// #419/#468 — the three declaration WRITERS emit only the consolidated
// `aitm-verified cmd="…"` form. This test pins both halves of the contract:
//   (a) WRITE: each flipped writer emits the consolidated declaration, never the
//       legacy `aitm-verified-by:` form.
//   (b) READ: #468 retired the legacy reader arm. Legacy markers are silently
//       ignored; consolidated form is the sole recognized declaration syntax.
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildEvidenceBackfill, parseEvidenceChecklist } from '../../lib/evidence-markers.mjs';
import { healFunctionalSection } from '../../heal-functional-dod.mjs';
import { extractVerifiedCommands } from '../../lib/proof-marker.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');

const CONSOLIDATED_RE = /<!--\s*aitm-verified\s+cmd="/;
const LEGACY_RE = /aitm-verified-by:/;

// --- (a) WRITERS emit consolidated form ------------------------------------

// Writer #1: the DoD template file.
{
  const tmpl = readFileSync(path.join(repoRoot, 'templates', 'definition-of-done.md'), 'utf8');
  assert.match(tmpl, /aitm-verified cmd="`npm run test:all`"/, 'template tests line consolidated');
  assert.match(
    tmpl,
    /aitm-verified cmd="`npm run lint` `npm run format:check`"/,
    'template lint line consolidated (one cmd, both commands backticked)'
  );
  assert.match(tmpl, /aitm-verified cmd="`git log --oneline -1`"/, 'template commits consolidated');
  assert.ok(!LEGACY_RE.test(tmpl), 'template carries no legacy aitm-verified-by writer marker');
}

// Writer #2: heal-functional-dod re-seed. Healing a stale (unkeyed) section
// must emit the consolidated form on the three command-backed lines.
{
  const stale = [
    '#### Functional (verified at Test)',
    '',
    '- [ ] All automated tests pass',
    '- [ ] Lint and format checks pass',
    '- [ ] All changes committed',
    '- [ ] Acceptance criteria met',
    '- [ ] Issue body checkboxes ticked',
    '',
  ].join('\n');
  const { body, changed } = healFunctionalSection(stale);
  assert.equal(changed, true, 'stale section is healed');
  assert.match(body, /aitm-verified cmd="`npm run test:all`"/, 'heal re-seeds consolidated tests');
  assert.match(
    body,
    /aitm-verified cmd="`npm run lint` `npm run format:check`"/,
    'heal re-seeds consolidated lint'
  );
  assert.ok(!LEGACY_RE.test(body), 'heal emits no legacy writer marker');
}

// Writer #3: evidence-markers buildMarker (exercised via buildEvidenceBackfill).
{
  const body = ['## Acceptance Criteria', '', '- [ ] Plain AC', ''].join('\n');
  const res = buildEvidenceBackfill(body, { mappings: { 'Plain AC': ['npm test'] } });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.match(res.body, CONSOLIDATED_RE, 'backfill writer emits consolidated declaration');
  assert.ok(!LEGACY_RE.test(res.body), 'backfill writer emits no legacy marker');
}

// --- (b) READ: #468 retired legacy form — consolidated is the sole declaration
{
  const CMD = 'npm run test:all';
  const legacy = `<!-- aitm-verified-by: \`${CMD}\` -->`;
  const consolidated = `<!-- aitm-verified cmd="\`${CMD}\`" -->`;

  // Shared low-level reader: legacy form no longer recognized.
  assert.deepEqual(
    extractVerifiedCommands(`item ${legacy}`),
    [],
    'extractVerifiedCommands ignores legacy aitm-verified-by: form after #468'
  );
  assert.deepEqual(
    extractVerifiedCommands(`item ${consolidated}`),
    [CMD],
    'extractVerifiedCommands reads consolidated declaration'
  );

  // Evidence-checklist reader (backs the review-preflight evidence audit).
  function acCommands(marker) {
    const b = ['## Acceptance Criteria', '', `- [ ] holds ${marker}`, ''].join('\n');
    const { acceptanceCriteria } = parseEvidenceChecklist(b);
    return acceptanceCriteria[0].evidenceCommands;
  }
  assert.deepEqual(acCommands(legacy), [], 'legacy-declared AC yields no commands after #468');
  assert.deepEqual(acCommands(consolidated), [CMD], 'consolidated-declared AC still yields command');
}

console.log('writer-consolidated-declaration.test.mjs: OK');
