// @story #1769
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEncoding } from 'js-tiktoken';
import { GUIDANCE_CONTEXT_BUDGETS } from './lib/context-budgets.mjs';

const CATEGORIES = new Set([
  'command-input',
  'receipt-input',
  'operational-stdout',
  'operational-stderr',
  'receipt-output',
  'explicit-diagnostics',
  'repeat-metadata',
]);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function calibrateTokens(streams = []) {
  if (!Array.isArray(streams)) throw new TypeError('context: calibration streams must be an array');
  const lock = JSON.parse(
    readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8')
  );
  const version = lock.packages?.['node_modules/js-tiktoken']?.version;
  if (version !== '1.0.21') throw new Error('context: tokenizer lock version drift');
  const encoding = getEncoding('o200k_base');
  return {
    tokenizer: {
      package: 'js-tiktoken',
      version,
      encoding: 'o200k_base',
      scope: 'illustrative OpenAI BPE calibration, not universal provider billing',
    },
    streams: streams.map(({ id, text }) => {
      if (typeof id !== 'string' || !id || typeof text !== 'string') {
        throw new TypeError('context: invalid calibration stream');
      }
      const actualTokens = encoding.encode(text).length;
      const proxyTokens = Math.ceil(text.length / 4);
      return {
        id,
        characters: text.length,
        bytes: Buffer.byteLength(text),
        actualTokens,
        proxyTokens,
        ratio: proxyTokens ? actualTokens / proxyTokens : null,
      };
    }),
  };
}

export function buildTokenCalibration({ captureBytes } = {}) {
  if (!Buffer.isBuffer(captureBytes)) throw new TypeError('context: capture bytes are required');
  const capture = JSON.parse(captureBytes.toString('utf8'));
  if (
    capture.schema !== 'aitm.guidance-lifecycle-capture/v1' ||
    capture.captureKind !== 'actual-public-cli-with-deterministic-authority' ||
    !Array.isArray(capture.events)
  ) {
    throw new TypeError('context: invalid public CLI capture');
  }
  const eventText = (event) => {
    if (
      !Array.isArray(event.argv) ||
      typeof event.stdout !== 'string' ||
      typeof event.stderr !== 'string'
    ) {
      throw new TypeError(`context: invalid captured stream ${event.name}`);
    }
    return `${event.argv.join(' ')}\n${event.stdin ?? ''}${event.stdout}${event.stderr}`;
  };
  const required = [
    ['clean', 'ready-first-load'],
    ['blocked', 'blocked-migration-freeze'],
    ['repeated', 'matching-receipt'],
    ['diagnostic', 'diagnostic'],
  ];
  const streams = required.map(([id, name]) => {
    const matches = capture.events.filter((event) => event.name === name && event.kind === 'query');
    if (matches.length !== 1)
      throw new Error(`context: required event ${name} is missing or duplicated`);
    return { id, text: eventText(matches[0]) };
  });
  const visible = capture.events.filter((event) => event.kind !== 'transition');
  streams.push({ id: 'full-lifecycle', text: visible.map(eventText).join('') });
  return {
    schema: 'aitm.guidance-tokenizer-calibration/v1',
    source: {
      captureKind: capture.captureKind,
      sha256: sha256(captureBytes),
      sourceCommit: capture.identity?.sourceCommit ?? null,
      scenarioManifestSha256: capture.identity?.scenarioManifestSha256 ?? null,
    },
    calibration: calibrateTokens(streams),
  };
}

export function validatePairedWorkload({
  baseline,
  candidate,
  scenarioBytes,
  authorityBytes,
} = {}) {
  if (!baseline || !candidate) throw new TypeError('context: two workloads are required');
  if (
    !Buffer.isBuffer(scenarioBytes) ||
    !baseline.scenarioDigest ||
    baseline.scenarioDigest !== sha256(scenarioBytes) ||
    baseline.scenarioDigest !== candidate.scenarioDigest
  ) {
    throw new Error('context: scenario digest mismatch');
  }
  if (
    !Buffer.isBuffer(authorityBytes) ||
    !baseline.authorityFixtureDigest ||
    baseline.authorityFixtureDigest !== sha256(authorityBytes) ||
    baseline.authorityFixtureDigest !== candidate.authorityFixtureDigest
  ) {
    throw new Error('context: authority fixture digest mismatch');
  }
  if (!Array.isArray(baseline.entries) || !Array.isArray(candidate.entries)) {
    throw new TypeError('context: ordered scenario entries are required');
  }
  const scenarioKeys = (entries) =>
    entries.map(({ scenarioId, action, outcome }) => [scenarioId, action, outcome]);
  if (
    baseline.entries.length === 0 ||
    JSON.stringify(scenarioKeys(baseline.entries)) !==
      JSON.stringify(scenarioKeys(candidate.entries))
  ) {
    throw new Error('context: scenario order or outcome mismatch');
  }
  return {
    scenarioDigest: baseline.scenarioDigest,
    authorityFixtureDigest: baseline.authorityFixtureDigest,
    scenarioCount: baseline.entries.length,
  };
}

function measure(text) {
  return { characters: text.length, bytes: Buffer.byteLength(text, 'utf8') };
}

export function measureAgentVisible({ staticFiles = [], events = [] } = {}) {
  if (!Array.isArray(staticFiles) || !Array.isArray(events)) {
    throw new TypeError('context: staticFiles and events must be arrays');
  }
  const seen = new Set();
  const measuredFiles = staticFiles.map(({ path, text }) => {
    if (typeof path !== 'string' || !path || seen.has(path) || typeof text !== 'string') {
      throw new TypeError('context: invalid or duplicate static file');
    }
    seen.add(path);
    const counts = measure(text);
    return { path, ...counts, proxyTokens: Math.ceil(counts.characters / 4) };
  });
  const categoryText = new Map();
  let trafficCharacters = 0;
  let trafficBytes = 0;
  for (const event of events) {
    if (!event || typeof event.name !== 'string' || typeof event.raw !== 'string') {
      throw new TypeError('context: invalid event');
    }
    if (!Array.isArray(event.parts))
      throw new TypeError(`context: missing parts for ${event.name}`);
    let accounted = '';
    for (const part of event.parts) {
      if (!CATEGORIES.has(part?.category) || typeof part.text !== 'string') {
        throw new TypeError(`context: invalid category for ${event.name}`);
      }
      accounted += part.text;
      categoryText.set(part.category, (categoryText.get(part.category) || '') + part.text);
    }
    if (accounted !== event.raw)
      throw new Error(`context: unreconciled raw traffic for ${event.name}`);
    const counts = measure(event.raw);
    trafficCharacters += counts.characters;
    trafficBytes += counts.bytes;
  }
  const categories = Object.fromEntries(
    [...categoryText].map(([category, text]) => [category, measure(text)])
  );
  const staticCharacters = measuredFiles.reduce((sum, file) => sum + file.characters, 0);
  const staticBytes = measuredFiles.reduce((sum, file) => sum + file.bytes, 0);
  return {
    staticFiles: measuredFiles,
    categories,
    staticCharacters,
    trafficCharacters,
    characters: staticCharacters + trafficCharacters,
    bytes: staticBytes + trafficBytes,
    proxyTokens:
      measuredFiles.reduce((sum, file) => sum + file.proxyTokens, 0) +
      Math.ceil(trafficCharacters / 4),
    uncountedAgentVisibleBytes: 0,
    fixedBudgets: GUIDANCE_CONTEXT_BUDGETS,
  };
}

export async function buildGuidanceContextReport({ captureBytes } = {}) {
  if (!Buffer.isBuffer(captureBytes)) throw new TypeError('context: capture bytes are required');
  const { buildPairedContext } = await import('../tests/helpers/guidance-paired-context.mjs');
  const adapters = Object.fromEntries(
    ['claude', 'codex'].map((adapter) => [adapter, buildPairedContext({ captureBytes, adapter })])
  );
  return {
    schema: 'aitm.guidance-context-report/v1',
    classification: 'pre-slim-captured-cli-and-modeled-static',
    adapters,
    tokenizerCalibration: buildTokenCalibration({ captureBytes }),
    finalInstalledAdapterGate: {
      status: 'pending',
      reason:
        'Current proposed static text is modeled; #1678 must capture final installed adapter bytes.',
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    !args.includes('--all') ||
    args.some((arg) => !['--all', '--json', '--assert-budgets'].includes(arg))
  ) {
    process.stderr.write('Usage: measure-guidance-context.mjs --all [--json] [--assert-budgets]\n');
    process.exitCode = 2;
    return;
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const captureBytes = readFileSync(
    path.join(root, 'scripts/tests/fixtures/1558/actual-explain-traffic-recertification.json')
  );
  const report = await buildGuidanceContextReport({ captureBytes });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (args.includes('--assert-budgets')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
