// @story #1769
// Project frozen Markdown and CLI text over the #1767 event order. This is a
// cost model, not a replay of the historical commands on modern authority.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  measureAgentVisible,
  validatePairedWorkload,
} from '../../task-tracker/measure-guidance-context.mjs';
import { GUIDANCE_CONTEXT_BUDGETS } from '../../task-tracker/lib/context-budgets.mjs';
import { validateLifecycleTranscript } from '../../maintenance/capture-guidance-lifecycle.mjs';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const FIXTURES = 'scripts/tests/fixtures/1558';
const PINNED_CAPTURE_SHA256 =
  'sha256:b22d77cbd4d1ea589f71b0079724f64154e6ee9c5baf1462ac0a54affe944fc4';
const PINNED_SCENARIO_MANIFEST_SHA256 =
  'sha256:b55639f9992f4f8ee99e3255120453185b49479df0249b655f7953d6ff305818';
const digest = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const read = (relative) => readFileSync(path.join(ROOT, relative));

function verdict(value, { absolute, working }) {
  return {
    proxyTokens: value,
    absolute,
    working,
    absolutePass: value <= absolute,
    workingPass: value <= working,
    workingHeadroomPercent: Number((((working - value) / working) * 100).toFixed(2)),
  };
}

function actionOf(event) {
  const index = event.argv?.indexOf('--action');
  return index < 0 || index === undefined ? null : event.argv[index + 1];
}

function statusOf(event) {
  if (event.kind !== 'query') return null;
  const parsed = JSON.parse(event.stdout);
  return parsed.result?.status ?? null;
}

function commandText(event) {
  if (!Array.isArray(event.argv) || typeof event.stdin !== 'string') {
    throw new Error(`paired context: missing command input for ${event.name}`);
  }
  // The original capture's printable command is its argv joined by spaces.
  return `${event.argv.join(' ')}\n${event.stdin}`;
}

function capturedParts(event) {
  const input = commandText(event);
  const receipt = event.argv.includes('--known');
  const diagnostic = event.argv.includes('--diagnostic');
  const guidance = event.kind === 'query' ? JSON.parse(event.stdout).guidance : null;
  const suppressed =
    receipt &&
    Array.isArray(guidance) &&
    guidance.length > 0 &&
    guidance.every(({ status }) => status === 'not-modified');
  return [
    { category: receipt ? 'receipt-input' : 'command-input', text: input },
    {
      category: diagnostic
        ? 'explicit-diagnostics'
        : suppressed
          ? 'receipt-output'
          : 'operational-stdout',
      text: event.stdout,
    },
    { category: 'operational-stderr', text: event.stderr },
  ];
}

function modelLegacyEvent(event, frozenEntries, loadedText) {
  const action = actionOf(event);
  const currentStatus = statusOf(event);
  const outcome = currentStatus === 'blocked' ? 'refusal' : 'success';
  const match = action
    ? frozenEntries.find((entry) => entry.action === action && entry.outcome === outcome)
    : null;
  if (event.kind === 'query' && !match) {
    throw new Error(`paired context: no frozen legacy ${action}/${outcome} sample`);
  }
  const parts = match
    ? [
        {
          category: 'command-input',
          text: `${match.command.executable} ${match.command.argv.join(' ')}\n${match.command.stdin}`,
        },
        { category: 'operational-stdout', text: match.stdout },
        { category: 'operational-stderr', text: match.stderr },
      ]
    : capturedParts(event);
  if (event.name === 'matching-receipt' || event.name === 'compaction-reset') {
    // The legacy workflow had no matching-receipt suppression. Model a new
    // full instruction load for the repeated/compacted request.
    parts.push({
      category: 'repeat-metadata',
      text: loadedText.map(({ text }) => text).join(''),
    });
  }
  if (event.name === 'diagnostic') {
    // The frozen CLI had no diagnostic mode. Model the investigation as a
    // fresh read of its actual bind rule, in addition to the sampled refusal.
    const rule = loadedText.find(({ path: sourcePath }) => sourcePath.endsWith('/bind.md'));
    if (!rule) throw new Error('paired context: missing frozen diagnostic rule');
    parts.push({ category: 'explicit-diagnostics', text: rule.text });
  }
  return { name: event.name, raw: parts.map(({ text }) => text).join(''), parts };
}

export function buildPairedContext({ captureBytes, adapter } = {}) {
  if (!Buffer.isBuffer(captureBytes) || !['claude', 'codex'].includes(adapter)) {
    throw new TypeError('paired context: capture bytes and adapter are required');
  }
  const capture = JSON.parse(captureBytes);
  if (capture.schema !== 'aitm.guidance-lifecycle-capture/v1' || !Array.isArray(capture.events)) {
    throw new Error('paired context: invalid captured lifecycle');
  }
  const baselineBytes = read(`${FIXTURES}/legacy-baseline.json`);
  const baseline = JSON.parse(baselineBytes);
  const adapterBaseline = baseline.adapters.find(({ id }) => id === adapter);
  const transcriptBytes = read(adapterBaseline.transcriptPath);
  if (digest(transcriptBytes) !== adapterBaseline.transcriptSha256) {
    throw new Error('paired context: frozen transcript changed');
  }
  const transcript = JSON.parse(transcriptBytes);
  const loadedText = adapterBaseline.loadedText.map((file) => {
    const bytes = Buffer.from(read(file.snapshotPath).toString('utf8'), 'base64');
    if (digest(bytes) !== file.sha256 || bytes.length !== file.bytes) {
      throw new Error(`paired context: frozen text changed: ${file.sourcePath}`);
    }
    return { path: file.sourcePath, text: bytes.toString('utf8') };
  });
  const manifest = capture.events.map((event) => ({
    id: event.name,
    kind: event.kind,
    action: actionOf(event),
    currentStatus: statusOf(event),
    authoritySnapshotSha256: event.snapshotSha256 ?? null,
  }));
  if (new Set(manifest.map(({ id }) => id)).size !== manifest.length) {
    throw new Error('paired context: duplicate event ID');
  }
  for (const name of [
    'matching-receipt',
    'compaction-reset',
    'diagnostic',
    'external-approval',
    'external-merge',
  ]) {
    if (!manifest.some(({ id }) => id === name)) throw new Error(`paired context: missing ${name}`);
  }
  validateLifecycleTranscript(capture);
  if (
    digest(captureBytes) !== PINNED_CAPTURE_SHA256 ||
    capture.identity?.scenarioManifestSha256 !== PINNED_SCENARIO_MANIFEST_SHA256
  ) {
    throw new Error('paired context: capture identity drift');
  }
  if (capture.identity?.transcriptSha256 !== digest(JSON.stringify(capture.events))) {
    throw new Error('paired context: transcript digest drift');
  }
  const repeated = capture.events.find(({ name }) => name === 'matching-receipt');
  const compacted = capture.events.find(({ name }) => name === 'compaction-reset');
  if (
    JSON.parse(repeated.stdout).guidance?.some(({ status }) => status !== 'not-modified') ||
    !JSON.parse(compacted.stdout).guidance?.some(({ status }) => status === 'expanded')
  ) {
    throw new Error('paired context: receipt or post-compaction instruction behavior drift');
  }
  const scenarioBytes = Buffer.from(`${JSON.stringify(manifest)}\n`);
  const authorityBytes = Buffer.from(
    `${JSON.stringify({
      initialFixtureSha256: capture.identity.initialFixtureSha256,
      snapshots: manifest.map(({ authoritySnapshotSha256 }) => authoritySnapshotSha256),
    })}\n`
  );
  const shared = {
    scenarioDigest: digest(scenarioBytes),
    authorityFixtureDigest: digest(authorityBytes),
    entries: manifest.map(({ id, action, currentStatus, kind }) => ({
      scenarioId: id,
      action: action ?? kind,
      outcome: currentStatus ?? kind,
    })),
  };
  validatePairedWorkload({
    baseline: shared,
    candidate: structuredClone(shared),
    scenarioBytes,
    authorityBytes,
  });
  const visible = capture.events.filter((event) => event.kind !== 'transition');
  const currentEvents = visible.map((event) => {
    const parts = capturedParts(event);
    return {
      name: event.name,
      raw: `${commandText(event)}${event.stdout}${event.stderr}`,
      parts,
    };
  });
  const legacyEvents = visible.map((event) =>
    modelLegacyEvent(event, transcript.entries, loadedText)
  );
  const proposedFiles = capture.measurement.modeledProposedStatic[adapter].files;
  const current = measureAgentVisible({
    staticFiles: proposedFiles.map(({ sourcePath, sha256 }) => {
      const bytes = read(sourcePath);
      if (digest(bytes) !== sha256) {
        throw new Error(`paired context: proposed static drift: ${sourcePath}`);
      }
      return { path: sourcePath, text: bytes.toString('utf8') };
    }),
    events: currentEvents,
  });
  const legacy = measureAgentVisible({
    staticFiles: loadedText,
    events: legacyEvents,
  });
  if (
    current.trafficCharacters !== capture.measurement.traffic.characters ||
    current.staticFiles.reduce((sum, file) => sum + file.proxyTokens, 0) !==
      capture.measurement.modeledProposedStatic[adapter].totals.proxyTokens
  ) {
    throw new Error('paired context: current capture accounting drift');
  }
  const responseTokens = (name) => {
    const event = capture.events.find((entry) => entry.name === name);
    return Math.ceil((event.stdout.length + event.stderr.length) / 4);
  };
  const currentBudgetVerdicts = {
    routerPlusPickup: verdict(
      current.staticFiles.reduce((sum, file) => sum + file.proxyTokens, 0),
      GUIDANCE_CONTEXT_BUDGETS.routerPlusPickup
    ),
    clean: verdict(responseTokens('ready-first-load'), GUIDANCE_CONTEXT_BUDGETS.clean),
    blocked: verdict(responseTokens('blocked-migration-freeze'), GUIDANCE_CONTEXT_BUDGETS.blocked),
    fullLifecycle: verdict(current.proxyTokens, GUIDANCE_CONTEXT_BUDGETS.fullLifecycle),
  };
  return {
    schema: 'aitm.guidance-paired-context/v1',
    adapter,
    eventManifest: manifest,
    ...shared,
    identities: {
      frozenBaselinePath: `${FIXTURES}/legacy-baseline.json`,
      frozenBaselineSha256: digest(baselineBytes),
      frozenTranscriptPath: adapterBaseline.transcriptPath,
      frozenTranscriptSha256: digest(transcriptBytes),
      historicalSourceCommit: baseline.source.commit,
      currentCapturePath: `${FIXTURES}/actual-explain-traffic-recertification.json`,
      currentCaptureSha256: digest(captureBytes),
      currentSourceCommit: capture.identity.sourceCommit,
    },
    streams: {
      legacy: legacyEvents.map(({ name, raw }) => ({
        event: name,
        sha256: digest(Buffer.from(raw)),
        characters: raw.length,
        bytes: Buffer.byteLength(raw),
      })),
      current: currentEvents.map(({ name, raw }) => ({
        event: name,
        sha256: digest(Buffer.from(raw)),
        characters: raw.length,
        bytes: Buffer.byteLength(raw),
      })),
    },
    legacy: {
      captureKind: 'modeled-24-event-projection-from-frozen-14-case-cli-samples',
      limitation: 'Cost projection only; old CLI decisions were not replayed on modern authority.',
      ...legacy,
    },
    current: {
      captureKind: 'captured-public-cli-traffic-plus-modeled-proposed-static',
      limitation: 'Proposed static files are not final installed adapter bytes.',
      repeated: { agentInstructionCharacters: 0 },
      compaction: { expandedRequiredEntries: true },
      ...current,
    },
    currentBudgetVerdicts,
    deltaProxyTokens: current.proxyTokens - legacy.proxyTokens,
    guaranteedReductionFromLegacyStaticAlone:
      current.proxyTokens < legacy.staticFiles.reduce((sum, file) => sum + file.proxyTokens, 0),
  };
}
