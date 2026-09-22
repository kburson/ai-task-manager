// @story #1675
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const capture = JSON.parse(
  readFileSync(path.join(root, 'scripts/tests/fixtures/1558/actual-explain-traffic.json'))
);
const sha256 = (file) =>
  `sha256:${createHash('sha256')
    .update(readFileSync(path.join(root, file)))
    .digest('hex')}`;

test('actual explanation evidence is public subprocess traffic with stable identities', () => {
  assert.equal(capture.schema, 'aitm.guidance-actual-cli-capture/v1');
  assert.equal(capture.captureKind, 'actual-public-cli-subprocess');
  assert.equal(sha256(capture.identity.runnerPath), capture.identity.runnerSha256);
  assert.equal(sha256(capture.identity.guidancePath), capture.identity.guidanceSha256);
  assert.match(capture.identity.sourceCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(
    capture.scenarios.map(({ name }) => name),
    [
      'blocked-first-load',
      'matching-receipt',
      'compaction-reset',
      'diagnostic',
      'terminal',
      'unknown-action',
      'authority-unavailable',
    ]
  );
  for (const scenario of capture.scenarios) {
    assert.ok(Array.isArray(scenario.argv) && scenario.argv.includes('bin/aitm.mjs'));
    assert.equal(scenario.stdin, '');
    assert.equal(scenario.stderr, '');
    assert.equal(scenario.exitCode, 0);
    const parsed = JSON.parse(scenario.stdout);
    assert.equal(parsed.schema, scenario.typed.schema);
    assert.equal(parsed.result.status, scenario.typed.status);
    assert.equal(parsed.result.actionId, scenario.typed.actionId);
    assert.deepEqual(
      parsed.guidance.map(({ id }) => id),
      scenario.typed.guidanceIds
    );
    assert.deepEqual(
      parsed.guidance.map(({ status }) => status),
      scenario.typed.guidanceStatuses
    );
    assert.equal(Math.ceil(Buffer.byteLength(scenario.stdout) / 4), scenario.proxyTokens);
  }
});

test('actual traffic plus separately modeled static text remains inside fixed budgets', () => {
  const { measurement } = capture;
  assert.equal(
    measurement.actualTrafficProxyTokens,
    capture.scenarios.reduce((total, scenario) => total + scenario.proxyTokens, 0)
  );
  for (const provider of ['claude', 'codex']) {
    assert.equal(
      measurement.modeledTotalsWithActualTraffic[provider],
      measurement.modeledProposedStaticProxyTokens[provider] + measurement.actualTrafficProxyTokens
    );
    assert.ok(
      measurement.modeledProposedStaticProxyTokens[provider] <=
        measurement.budgets.routerPlusPickupWorking
    );
    assert.ok(
      measurement.modeledTotalsWithActualTraffic[provider] <=
        measurement.budgets.fullLifecycleWorking
    );
    assert.ok(
      measurement.modeledTotalsWithActualTraffic[provider] <
        measurement.currentFullStaticProxyTokens[provider]
    );
  }
  assert.ok(
    capture.scenarios.find(({ name }) => name === 'terminal').proxyTokens <=
      measurement.budgets.cleanResponseWorking
  );
  assert.ok(
    capture.scenarios.find(({ name }) => name === 'blocked-first-load').proxyTokens <=
      measurement.budgets.blockedResponseWorking
  );
  assert.deepEqual(measurement.verdicts, {
    routerPlusPickup: { claude: true, codex: true },
    fullLifecycle: { claude: true, codex: true },
    cleanResponse: true,
    blockedResponse: true,
    improvesCurrentFull: { claude: true, codex: true },
  });
});
