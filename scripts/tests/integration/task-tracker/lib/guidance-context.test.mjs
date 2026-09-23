// @story #1769
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  buildGuidanceContextReport,
  buildTokenCalibration,
  calibrateTokens,
  measureAgentVisible,
  validatePairedWorkload,
} from '../../../../task-tracker/measure-guidance-context.mjs';
import { buildPairedContext } from '../../../helpers/guidance-paired-context.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

test('projects the same complete ordered lifecycle for both adapters without replacing frozen evidence', () => {
  const captureBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
  );
  const capture = JSON.parse(captureBytes);
  for (const adapter of ['claude', 'codex']) {
    const report = buildPairedContext({ captureBytes, adapter });
    assert.equal(report.eventManifest.length, capture.events.length);
    assert.deepEqual(
      report.eventManifest.map(({ id }) => id),
      capture.events.map(({ name }) => name)
    );
    assert.equal(report.current.trafficCharacters, capture.measurement.traffic.characters);
    assert.ok(report.legacy.categories['command-input'].bytes > 0);
    assert.ok(report.legacy.categories['operational-stdout'].bytes > 0);
    assert.ok(report.legacy.categories['explicit-diagnostics'].bytes > 0);
    assert.ok(report.legacy.categories['repeat-metadata'].bytes > 0);
    assert.equal(report.current.uncountedAgentVisibleBytes, 0);
    assert.equal(report.legacy.uncountedAgentVisibleBytes, 0);
    assert.equal(report.guaranteedReductionFromLegacyStaticAlone, true);
    assert.match(report.legacy.captureKind, /^modeled-/);
    assert.match(report.current.captureKind, /modeled-proposed-static/);
  }
  const altered = structuredClone(capture);
  altered.events = altered.events.filter(({ name }) => name !== 'compaction-reset');
  assert.throws(
    () =>
      buildPairedContext({ captureBytes: Buffer.from(JSON.stringify(altered)), adapter: 'claude' }),
    /missing compaction-reset/
  );
  altered.events = structuredClone(capture.events);
  altered.events[0].name = altered.events[1].name;
  assert.throws(
    () =>
      buildPairedContext({ captureBytes: Buffer.from(JSON.stringify(altered)), adapter: 'claude' }),
    /duplicate event ID/
  );
});

test('committed paired lifecycle report regenerates from exact captured and frozen bytes', async () => {
  const captureBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
  );
  const report = await buildGuidanceContextReport({ captureBytes });
  const saved = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/lifecycle-transcript.json')
  );
  assert.equal(saved.toString(), `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(report.finalInstalledAdapterGate.status, 'pending');
  assert.equal(report.adapters.claude.identities.currentCaptureSha256, digest(captureBytes));
  assert.equal(report.adapters.codex.identities.currentCaptureSha256, digest(captureBytes));
});

test('accounts for every raw event byte with disjoint categories and scoped rounding', () => {
  const report = measureAgentVisible({
    staticFiles: [
      { path: 'adapter.md', text: 'abcde' },
      { path: 'router.md', text: 'fghij' },
    ],
    events: [
      {
        name: 'blocked',
        raw: 'cmdknownreply\nwarning\n',
        parts: [
          { category: 'command-input', text: 'cmd' },
          { category: 'receipt-input', text: 'known' },
          { category: 'operational-stdout', text: 'reply\n' },
          { category: 'operational-stderr', text: 'warning\n' },
        ],
      },
    ],
  });

  assert.equal(report.uncountedAgentVisibleBytes, 0);
  assert.equal(report.staticFiles[0].proxyTokens, 2);
  assert.equal(report.staticFiles[1].proxyTokens, 2);
  assert.equal(report.trafficCharacters, 'cmdknownreply\nwarning\n'.length);
  assert.equal(report.proxyTokens, 4 + Math.ceil(report.trafficCharacters / 4));
  assert.equal(report.bytes, Buffer.byteLength('abcdefghijcmdknownreply\nwarning\n'));
});

test('calibrates named lifecycle boundaries from the preserved public CLI capture', () => {
  const capturePath = path.join(
    ROOT,
    'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json'
  );
  const captureBytes = readFileSync(capturePath);
  const artifact = buildTokenCalibration({ captureBytes });
  assert.equal(artifact.source.sha256, digest(captureBytes));
  assert.equal(artifact.source.captureKind, 'actual-public-cli-with-deterministic-authority');
  assert.deepEqual(
    artifact.calibration.streams.map(({ id }) => id),
    ['clean', 'blocked', 'repeated', 'diagnostic', 'full-lifecycle']
  );
  assert.ok(
    artifact.calibration.streams.every(({ bytes, actualTokens }) => bytes > 0 && actualTokens > 0)
  );
  const changed = Buffer.from(
    captureBytes.toString().replace('ready-first-load', 'wrong-first-load')
  );
  assert.throws(
    () => buildTokenCalibration({ captureBytes: changed }),
    /required.*ready-first-load/
  );
});

test('committed tokenizer calibration regenerates from the exact source capture', () => {
  const captureBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
  );
  const artifactBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/tokenizer-calibration.json')
  );
  assert.equal(
    artifactBytes.toString(),
    `${JSON.stringify(buildTokenCalibration({ captureBytes }), null, 2)}\n`
  );
});

test('calibrates raw streams with a named real encoding and keeps proxy separate', () => {
  const result = calibrateTokens([{ id: 'clean', text: 'hello world' }]);
  assert.deepEqual(result.tokenizer, {
    package: 'js-tiktoken',
    version: '1.0.21',
    encoding: 'o200k_base',
    scope: 'illustrative OpenAI BPE calibration, not universal provider billing',
  });
  assert.equal(result.streams[0].bytes, Buffer.byteLength('hello world'));
  assert.equal(result.streams[0].proxyTokens, Math.ceil('hello world'.length / 4));
  assert.ok(Number.isSafeInteger(result.streams[0].actualTokens));
  assert.ok(result.streams[0].actualTokens > 0);
  assert.equal(
    result.streams[0].ratio,
    result.streams[0].actualTokens / result.streams[0].proxyTokens
  );
});

test('refuses missing or double counted event traffic', () => {
  const base = {
    staticFiles: [{ path: 'adapter.md', text: 'a' }],
    events: [{ name: 'one', raw: 'abc', parts: [{ category: 'command-input', text: 'ab' }] }],
  };
  assert.throws(() => measureAgentVisible(base), /unreconciled.*one/);
  assert.throws(
    () =>
      measureAgentVisible({
        ...base,
        events: [
          {
            name: 'one',
            raw: 'abc',
            parts: [
              { category: 'command-input', text: 'abc' },
              { category: 'receipt-input', text: 'c' },
            ],
          },
        ],
      }),
    /unreconciled.*one/
  );
});

test('requires identical scenario and authority identities on both sides', () => {
  const scenarioBytes = Buffer.from('one shared scenario');
  const authorityBytes = Buffer.from('one shared authority');
  const baseline = {
    scenarioDigest: digest(scenarioBytes),
    authorityFixtureDigest: digest(authorityBytes),
    entries: [{ scenarioId: 'bind-success', action: 'bind', outcome: 'success' }],
  };
  const sources = { scenarioBytes, authorityBytes };
  assert.deepEqual(
    validatePairedWorkload({ baseline, candidate: structuredClone(baseline), ...sources }),
    {
      scenarioDigest: digest(scenarioBytes),
      authorityFixtureDigest: digest(authorityBytes),
      scenarioCount: 1,
    }
  );
  const mismatch = structuredClone(baseline);
  mismatch.entries[0].outcome = 'refusal';
  assert.throws(
    () => validatePairedWorkload({ baseline, candidate: mismatch, ...sources }),
    /scenario.*mismatch/
  );
  mismatch.entries = structuredClone(baseline.entries);
  mismatch.authorityFixtureDigest = 'different';
  assert.throws(
    () => validatePairedWorkload({ baseline, candidate: mismatch, ...sources }),
    /authority.*mismatch/
  );
  assert.throws(
    () =>
      validatePairedWorkload({
        baseline,
        candidate: structuredClone(baseline),
        scenarioBytes: Buffer.from('altered'),
        authorityBytes,
      }),
    /scenario.*mismatch/
  );
});

test('does not pass the frozen 14-scenario baseline against the 24-event recertification', () => {
  const legacy = JSON.parse(
    readFileSync(
      path.join(ROOT, 'scripts/tests/fixtures/1558/legacy-workflow/transcripts/claude.json')
    )
  );
  const current = JSON.parse(
    readFileSync(
      path.join(ROOT, 'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
    )
  );
  const baseline = {
    scenarioDigest: legacy.scenarioSha256,
    authorityFixtureDigest: legacy.authorityFixtureSha256,
    entries: legacy.entries,
  };
  const candidate = {
    scenarioDigest: current.identity.scenarioManifestSha256,
    authorityFixtureDigest: current.identity.initialFixtureSha256,
    entries: current.events,
  };
  const scenarioBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/legacy-workflow/lifecycle-scenarios.json')
  );
  const authorityBytes = readFileSync(
    path.join(ROOT, 'scripts/tests/fixtures/1558/legacy-workflow/authority-store.json')
  );
  assert.throws(
    () => validatePairedWorkload({ baseline, candidate, scenarioBytes, authorityBytes }),
    /scenario.*mismatch/
  );
});
