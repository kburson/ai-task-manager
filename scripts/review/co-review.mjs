#!/usr/bin/env node
// @story #1266

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { helpRequest, renderHelp } from './lib/help.mjs';

export async function runCli(argv = process.argv.slice(2), io = {}) {
  const writeOut = io.stdout ?? ((value) => process.stdout.write(value));
  const writeError = io.stderr ?? ((value) => process.stderr.write(value));
  const help = helpRequest(argv);
  if (help.requested) {
    writeOut(renderHelp(help.command));
    return 0;
  }
  writeError(
    'co-review:not-implemented; no state changed; next: run `npx aitm co-review --help`\n'
  );
  return 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exitCode = await runCli();
