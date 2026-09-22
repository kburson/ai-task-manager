// @story #1671

import {
  CORE_SCHEMA,
  EVENT_ID,
  SCALAR_STYLE_DOUBLE_QUOTED,
  SCALAR_STYLE_SINGLE_QUOTED,
  constructFromEvents,
  getScalarValue,
  parseEvents,
} from 'js-yaml';

import { createPositionIndex, decodeGuidanceSource } from './positions.mjs';

function fieldPath(parent, key) {
  return parent ? `${parent}.${key}` : key;
}

function diagnostic(source, positions, code, path, start, end, message) {
  return {
    code,
    path,
    start,
    end,
    ...positions.positionAt(Math.min(Math.max(start, 0), source.length)),
    message,
  };
}

function eventStart(event) {
  return event.valueStart ?? event.start ?? event.anchorStart ?? 0;
}

function eventEnd(event) {
  return event.valueEnd ?? event.start ?? event.anchorEnd ?? 0;
}

function keyRange(event) {
  const quoted =
    event.style === SCALAR_STYLE_DOUBLE_QUOTED || event.style === SCALAR_STYLE_SINGLE_QUOTED;
  return {
    start: quoted ? event.valueStart - 1 : event.valueStart,
    end: quoted ? event.valueEnd + 1 : event.valueEnd,
  };
}

export function parseGuidanceSource(input) {
  const source = decodeGuidanceSource(input);
  const positions = createPositionIndex(source);
  const ranges = new Map();
  const diagnostics = [];
  let events;
  try {
    events = parseEvents(source);
  } catch (error) {
    const start = error.mark?.position ?? 0;
    return {
      source,
      value: null,
      ranges,
      diagnostics: [diagnostic(source, positions, 'yaml-syntax', '', start, start, error.reason)],
    };
  }

  const frames = [];
  let documents = 0;
  function childPath(parent, event) {
    if (!parent || parent.kind === 'document') return '';
    if (parent.kind === 'sequence') return `${parent.path}[${parent.nextIndex++}]`;
    if (parent.expectingKey) {
      if (event.type !== EVENT_ID.SCALAR) {
        diagnostics.push(
          diagnostic(
            source,
            positions,
            'yaml-nonscalar-key',
            parent.path,
            eventStart(event),
            eventEnd(event),
            'Mapping keys must be scalars'
          )
        );
        parent.pendingKey = `invalid-${parent.seen.size}`;
      } else {
        const key = getScalarValue(source, event);
        const path = fieldPath(parent.path, key);
        const range = keyRange(event);
        if (parent.seen.has(key)) {
          diagnostics.push(
            diagnostic(
              source,
              positions,
              'duplicate-key',
              path,
              range.start,
              range.end,
              `Duplicate mapping key: ${key}`
            )
          );
        }
        if (key === '<<') {
          diagnostics.push(
            diagnostic(
              source,
              positions,
              'yaml-merge-key',
              path,
              range.start,
              range.end,
              'Merge keys are forbidden'
            )
          );
        }
        parent.seen.add(key);
        parent.pendingKey = key;
        ranges.set(path, range);
      }
      parent.expectingKey = false;
      return null;
    }
    parent.expectingKey = true;
    return fieldPath(parent.path, parent.pendingKey);
  }

  for (const event of events) {
    if (event.type === EVENT_ID.DOCUMENT) {
      documents += 1;
      frames.push({ kind: 'document', path: '' });
      if (event.directives.length > 0) {
        diagnostics.push(
          diagnostic(source, positions, 'yaml-directive', '', 0, 0, 'YAML directives are forbidden')
        );
      }
      continue;
    }
    if (event.type === EVENT_ID.POP) {
      frames.pop();
      continue;
    }
    const parent = frames.at(-1);
    const path = childPath(parent, event);
    if (event.anchorStart >= 0) {
      diagnostics.push(
        diagnostic(
          source,
          positions,
          event.type === EVENT_ID.ALIAS ? 'yaml-alias' : 'yaml-anchor',
          path ?? parent?.path ?? '',
          event.anchorStart,
          event.anchorEnd,
          'YAML anchors and aliases are forbidden'
        )
      );
    }
    if (event.tagStart >= 0) {
      diagnostics.push(
        diagnostic(
          source,
          positions,
          'yaml-tag',
          path ?? parent?.path ?? '',
          event.tagStart,
          event.tagEnd,
          'YAML tags are forbidden'
        )
      );
    }
    if (event.type === EVENT_ID.MAPPING) {
      frames.push({
        kind: 'mapping',
        path: path ?? parent?.path ?? '',
        expectingKey: true,
        pendingKey: null,
        seen: new Set(),
      });
    } else if (event.type === EVENT_ID.SEQUENCE) {
      frames.push({ kind: 'sequence', path: path ?? parent?.path ?? '', nextIndex: 0 });
    }
  }
  if (documents !== 1) {
    diagnostics.push(
      diagnostic(
        source,
        positions,
        'yaml-document-count',
        '',
        0,
        0,
        'Exactly one YAML document is required'
      )
    );
  }
  if (diagnostics.length > 0) return { source, value: null, ranges, diagnostics };
  try {
    const values = constructFromEvents(events, { source, schema: CORE_SCHEMA, maxAliases: 0 });
    return { source, value: values[0] ?? null, ranges, diagnostics };
  } catch (error) {
    const start = error.mark?.position ?? 0;
    diagnostics.push(
      diagnostic(
        source,
        positions,
        'yaml-construction',
        '',
        start,
        start,
        error.reason ?? error.message
      )
    );
    return { source, value: null, ranges, diagnostics };
  }
}
