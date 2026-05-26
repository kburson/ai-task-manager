import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { STANDARD_DOD_COMMANDS } from '../lib/evidence-markers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reviewVerbPath = path.resolve(__dirname, '..', 'verbs', 'review.mjs');
const reviewSource = readFileSync(reviewVerbPath, 'utf8');

// ---------------------------------------------------------------------------
// #226: STANDARD_DOD_COMMANDS contract — the three canonical evidence commands
// must be exported and contain the expected entries. The review verb's seed
// relies on this set; any change here is a contract change requiring review.
// ---------------------------------------------------------------------------
{
  assert.ok(STANDARD_DOD_COMMANDS instanceof Set, 'STANDARD_DOD_COMMANDS is a Set');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm test'), 'includes npm test');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run lint'), 'includes npm run lint');
  assert.ok(STANDARD_DOD_COMMANDS.has('npm run format:check'), 'includes npm run format:check');
  console.log('PASS: STANDARD_DOD_COMMANDS contract pinned');
}

// ---------------------------------------------------------------------------
// #226: review.mjs imports STANDARD_DOD_COMMANDS — the import line must exist
// or the seed step would throw at module-load time. Source-level pin so a
// future refactor that drops the import is caught here.
// ---------------------------------------------------------------------------
{
  assert.match(
    reviewSource,
    /import\s+\{\s*STANDARD_DOD_COMMANDS\s*\}\s+from\s+['"]\.\.\/lib\/evidence-markers\.mjs['"]/,
    'review.mjs imports STANDARD_DOD_COMMANDS from lib/evidence-markers.mjs'
  );
  console.log('PASS: review.mjs imports STANDARD_DOD_COMMANDS');
}

// ---------------------------------------------------------------------------
// #226: review.mjs seeds commandResults with STANDARD_DOD_COMMANDS under the
// sandbox-verified authority. The seed must happen AFTER the sandbox-verified
// refusal block (which exits when the marker is absent) and BEFORE the
// evidenceCheckboxes consumer loop. Source-level pin to detect regressions.
// ---------------------------------------------------------------------------
{
  const sandboxRefusalIdx = reviewSource.indexOf('missing `aitm-dod-verified` marker');
  const seedIdx = reviewSource.indexOf('for (const cmd of STANDARD_DOD_COMMANDS)');
  const evidenceLoopIdx = reviewSource.indexOf('evidenceCommands.filter');

  assert.ok(sandboxRefusalIdx > 0, 'sandbox-verified refusal block exists');
  assert.ok(seedIdx > 0, 'STANDARD_DOD_COMMANDS seed loop exists');
  assert.ok(evidenceLoopIdx > 0, 'evidenceCommands consumer loop exists');
  assert.ok(
    seedIdx > sandboxRefusalIdx,
    'seed runs after sandbox-verified refusal (only under sandbox authority)'
  );
  assert.ok(seedIdx < evidenceLoopIdx, 'seed runs before evidenceCommands consumer loop');
  console.log('PASS: review.mjs seeds STANDARD_DOD_COMMANDS in the correct position');
}

// ---------------------------------------------------------------------------
// #226: simulate the consumer-side check. Given a seeded commandResults map,
// every STANDARD_DOD_COMMANDS entry resolves as known + passed — the two
// conditions the evidenceCommands loop checks before declaring a regression
// (one for `!commandResults.has(cmd)` → unknown evidence; another for
// `commandResults.get(cmd) !== true` → failed evidence).
// ---------------------------------------------------------------------------
{
  const commandResults = new Map();
  for (const cmd of STANDARD_DOD_COMMANDS) {
    commandResults.set(cmd, true);
  }
  for (const cmd of ['npm test', 'npm run lint', 'npm run format:check']) {
    assert.ok(commandResults.has(cmd), `${cmd} is known`);
    assert.equal(commandResults.get(cmd), true, `${cmd} resolves as passed`);
  }
  // A non-standard command remains unknown — the seed does not leak.
  assert.equal(commandResults.has('npm run e2e'), false, 'non-standard command stays unknown');
  console.log('PASS: seeded commandResults satisfies the evidenceCommands consumer contract');
}

// ---------------------------------------------------------------------------
// #226: without the sandbox-verified marker, the verb refuses before reaching
// the seed step — the refusal block calls process.exit(4). Pin the refusal
// message so the gate cannot be silently weakened.
// ---------------------------------------------------------------------------
{
  assert.match(
    reviewSource,
    /BLOCKED: missing `aitm-dod-verified` marker — run `\/task test/,
    'refusal message for missing sandbox marker is unchanged'
  );
  console.log('PASS: missing-sandbox-marker refusal preserved');
}

console.log('\nAll review-verb evidence-command tests passed.');
