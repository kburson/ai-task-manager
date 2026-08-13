// @story #1007
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PHASE_EVENTS } from '../../../phase-events.mjs';
import {
  EVENT_CLASS,
  lifecycleTimingEventSlugs,
  classifyTimingEventForAccounting as classifyTimingEvent,
  isCanonicalPhaseEvent as isCanonicalPhaseSlug,
  isKnownTimingEvent,
  isEmittableTimingEvent,
} from '../../../lib/timing-events/index.mjs';
import { validate as validateTimingLog } from '../../../lib/agent-review/validators/timing-log-sequence.mjs';
import { TIMING_EVENT_BASELINE } from '../../fixtures/state-engine-policy-baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const phaseSlugs = Object.values(PHASE_EVENTS).flatMap((state) =>
  Object.values(state).map(({ event }) => event)
);
const PHASE_EVENT_SLUGS = lifecycleTimingEventSlugs();

function ruleFor(event) {
  if (TIMING_EVENT_BASELINE.exact.includes(event)) return 'exact';
  return TIMING_EVENT_BASELINE.parameterized.find(({ pattern }) => pattern.test(event))?.name;
}

function strictReaderAccepts(event) {
  const eventClass = classifyTimingEvent(event);
  const events =
    eventClass === EVENT_CLASS.DEPARTURE
      ? ['start', event, 'resumed']
      : eventClass === EVENT_CLASS.REENGAGEMENT
        ? ['start', 'paused', event]
        : [event];
  const rows = events.map(
    (slug, index) => `| 2026-07-27T00:00:0${index}.000Z | ${slug} | 0 | 0 | 0 | 0 | characterized |`
  );
  const stage = event.match(
    /^(backlog|refine|ready-for-plan|plan|develop|test|review|done):(?!failed)/
  )?.[1];
  return validateTimingLog({
    comments: [
      {
        body: [
          '## ⏱ Timing Log',
          '| Timestamp | Event | Active | Idle | Words | Marker | Description |',
          '|---|---|---:|---:|---:|---:|---|',
          ...rows,
        ].join('\n'),
      },
    ],
    markers: { enteredStages: stage ? [{ stage }] : [] },
  }).pass;
}

function walk(relativeDir) {
  return readdirSync(path.join(ROOT, relativeDir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) return walk(relativePath);
    return [relativePath];
  });
}

function sourceLine(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function splitTopLevel(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

export function discoverTimingEmitters() {
  const files = ['scripts/task-tracker', 'scripts/gh']
    .flatMap(walk)
    .filter(
      (file) =>
        file.endsWith('.mjs') &&
        !file.includes('/tests/') &&
        !file.endsWith('.test.mjs') &&
        !file.includes('/maintenance/')
    );
  const found = [];

  for (const file of files) {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    const rowBuilders = new Set(['buildRow', 'buildFlushRow', 'buildBackdatedDepartureRow']);
    for (const alias of source.matchAll(/\bbuild(?:Flush)?Row\s*:\s*([A-Za-z_$][\w$]*)/g)) {
      rowBuilders.add(alias[1]);
    }
    const buildCall = new RegExp(
      `\\b(${[...rowBuilders].join('|')})\\s*\\(\\s*\\{([\\s\\S]*?)\\n\\s*\\}\\s*\\)`,
      'g'
    );
    for (const match of source.matchAll(buildCall)) {
      if (file === 'scripts/task-tracker/runtime.mjs') continue;
      const body = match[2];
      const property = body.match(/^\s*(event|phase):\s*(.+?),?\s*$/m);
      if (!property) continue;
      const offset = match.index + match[0].indexOf(property[0]) + property[0].indexOf(property[1]);
      found.push({
        file,
        line: sourceLine(source, offset),
        kind: property[1] === 'phase' ? 'phase-call' : 'event-call',
        expression: property[2].replace(/,$/, '').trim(),
        hasFullWordMarker: /\bfullWordMarker\s*[:},]/.test(body),
      });
    }

    const flushCall = /\bflushActiveToGH\s*\(([\s\S]*?)\);/g;
    for (const match of source.matchAll(flushCall)) {
      const args = splitTopLevel(match[1]);
      if (args.length < 2) continue;
      const expression = args[1].replace(/\s+/g, ' ').trim();
      const expressionOffset = match.index + match[0].indexOf(args[1]);
      found.push({
        file,
        line: sourceLine(source, expressionOffset),
        kind: 'flush-call',
        expression,
      });
    }

    const specsStart = source.indexOf('export function buildOrphanRecoveryRowSpecs');
    if (specsStart >= 0) {
      const specsEnd = source.indexOf('\nasync function ', specsStart);
      const specsSource = source.slice(specsStart, specsEnd < 0 ? source.length : specsEnd);
      for (const match of specsSource.matchAll(/{\s*event:\s*(.+?),([\s\S]*?)\n\s*},?/g)) {
        const expression = match[1].replace(/,$/, '').trim();
        const fullWordMarker = match[0].match(/\bfullWordMarker\s*:\s*([^,\n}]+)/)?.[1].trim();
        const hasFullWordMarker =
          /\bfullWordMarker\s*,/.test(match[0]) ||
          (fullWordMarker != null && fullWordMarker !== 'null');
        found.push({
          file,
          line: sourceLine(source, specsStart + match.index + match[0].indexOf('event:')),
          kind: 'event-spec',
          expression,
          hasFullWordMarker,
        });
      }
    }
  }

  return found.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.kind.localeCompare(b.kind) ||
      a.expression.localeCompare(b.expression)
  );
}

test('the exact vocabulary includes every canonical lifecycle slug once', () => {
  assert.equal(phaseSlugs.length, 14);
  assert.equal(new Set(phaseSlugs).size, phaseSlugs.length);
  assert.deepEqual(PHASE_EVENT_SLUGS, phaseSlugs);
  for (const slug of phaseSlugs) {
    assert.ok(TIMING_EVENT_BASELINE.exact.includes(slug), slug);
    assert.equal(isCanonicalPhaseSlug(slug), true, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
  }
});

test('vocabulary definitions are separate from emitters and source-verified', () => {
  assert.deepEqual(
    TIMING_EVENT_BASELINE.definitions.map(({ event }) => event),
    phaseSlugs
  );
  for (const definition of TIMING_EVENT_BASELINE.definitions) {
    const source = readFileSync(path.join(ROOT, definition.file), 'utf8');
    const line = source.split('\n')[definition.line - 1];
    assert.ok(line.includes(definition.expression), `${definition.file}:${definition.line}`);
    assert.equal(ruleFor(definition.event), 'exact', definition.event);
  }
});

test('production timing emitter discovery exactly matches the characterized call sites', () => {
  const actual = discoverTimingEmitters().map(({ file, line, kind, expression }) => ({
    file,
    line,
    kind,
    expression,
  }));
  const expected = TIMING_EVENT_BASELINE.emitters
    .map(({ file, line, kind, expression }) => ({ file, line, kind, expression }))
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.kind.localeCompare(b.kind) ||
        a.expression.localeCompare(b.expression)
    );
  assert.deepEqual(expected, actual);
});

test('every direct production timing-row producer supplies the full-marker observation', () => {
  const omissions = discoverTimingEmitters()
    .filter(({ kind }) => ['event-call', 'phase-call', 'event-spec'].includes(kind))
    .filter(({ hasFullWordMarker }) => !hasFullWordMarker)
    .map(({ file, line, expression }) => `${file}:${line}: ${expression}`);
  assert.deepEqual(omissions, []);
});

test('every characterized production timing emitter maps to known strict-reader rules', () => {
  const strictReaderGaps = [];
  for (const emitter of TIMING_EVENT_BASELINE.emitters) {
    assert.ok(emitter.file.length > 0);
    assert.ok(Number.isInteger(emitter.line) && emitter.line > 0);
    assert.ok(emitter.expression.length > 0);
    assert.ok(emitter.events.length > 0, `${emitter.file}:${emitter.line}`);
    for (const event of emitter.events) {
      assert.ok(ruleFor(event), `${emitter.file}:${emitter.line}: ${event}`);
      assert.equal(isKnownTimingEvent(event), true, event);
      assert.equal(isEmittableTimingEvent(event), true, event);
      assert.equal(classifyTimingEvent(event) == null, false, event);
      if (!strictReaderAccepts(event)) {
        strictReaderGaps.push(`${emitter.file}:${emitter.line}: ${event}`);
      }
    }
  }
  assert.deepEqual(strictReaderGaps, []);
});

test('parameterized interruption and audit families retain their current classification', () => {
  const examples = new Map([
    ['demoted-target', ['demoted:develop', EVENT_CLASS.PHASE, true]],
    ['pause-reason', ['pause:orphan-recovery', EVENT_CLASS.DEPARTURE, false]],
    ['resume-reason', ['resume:manual', EVENT_CLASS.REENGAGEMENT, false]],
    ['switch-out-issue', ['switch-out:#1007', EVENT_CLASS.DEPARTURE, false]],
  ]);

  for (const { name, pattern } of TIMING_EVENT_BASELINE.parameterized) {
    const [slug, expectedClass, canonical] = examples.get(name);
    assert.equal(pattern.test(slug), true, `${name}: ${slug}`);
    assert.equal(classifyTimingEvent(slug), expectedClass, slug);
    assert.equal(isCanonicalPhaseSlug(slug), canonical, slug);
  }
});

test('retired timing slugs remain neutral read-side history only', () => {
  assert.deepEqual(TIMING_EVENT_BASELINE.retired, ['idle', 'active-work']);
  for (const slug of TIMING_EVENT_BASELINE.retired) {
    assert.equal(TIMING_EVENT_BASELINE.exact.includes(slug), false, slug);
    assert.equal(isCanonicalPhaseSlug(slug), false, slug);
    assert.equal(classifyTimingEvent(slug), EVENT_CLASS.PHASE, slug);
  }
});
