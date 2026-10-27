#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import { AprError } from '../src/errors.mjs';
import { runHandoffMcpStdio } from '../src/cli/run.mjs';

try {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  await runHandoffMcpStdio({
    repositoryRoot: process.cwd(),
    version: packageJson.version,
  });
} catch (cause) {
  const error =
    cause instanceof AprError
      ? cause
      : new AprError('APR_INTERNAL', 'The peer-review MCP server could not start.', {
          recovery: 'Run peer-review doctor --mode automatic-required and repair every failed row.',
        });
  process.stderr.write(`${JSON.stringify(error.toJSON())}\n`);
  process.exitCode = error.exitCode;
}
