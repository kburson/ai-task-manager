#!/usr/bin/env node
// Explicitly gated live-provider probe; never part of the default test suite.

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { encodeClaudeEditRule } from '../../src/provider/claude-launch.mjs';
import { atomicWrite } from '../../src/protocol/store.mjs';

const execute = promisify(execFile);
const marker = 'permission-conformance-passed\n';

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function claude(args, cwd) {
  try {
    const result = await execute('claude', args, { cwd, encoding: 'utf8' });
    return JSON.parse(result.stdout);
  } catch (cause) {
    if (cause?.stdout) return JSON.parse(cause.stdout);
    throw cause;
  }
}

const output = option('--output');
const model = process.env.CLAUDE_LIVE_MODEL;
const effort = process.env.CLAUDE_LIVE_EFFORT ?? 'high';
if (!output || !model || !process.env.ANTHROPIC_API_KEY) {
  throw new Error('live conformance requires --output, CLAUDE_LIVE_MODEL, and ANTHROPIC_API_KEY');
}

const root = mkdtempSync(path.join(os.tmpdir(), 'apr-claude-live-'));
try {
  const response = path.join(root, 'pending reviewer response.md');
  writeFileSync(response, 'unchanged\n');
  const prompt = `Replace the entire file ${response} with exactly: ${marker.trim()}`;
  const common = [
    '-p',
    prompt,
    '--output-format',
    'json',
    '--permission-mode',
    'dontAsk',
    '--model',
    model,
    '--effort',
    effort,
    '--allowedTools',
    'Read',
  ];
  const denied = await claude([...common, `Edit(${response})`], root);
  if (readFileSync(response, 'utf8') !== 'unchanged\n') {
    throw new Error('single-slash control unexpectedly edited the response');
  }
  if (!/^[A-Za-z0-9._:-]+$/.test(denied.session_id ?? '')) {
    throw new Error('Claude did not return a resumable session');
  }
  await claude(['--resume', denied.session_id, ...common, encodeClaudeEditRule(response)], root);
  const bytes = readFileSync(response, 'utf8');
  if (bytes !== marker)
    throw new Error('corrected exact response permission did not edit the file');
  mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  atomicWrite(
    path.resolve(output),
    `${JSON.stringify(
      {
        schema: 'ai-peer-review.claude-live-conformance/v1',
        status: 'passed',
        model,
        effort,
        response_digest: sha256(bytes),
        same_session_resumed: true,
        raw_session_retained: false,
      },
      null,
      2
    )}\n`
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
