// @story #1855
// One event-field DATA control program. It performs no I/O and grants no
// authority: yielded values require the original CLI or a separately proven
// private native invocation before any effect. No caller handlers are accepted.
import path from 'node:path';
import { ensureIssueFieldDb, deriveNativeEventFieldBinding } from '../issue-field-db.mjs';

function fieldTypeForKey(fieldDefs, key) {
  return fieldDefs.find((d) => d.key === key)?.type || '';
}

export function* eventFieldUpdateProgram({ cfg, issue, itemId, eventName }) {
  const bindings = (yield { kind: 'read-bindings', eventName }) || [];
  const fieldDefs = yield { kind: 'read-definitions' };
  const issueBody = cfg.repo ? yield { kind: 'read-body' } : '';
  let ensured = ensureIssueFieldDb(issueBody, fieldDefs);
  let values = { ...ensured.values };
  let issueDbChanged = ensured.changed;
  for (const binding of bindings) {
    const fieldKey = binding.field;
    const fieldId =
      cfg.fieldIds?.[fieldKey] ||
      cfg[`field${fieldKey[0].toUpperCase()}${fieldKey.slice(1)}`] ||
      '';
    const fieldType = fieldTypeForKey(fieldDefs, fieldKey);
    let resolved;
    if (binding.value === 'today') resolved = yield { kind: 'today' };
    else if (binding.value === 'now') resolved = yield { kind: 'now' };
    else continue;
    const derived = deriveNativeEventFieldBinding({
      fieldKey,
      fieldType,
      fieldId,
      mode: binding.mode,
      resolved,
      values,
    });
    if (!derived.changed) continue;
    values = derived.values;
    issueDbChanged = true;
    if (derived.fieldWrite)
      yield {
        kind: 'write-field',
        input: { projectId: cfg.projectId, itemId, ...derived.fieldWrite },
      };
    yield { kind: 'log', message: `✓ ${fieldKey} set for #${issue}` };
  }
  if (issueDbChanged && issueBody) {
    const updated = ensureIssueFieldDb(issueBody, fieldDefs, values);
    yield { kind: 'write-body', body: updated.body };
  }
}

// The same actual temp-file control sequence for both fixed original drivers.
// All yielded values remain DATA. The caller cannot supply effect handlers.
export function* eventFieldBodyWriteProgram({ body, issue, cfg }) {
  const tmp = path.join(
    yield { kind: 'tmp-directory' },
    `aitm-event-fields-${issue}-${yield { kind: 'tmp-clock' }}.md`
  );
  try {
    yield { kind: 'write-file', file: tmp, body, encoding: 'utf8' };
    yield {
      kind: 'edit-body',
      args: ['issue', 'edit', issue, '-R', cfg.repo, '--body-file', tmp],
    };
  } finally {
    try {
      yield { kind: 'unlink-file', file: tmp };
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

// Recorded DATA projection for the native tail journal. The original generators
// above remain the sole algorithm. This projection does not read a resource,
// perform an operation, certify its result, or grant an invocation capability.
// Callers must independently bind these inputs to full current native sources.
import { canonicalRecordJson } from './github-records/canonical-json.mjs';
import { fmtTs } from '../gh-timing-comment.mjs';
import { SCRATCH_SUBDIR } from '../paths.mjs';

function eventDataFailure() { throw new TypeError('native-event-field-data'); }
function eventDataKeys(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).sort().join(',') !== keys.slice().sort().join(',')) eventDataFailure();
}
function freezeEventData(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeEventData(child);
    Object.freeze(value);
  }
  return value;
}
export function deriveRecordedEventFieldOperations(input) {
  try {
    // Validate nested DATA before reading caller properties, then detach. No
    // caller reference or descriptor is carried across the generator steps.
    const source = JSON.parse(canonicalRecordJson(input));
    eventDataKeys(source, ['projectDir', 'cfg', 'issue', 'itemId', 'eventName', 'bindings', 'definitions', 'body', 'clocks', 'temporary']);
    const { projectDir, cfg, issue, itemId, eventName, bindings, definitions, body, clocks, temporary } = source;
    if (typeof projectDir !== 'string' || !path.isAbsolute(projectDir) || path.normalize(projectDir) !== projectDir || projectDir.includes('\0') ||
        !cfg || typeof cfg !== 'object' || Array.isArray(cfg) || typeof cfg.repo !== 'string' || cfg.repo.split('/').length !== 2 || cfg.repo.split('/').some(part => !part || part.includes(' ') || part.includes('\n')) ||
        typeof cfg.projectId !== 'string' || !cfg.projectId || typeof issue !== 'string' || !Number.isSafeInteger(Number(issue)) || Number(issue) < 1 || String(Number(issue)) !== issue ||
        typeof itemId !== 'string' || !itemId || eventName !== 'moveToTest' || !Array.isArray(bindings) || !Array.isArray(definitions) || typeof body !== 'string' || !Array.isArray(clocks)) eventDataFailure();
    if (temporary !== null) {
      eventDataKeys(temporary, ['epochMs']);
      if (!Number.isSafeInteger(temporary.epochMs) || temporary.epochMs < 0) eventDataFailure();
    }
    const operations = [], bodyOperations = [];
    let clockIndex = 0, nextBody = body, usedTemporary = false;
    const program = eventFieldUpdateProgram({ cfg, issue, itemId, eventName });
    let next = program.next();
    while (!next.done) {
      const operation = next.value;
      operations.push(structuredClone(operation));
      let value;
      switch (operation.kind) {
        case 'read-bindings': value = bindings; break;
        case 'read-definitions': value = definitions; break;
        case 'read-body': value = body; break;
        case 'today':
        case 'now': {
          const clock = clocks[clockIndex++];
          eventDataKeys(clock, ['kind', 'iso', 'offsetMin']);
          if (clock.kind !== operation.kind || typeof clock.iso !== 'string' || !Number.isFinite(Date.parse(clock.iso)) || new Date(clock.iso).toISOString() !== clock.iso ||
              (clock.kind === 'today' ? clock.offsetMin !== null : !Number.isInteger(clock.offsetMin) || Math.abs(clock.offsetMin) > 1440)) eventDataFailure();
          value = clock.kind === 'today' ? new Date(clock.iso).toISOString().slice(0, 10) : fmtTs(clock.iso, { offsetMin: clock.offsetMin });
          break;
        }
        case 'write-field':
        case 'log': break; // Original algorithm does not inspect these returns.
        case 'write-body': {
          if (usedTemporary || temporary === null) eventDataFailure();
          usedTemporary = true;
          nextBody = operation.body;
          const write = eventFieldBodyWriteProgram({ body: nextBody, issue, cfg });
          let step = write.next();
          while (!step.done) {
            bodyOperations.push(structuredClone(step.value));
            let result;
            switch (step.value.kind) {
              case 'tmp-directory': result = path.join(projectDir, SCRATCH_SUBDIR); break;
              case 'tmp-clock': result = temporary.epochMs; break;
              case 'write-file':
              case 'edit-body':
              case 'unlink-file': break;
              default: eventDataFailure();
            }
            step = write.next(result);
          }
          break;
        }
        default: eventDataFailure();
      }
      next = program.next(value);
    }
    if (clockIndex !== clocks.length || usedTemporary !== (temporary !== null)) eventDataFailure();
    // Refuse nonrepresentable derived DATA; do not normalize it into another
    // native parser outcome (for example Infinity into JSON null).
    return freezeEventData(JSON.parse(canonicalRecordJson({ operations, bodyOperations, body: nextBody, clocks })));
  } catch {
    eventDataFailure();
  }
}

// Resource-prefix DATA for the SAME original body program, including the real
// mkdir and temp-file lifecycle. These are only the affected resource subset;
// the stage fold must also compare its independent full resource vector and
// exact raw body reads. No constructor or successful projection grants a write.
export function reconstructRecordedEventFieldBodyPrefix(input) {
  try {
    const detached = JSON.parse(canonicalRecordJson(input));
    eventDataKeys(detached, ['source', 'initial', 'steps']);
    const { source, initial, steps } = detached;
    const projection = deriveRecordedEventFieldOperations(source);
    eventDataKeys(initial, ['body', 'directoryExists', 'file']);
    if (initial.body !== source.body || typeof initial.directoryExists !== 'boolean' || initial.file !== null ||
        !Array.isArray(steps) || steps.length < 1 || steps.length > projection.bodyOperations.length) eventDataFailure();
    // The native protocol owns only its newly allocated temp file. A collision
    // is unsupported DATA, never permission to overwrite an unrelated file.
    let after = structuredClone(initial), before = structuredClone(initial);
    for (const [index, step] of steps.entries()) {
      eventDataKeys(step, ['operation', 'readback']);
      if (canonicalRecordJson(step.operation) !== canonicalRecordJson(projection.bodyOperations[index]) ||
          (index !== steps.length - 1 && step.readback === null)) eventDataFailure();
      before = structuredClone(after);
      const operation = step.operation;
      switch (operation.kind) {
        case 'tmp-directory': after.directoryExists = true; break;
        case 'tmp-clock': break;
        case 'write-file':
          if (!after.directoryExists || after.file !== null) eventDataFailure();
          after.file = { path: operation.file, bytes: operation.body };
          break;
        case 'edit-body':
          if (!after.file || after.file.path !== operation.args.at(-1) || after.file.bytes !== projection.body) eventDataFailure();
          after.body = after.file.bytes;
          break;
        case 'unlink-file':
          if (!after.file || after.file.path !== operation.file) eventDataFailure();
          after.file = null;
          break;
        default: eventDataFailure();
      }
      if (step.readback !== null && canonicalRecordJson(step.readback) !== canonicalRecordJson(after)) eventDataFailure();
    }
    return freezeEventData({ before, after, complete: steps.length === projection.bodyOperations.length && steps.at(-1).readback !== null });
  } catch {
    throw new TypeError('native-event-field-body-prefix');
  }
}
