#!/usr/bin/env node
// @story #1839
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { qualifyBaseline } from './lib/graphql-usage/baseline.mjs';
try {
  const { values } = parseArgs({
    options: { report: { type: 'string' }, run: { type: 'string' } },
    allowPositionals: false,
  });
  if (!values.report || !values.run)
    throw new TypeError(
      'Usage: node graphql-usage-baseline.mjs --report <report.json> --run <run-manifest.json>'
    );
  const [report, run] = await Promise.all(
    [values.report, values.run].map(async (file) => JSON.parse(await fs.readFile(file, 'utf8')))
  );
  const result = qualifyBaseline(report, run);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'decision-grade-controlled') process.exitCode = 2;
} catch (error) {
  console.error(`graphql-usage-baseline: ${error.message}`);
  process.exitCode = 1;
}
