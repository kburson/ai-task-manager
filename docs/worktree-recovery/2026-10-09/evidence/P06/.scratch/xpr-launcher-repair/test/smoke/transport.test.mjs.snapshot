import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { setup } from '../../src/config/setup.mjs';
import { doctor } from '../../src/doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('Phase 2 setup installs a runnable package MCP entrypoint and keeps generic manual', (t) => {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'apr-transport-smoke-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const project = path.join(fixture, 'project');
  const home = path.join(fixture, 'home');
  mkdirSync(path.join(project, '.git/info'), { recursive: true });
  mkdirSync(home);
  writeFileSync(path.join(project, '.git/info/exclude'), '.scratch/peer-review/\n');

  setup({
    scope: 'project',
    agents: ['codex', 'generic'],
    cwd: project,
    home,
    gitExcludePath: path.join(project, '.git/info/exclude'),
  });

  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const config = JSON.parse(readFileSync(path.join(project, '.ai-peer-review.json'), 'utf8'));
  const codex = JSON.parse(readFileSync(path.join(project, '.codex/config.json'), 'utf8'));
  const generic = JSON.parse(readFileSync(path.join(project, '.agents/config.json'), 'utf8'));
  assert.equal(packageJson.bin['peer-review-mcp'], './bin/peer-review-mcp.mjs');
  assert.equal(existsSync(path.join(root, packageJson.bin['peer-review-mcp'])), true);
  assert.deepEqual(config.hosts.codex.automatic, {
    adapter_version: '2.0.0',
    capability: 'live-wait',
    server_command: ['peer-review-mcp'],
    tool_timeout_ms: 28_800_000,
    heartbeat_interval_ms: 15_000,
    lease_ttl_ms: 60_000,
  });
  assert.equal(codex.ai_peer_review.transport, 'live-wait');
  assert.equal(generic.ai_peer_review.transport, 'manual');
  assert.equal(config.hosts.generic?.automatic, undefined);
});

test('Phase 2 automatic doctor is healthy only with every live opt-in signal', () => {
  const report = doctor({
    requestedMode: 'automatic-required',
    packageResolved: true,
    skillAvailable: true,
    identity: { identity_source: 'runtime', session_fingerprint: 'sha256:smoke' },
    git: { repository: true, worktreeSafe: true, scratchIgnored: true },
    authority: { authority_policy: 'unavailable', verifier: null },
    transport: { mode: 'automatic-required', healthy: true },
    phaseTwo: {
      mcp: { healthy: true, adapter_version: '2.0.0' },
      resident: { healthy: true, reason: 'ok' },
      timeout: { healthy: true, milliseconds: 28_800_000 },
      automatic: { healthy: true, reason: 'round-trip-ok' },
    },
  });
  assert.equal(report.healthy, true);
  assert.equal(
    report.rows.every((row) => !row.required || row.status !== 'unavailable'),
    true
  );
});
