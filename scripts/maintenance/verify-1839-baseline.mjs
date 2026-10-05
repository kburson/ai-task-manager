// @story #1839
// Saved-artifact verification survives deletion of every disposable resource.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { qualifySavedEvidence } from '../task-tracker/lib/graphql-usage/evidence.mjs';
const directory =
  process.argv[2] || fileURLToPath(new URL('../../docs/reports/2026-10-05-1839/', import.meta.url));
try {
  const names = ['report', 'run', 'declaration', 'preflight', 'smoke'];
  const evidence = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        JSON.parse(await fs.readFile(directory + '/' + name + '.json', 'utf8')),
      ])
    )
  );
  const result = qualifySavedEvidence(evidence);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'decision-grade-controlled') process.exitCode = 2;
} catch (error) {
  console.error('verify-1839-baseline: ' + error.message);
  process.exitCode = 1;
}
