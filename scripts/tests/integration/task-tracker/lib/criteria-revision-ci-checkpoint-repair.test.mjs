// @story #1919
// Qualify the retained repairs through complete original native cases. Separate
// processes preserve each file's mutable HOME/session/cwd and module isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashRevisionValue } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

const repository = fileURLToPath(new URL('../../../../..', import.meta.url));
const originalBudgetMs = 600_000;

function qualify(files, { timezone, minimumTests }, t) {
  const paths = files.map((file) => fileURLToPath(new URL(file, import.meta.url)));
  // Node discovery can silently omit a missing path when another path exists.
  // Verify each owned input before invoking its complete, unfiltered cases.
  for (const file of paths) assert.ok(statSync(file).isFile(), `Missing owned verifier: ${file}`);
  const env = { ...process.env, TZ: timezone, AITM_NATIVE_STAGE_EXPECTED_TZ: timezone };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', '--test-reporter=tap', ...paths],
    {
      cwd: repository,
      env,
      encoding: 'utf8',
      timeout: originalBudgetMs,
    }
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  t.diagnostic(output);
  assert.ifError(result.error);
  assert.equal(result.signal, null, 'Owned qualification must finish within its original budget');
  assert.equal(result.status, 0, 'Original native qualification cases must pass');
  const count = Number(result.stdout.match(/^# tests (\d+)\s*$/m)?.[1]);
  assert.ok(
    Number.isInteger(count) && count >= minimumTests,
    'No empty or partial owned selection'
  );
  if (
    files.some(
      (file) => file.includes('native-actor-candidate') || file.includes('native-stage-phase')
    )
  )
    assert.ok(
      result.stdout.includes('executing native timezone: ' + timezone),
      'Original executing native case confirms timezone'
    );
  assert.match(result.stdout, /^# fail 0\s*$/m);
  assert.match(result.stdout, /^# cancelled 0\s*$/m);
  assert.match(result.stdout, /^# skipped 0\s*$/m);
}

test(
  'UTC phase publication and original actor arithmetic retain strict raw-zero refusal',
  { timeout: originalBudgetMs },
  (t) => {
    assert.match(hashRevisionValue({ offsetMin: 0 }), /^sha256:[0-9a-f]{64}$/);
    assert.throws(() => hashRevisionValue({ offsetMin: -0 }), {
      name: 'TypeError',
      message: 'canonical-json:invalid:number',
    });
    qualify(['./native-actor-candidate-capture.test.mjs'], { timezone: 'UTC', minimumTests: 6 }, t);
  }
);

test(
  'Chicago control reaches the same original phase-11 intent without timezone substitution',
  { timeout: originalBudgetMs },
  (t) => {
    // Call the original phase case directly; the UTC wrapper intentionally
    // fixes its nested process to UTC and cannot provide this control.
    qualify(
      ['./native-stage-phase-11-prefix-after-intent-write.test.mjs'],
      { timezone: 'America/Chicago', minimumTests: 1 },
      t
    );
  }
);

test(
  'complete linked-source cases preserve original restart, current-source and admission behavior',
  { timeout: originalBudgetMs },
  (t) => {
    qualify(
      ['./native-linked-plan-source.test.mjs', './native-linked-plan-source-transaction.test.mjs'],
      { timezone: 'UTC', minimumTests: 23 },
      t
    );
  }
);
