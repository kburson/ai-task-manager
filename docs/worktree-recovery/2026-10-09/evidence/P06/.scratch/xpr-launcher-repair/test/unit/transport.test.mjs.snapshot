import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { manualTransport } from '../../src/transport/manual.mjs';
import { createTransportRegistry } from '../../src/transport/registry.mjs';
import { createResumeTransport } from '../../src/transport/resume.mjs';
import { executeJoinCommand } from '../helpers/command-roundtrip.mjs';

function resumeFixture(host, command) {
  const workspace = mkdtempSync(path.join(os.tmpdir(), 'apr-resume-'));
  const handleFile = path.join(workspace, 'handoffs', `${host}.json`);
  mkdirSync(path.dirname(handleFile), { recursive: true });
  writeFileSync(
    handleFile,
    `${JSON.stringify({ schema: 'ai-peer-review.resume-handle/v1', host, handle: 'session-123' })}\n`
  );
  return createResumeTransport({ host, command, workspace, scratchHandle: handleFile });
}

test('registry always offers manual and rejects unknown capabilities', () => {
  const registry = createTransportRegistry();
  registry.register(manualTransport);
  assert.equal(registry.resolve('manual').capability, 'manual');
  assert.throws(() => registry.resolve('automatic-required'), {
    code: 'APR_TRANSPORT_UNAVAILABLE',
  });
});

test('registry keeps host-specific resume adapters distinct', () => {
  const registry = createTransportRegistry();
  const codex = resumeFixture('codex', ['codex', 'resume']);
  const claude = resumeFixture('claude', ['claude', '--resume']);
  registry.register(codex);
  registry.register(claude);
  assert.equal(registry.resolve('resume-only', { host: 'codex' }), codex);
  assert.equal(registry.resolve('resume-only', { host: 'claude' }), claude);
  assert.throws(() => registry.resolve('resume-only'), { code: 'APR_TRANSPORT_UNAVAILABLE' });
});

for (const [host, command, expected] of [
  ['codex', ['codex', 'resume'], ['codex', 'resume', 'session-123']],
  ['claude', ['claude', '--resume'], ['claude', '--resume', 'session-123']],
  ['grok', ['grok', 'resume'], ['grok', 'resume', 'session-123']],
]) {
  test(`${host} resume-only validates and invokes the official command`, async () => {
    const transport = resumeFixture(host, command);
    assert.equal(transport.capability, 'resume-only');
    let observed;
    const delivered = await transport.deliver({
      execFile: async (file, args) => {
        observed = [file, ...args];
      },
      invitation: '/repo/invitation.md',
    });
    assert.deepEqual(observed, expected);
    assert.equal(delivered.status, 'delivered');
  });
}

test('invalid and generic resume setup is unavailable', () => {
  assert.throws(() => resumeFixture('generic', ['generic', 'resume']), {
    code: 'APR_TRANSPORT_UNAVAILABLE',
  });
  assert.throws(() => resumeFixture('codex', ['sh', '-c']), {
    code: 'APR_TRANSPORT_UNAVAILABLE',
  });
});

test('resume failure preserves delivery-pending and manual recovery', async () => {
  const transport = resumeFixture('codex', ['codex', 'resume']);
  const result = await transport.deliver({
    execFile: async () => {
      throw new Error('offline');
    },
    invitation: '/repo/invitation.md',
  });
  assert.equal(result.status, 'delivery-pending');
  assert.equal(result.manual.available, true);
  assert.match(result.manual.command, /peer-review join/);
});

test('manual recovery shell-quotes hostile absolute paths', async () => {
  const invitation = "/tmp/review ' `tick` $()/invitation.md";
  const posix = await manualTransport.deliver({ invitation, platform: 'linux' });
  assert.equal(
    posix.manual.command,
    "peer-review join '/tmp/review '\"'\"' `tick` $()/invitation.md'"
  );
  const powershell = await manualTransport.deliver({ invitation, platform: 'win32' });
  assert.equal(
    powershell.manual.command,
    "peer-review join '/tmp/review " + "''" + " `tick` $()/invitation.md'"
  );

  const native = process.platform === 'win32' ? powershell : posix;
  assert.equal(executeJoinCommand(native.manual.command), invitation);
});
