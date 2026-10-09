// @story #1919
// Qualify retained repairs through complete original native cases. Each profile
// runs in its own processes and fixture roots, so HOME/session/cwd stay isolated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashRevisionValue } from '../../../../task-tracker/lib/criteria-revision/schema.mjs';

const repository = fileURLToPath(new URL('../../../../..', import.meta.url));
const originalBudgetMs = 600_000;

async function qualify(files, { timezone, minimumTests }, t) {
  const paths = files.map((file) => fileURLToPath(new URL(file, import.meta.url)));
  // Node discovery can silently omit a missing path when another path exists.
  // Verify every input before invoking its complete, unfiltered cases.
  for (const file of paths) assert.ok(statSync(file).isFile(), `Missing owned verifier: ${file}`);
  const env = { ...process.env, TZ: timezone, AITM_NATIVE_STAGE_EXPECTED_TZ: timezone };
  delete env.NODE_TEST_CONTEXT;
  const result = await new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--test', '--test-concurrency=1', '--test-reporter=tap', ...paths],
      { cwd: repository, env, encoding: 'utf8', timeout: originalBudgetMs },
      (error, stdout, stderr) => resolve({ error, stdout, stderr })
    );
  });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  t.diagnostic(output);
  // execFile reports nonzero exit, signal, spawn and unchanged-budget timeout
  // failures through error; none can be accepted as successful qualification.
  assert.ifError(result.error);
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
  'retained checkpoint profiles qualify in independent native contexts',
  { timeout: originalBudgetMs, concurrency: true },
  async (t) => {
    // No profile shares mutation roots or process globals with another. Await
    // every complete profile; overlap removes serial waiting, not assertions.
    await Promise.all([
      t.test(
        'UTC phase publication and original actor arithmetic retain strict raw-zero refusal',
        { timeout: originalBudgetMs },
        async (child) => {
          assert.match(hashRevisionValue({ offsetMin: 0 }), /^sha256:[0-9a-f]{64}$/);
          assert.throws(() => hashRevisionValue({ offsetMin: -0 }), {
            name: 'TypeError',
            message: 'canonical-json:invalid:number',
          });
          await qualify(
            ['./native-actor-candidate-capture.test.mjs'],
            { timezone: 'UTC', minimumTests: 6 },
            child
          );
        }
      ),
      t.test(
        'Chicago control reaches the same original phase-11 intent without timezone substitution',
        { timeout: originalBudgetMs },
        async (child) => {
          // Original phase case, because the UTC wrapper fixes its own timezone.
          await qualify(
            ['./native-stage-phase-11-prefix-after-intent-write.test.mjs'],
            { timezone: 'America/Chicago', minimumTests: 1 },
            child
          );
        }
      ),
      t.test(
        'complete linked-source cases preserve original restart, current-source and admission behavior',
        { timeout: originalBudgetMs },
        async (child) => {
          await qualify(
            [
              './native-linked-plan-source.test.mjs',
              './native-linked-plan-source-transaction.test.mjs',
            ],
            { timezone: 'UTC', minimumTests: 23 },
            child
          );
        }
      ),
    ]);
  }
);
