#!/usr/bin/env node
// @story #1838
// Read-only companion to the explicit measurement launcher. Never enrolls or contacts GitHub.
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { reportUsage } from './lib/graphql-usage/report.mjs';
import { renderUsageMarkdown } from './lib/graphql-usage/report-render.mjs';
try {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      format: { type: 'string', default: 'markdown' },
      start: { type: 'string' },
      end: { type: 'string' },
      'time-zone': { type: 'string', default: 'UTC' },
      declaration: { type: 'string' },
      participants: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help)
    console.log(
      'Usage: node scripts/task-tracker/graphql-usage-report.mjs --root <Git-common>/aitm/graphql-usage [--format markdown|json] [--start UTC --end UTC] [--time-zone UTC] [--declaration JSON] [--participants JSON]'
    );
  else {
    if (!values.root || !['markdown', 'json'].includes(values.format))
      throw new TypeError('root required; format must be markdown or json');
    if (Boolean(values.start) !== Boolean(values.end))
      throw new TypeError('start and end must be supplied together');
    const read = async (file) => (file ? JSON.parse(await fs.readFile(file, 'utf8')) : undefined);
    const declaration = await read(values.declaration),
      participants = await read(values.participants);
    const report = await reportUsage(values.root, {
      startedAt: values.start,
      endedAt: values.end,
      timeZone: values['time-zone'],
      declaration,
      participants,
    });
    console.log(
      values.format === 'json'
        ? JSON.stringify(report, null, 2)
        : renderUsageMarkdown(report).trimEnd()
    );
  }
} catch (error) {
  console.error(`graphql-usage-report: ${error.message}`);
  process.exitCode = 1;
}
