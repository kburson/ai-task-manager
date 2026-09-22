// @story #1675
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measureProposedStatic } from '../../../../maintenance/capture-guidance-explain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const capture = JSON.parse(
  readFileSync(path.join(root, 'scripts/tests/fixtures/1558/actual-explain-traffic.json'))
);
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const atCommit = (commit, file) =>
  execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, encoding: null });

test('actual explanation evidence is public subprocess traffic anchored to one source commit', () => {
  assert.equal(capture.schema, 'aitm.guidance-actual-cli-capture/v2');
  assert.equal(capture.captureKind, 'actual-public-cli-subprocess');
  assert.match(capture.identity.sourceCommit, /^[a-f0-9]{40}$/);
  for (const file of capture.identity.implementationFiles) {
    assert.equal(
      sha256(atCommit(capture.identity.sourceCommit, file.path)),
      file.sha256,
      `${file.path} must be reproducible from the declared source commit`
    );
  }
  assert.deepEqual(
    capture.scenarios.map(({ name }) => name),
    [
      'ready-first-load',
      'matching-receipt',
      'compaction-reset',
      'blocked-authority-drift',
      'diagnostic',
      'agent-change',
      'source-only-change',
    ]
  );
  for (const scenario of capture.scenarios) {
    assert.ok(
      Array.isArray(scenario.argv) && scenario.argv.some((value) => value.endsWith('/bin/aitm.mjs'))
    );
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
    assert.equal(parsed.sourceReceipt ?? null, scenario.typed.sourceReceipt);
    assert.equal(scenario.remoteAuthorityReads, 4);
    assert.equal(Math.ceil(Buffer.byteLength(scenario.stdout) / 4), scenario.proxyTokens);
  }
  const diagnostic = JSON.parse(capture.scenarios.find(({ name }) => name === 'diagnostic').stdout);
  assert.equal(diagnostic.fullDecision.snapshot.observations.length, 7);
  assert.equal(
    capture.scenarios.find(({ name }) => name === 'ready-first-load').typed.status,
    'ready'
  );
  assert.equal(
    capture.scenarios.find(({ name }) => name === 'agent-change').typed.guidanceStatuses[0],
    'expanded'
  );
  assert.equal(
    capture.scenarios.find(({ name }) => name === 'source-only-change').typed.guidanceStatuses[0],
    'not-modified'
  );
});

test('actual traffic plus separately modeled static text remains inside fixed budgets', () => {
  const { measurement } = capture;
  const trafficText = capture.scenarios
    .map((scenario) => `${scenario.argv.join(' ')}\n${scenario.stdout}${scenario.stderr}`)
    .join('');
  assert.deepEqual(measurement.actualTraffic, {
    characters: trafficText.length,
    bytes: Buffer.byteLength(trafficText),
    proxyTokens: Math.ceil(trafficText.length / 4),
  });
  const comparison = JSON.parse(
    readFileSync(path.join(root, measurement.currentFullStaticSource), 'utf8')
  );
  assert.equal(
    measurement.currentFullStaticProxyTokens.claude,
    comparison.adapters.claude.legacy.static.totals.proxyTokens
  );
  assert.equal(
    measurement.currentFullStaticProxyTokens.codex,
    comparison.adapters.codex.legacy.static.totals.proxyTokens
  );
  for (const provider of ['claude', 'codex']) {
    assert.deepEqual(measurement.modeledProposedStatic[provider], measureProposedStatic(provider));
    assert.equal(
      measurement.modeledTotalsWithActualTraffic[provider],
      measurement.modeledProposedStatic[provider].totals.proxyTokens +
        measurement.actualTraffic.proxyTokens
    );
    assert.ok(
      measurement.modeledProposedStatic[provider].totals.proxyTokens <=
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
    capture.scenarios.find(({ name }) => name === 'ready-first-load').proxyTokens <=
      measurement.budgets.cleanResponseWorking
  );
  assert.ok(
    capture.scenarios.find(({ name }) => name === 'blocked-authority-drift').proxyTokens <=
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
