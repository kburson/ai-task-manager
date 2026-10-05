#!/usr/bin/env node
// @story #1837
import { spawn } from 'node:child_process';
import { prepareUsageEnv } from './lib/graphql-usage/collection.mjs';
const [command, ...args] = process.argv.slice(2);
if (!command) {
  process.stderr.write('Usage: node graphql-usage-launch.mjs <command> [args...]\n');
  process.exitCode = 2;
} else {
  const env = await prepareUsageEnv({
    env: { ...process.env, AITM_GRAPHQL_USAGE: process.env.AITM_GRAPHQL_USAGE || '1' },
    launchRoute: 'measurement-launcher',
  });
  const child = spawn(command, args, { env, stdio: 'inherit' });
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  const handlers = signals.map((signal) => {
    const handler = () => child.kill(signal);
    process.on(signal, handler);
    return [signal, handler];
  });
  child.on('error', () => {
    process.exitCode = 1;
  });
  child.on('close', (code, signal) => {
    for (const [name, handler] of handlers) process.removeListener(name, handler);
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = Number.isInteger(code) ? code : 1;
  });
}
