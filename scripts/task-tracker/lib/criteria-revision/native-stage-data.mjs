// @story #1855
// Pure coherence of original stage source data. This module does not read files,
// authenticate absence or execution, register a current read, or issue authority.
import path from 'node:path';
import { deriveRecordedConfig } from '../../config.mjs';
import { deriveRecordedSessionPolicy } from '../session-store.mjs';
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';

const fail = () => { throw new TypeError('native-stage-source'); };
function closed(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) fail();
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function root(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value.includes('\0')) fail();
}
function configSource(value, role, directory, filename) {
  closed(value, ['role', 'currentPath', 'currentExists', 'legacyPath', 'selectedPath', 'selectedExists', 'bytes', 'error']);
  const currentPath = path.join(directory, '.ai-task-manager', filename);
  const legacyPath = path.join(directory, '.claude', filename);
  if (value.role !== role || value.currentPath !== currentPath || value.legacyPath !== legacyPath ||
      typeof value.currentExists !== 'boolean' || typeof value.selectedExists !== 'boolean' || value.error !== null ||
      value.selectedPath !== (value.currentExists ? currentPath : legacyPath)) fail();
  // The selected repeated existence read must agree with a positive selection.
  // Both-false remains original data only, never proof of physical absence.
  if (value.currentExists && !value.selectedExists) fail();
  if (value.selectedExists) {
    if (typeof value.bytes !== 'string') fail();
    return { source: value.currentExists ? 'current' : 'legacy', bytes: value.bytes };
  }
  if (value.bytes !== null) fail();
  return { source: 'absent', bytes: null };
}

export function deriveRecordedStageSources(input) {
  try {
    closed(input, ['schema', 'repository', 'projectDir', 'homeDir', 'sessionId', 'configuration', 'session']);
    if (input.schema !== 'aitm.native-stage-sources/v1' || typeof input.repository !== 'string' ||
        !/^[^/\s]+\/[^/\s]+$/.test(input.repository) || typeof input.sessionId !== 'string' ||
        !input.sessionId || /[\/\\\0]/.test(input.sessionId)) fail();
    root(input.projectDir); root(input.homeDir);
    closed(input.configuration, ['sources', 'value']);
    const sources = input.configuration.sources;
    if (!Array.isArray(sources) || sources.length !== 2) fail();
    const user = configSource(sources[0], 'user', input.homeDir, 'task-tracker-config.json');
    const project = configSource(sources[1], 'project', input.projectDir, 'task-tracker.json');
    const derived = deriveRecordedConfig({ user, project });
    if (derived.config.repo !== input.repository ||
        canonicalRecordJson(derived.config) !== canonicalRecordJson(input.configuration.value)) fail();
    closed(input.session, ['source', 'value']);
    const source = input.session.source;
    closed(source, ['sessionId', 'path', 'exists', 'bytes', 'error']);
    if (source.sessionId !== input.sessionId || source.path !== path.join(input.projectDir, '.tmp/aitm/gates',
        `task-tracker.session.${input.sessionId}.json`) || typeof source.exists !== 'boolean' || source.error !== null ||
        (source.exists ? typeof source.bytes !== 'string' : source.bytes !== null)) fail();
    const sessionPolicy = deriveRecordedSessionPolicy({ sessionId: input.sessionId, bytes: source.bytes });
    if (canonicalRecordJson(sessionPolicy) !== canonicalRecordJson(input.session.value)) fail();
    return freeze({ config: derived.config, sessionPolicy, warnings: derived.warnings });
  } catch { fail(); }
}

// These are original native serializers, not a second body grammar or writer.
import { deriveEntryMarkerChange } from '../stage-entry-markers.mjs';
import { readLastKnownState, writeLastKnownStateAt } from '../../gh-timing-comment.mjs';
import { writeMoveCompleteMarker } from '../move-state/sentinel.mjs';
import { parseBodyVersion, stampBodyVersion, stripBodyVersion } from '../body-version.mjs';

export function deriveRecordedStageBody(input) {
  try {
    closed(input, ['body', 'transitionId', 'intent']);
    const { body, transitionId, intent } = input;
    if (typeof body !== 'string' || typeof transitionId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(transitionId)) fail();
    const timestamp = value => {
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString() !== value) fail();
    };
    const base = stripBodyVersion(body);
    let after;
    if (intent?.kind === 'entry-body') {
      closed(intent, ['kind', 'entryTs', 'stateTs', 'visit']);
      timestamp(intent.entryTs); timestamp(intent.stateTs);
      if (!Number.isSafeInteger(intent.visit) || intent.visit < 1) fail();
      const entry = deriveEntryMarkerChange(base, 'test', intent.entryTs, transitionId);
      if (entry.nextVisitCount !== intent.visit) fail();
      after = writeLastKnownStateAt({ body: entry.body, state: 'test', ts: intent.stateTs });
    } else if (intent?.kind === 'sentinel-body') {
      closed(intent, ['kind', 'ts']); timestamp(intent.ts);
      after = writeMoveCompleteMarker(base, 'test', intent.ts, transitionId);
    } else if (intent?.kind === 'rollback-state') {
      closed(intent, ['kind', 'stateTs', 'priorState']); timestamp(intent.stateTs);
      if (intent.priorState !== 'develop') fail();
      if (readLastKnownState(base).state === intent.priorState) return body;
      after = writeLastKnownStateAt({ body: base, state: intent.priorState, ts: intent.stateTs });
    } else fail();
    // Native versioned writes compare their version-stripped result first.
    // Exact sealed repeats cannot manufacture an additional version increment.
    return stripBodyVersion(after) === base ? body :
      stampBodyVersion(stripBodyVersion(after), parseBodyVersion(body) + 1);
  } catch { throw new TypeError('native-stage-body'); }
}
