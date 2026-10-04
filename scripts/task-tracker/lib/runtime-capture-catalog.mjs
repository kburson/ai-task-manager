// @story #1857
// Capture metadata owns binary payload hashes; decoding belongs to the family.
import { createHash } from 'node:crypto';
const SCHEMA = 'aitm.github-action-capture/v1';
const parseJson = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const instant = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const sha256 = (value) => 'sha256:' + createHash('sha256').update(value).digest('hex');
const slug = (value) =>
  /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value) ? value.replace('/', '__') : null;

function payload(value) {
  return (
    object(value) &&
    count(value.bytes) &&
    /^sha256:[a-f0-9]{64}$/.test(value.sha256 || '') &&
    typeof value.stored === 'boolean' &&
    typeof value.redacted === 'boolean' &&
    (value.stored
      ? typeof value.file === 'string' && /^[A-Za-z0-9.-]+$/.test(value.file) && !value.redacted
      : value.file === null)
  );
}
function metadata(value, context, mode) {
  if (!object(value) || value.schema !== SCHEMA) return false;
  if (mode === 'enabled')
    return (
      value.issue === context.issue &&
      typeof value.repository === 'string' &&
      slug(value.repository) === context.repository &&
      instant(value.enabledAt)
    );
  if (value.actionId !== context.actionId || value.sequence !== context.sequence) return false;
  if (mode === 'intent')
    return (
      value.issue === context.issue &&
      typeof value.repository === 'string' &&
      slug(value.repository) === context.repository &&
      instant(value.startedAt) &&
      object(value.invocation) &&
      typeof value.invocation.id === 'string' &&
      typeof value.invocation.command === 'string' &&
      object(value.process) &&
      positive(value.process.pid) &&
      ['read', 'mutation'].includes(value.operationClass) &&
      (value.mutationKind === null || typeof value.mutationKind === 'string') &&
      positive(value.attempt) &&
      object(value.preconditions) &&
      object(value.request) &&
      payload(value.request.argv) &&
      payload(value.request.stdin) &&
      Array.isArray(value.request.files) &&
      value.request.files.every((entry) => payload(entry) && typeof entry.kind === 'string')
    );
  return (
    instant(value.finishedAt) &&
    (value.durationMs === null || count(value.durationMs)) &&
    (value.exitCode === null || Number.isInteger(value.exitCode)) &&
    (value.signal === null || typeof value.signal === 'string') &&
    payload(value.stdout) &&
    payload(value.stderr) &&
    object(value.readback)
  );
}
function descriptor(relative, validate) {
  return {
    destination: relative,
    family: 'action-capture',
    scope: 'shared',
    validate: (bytes) => {
      try {
        return Buffer.isBuffer(bytes) && validate(bytes) === true;
      } catch {
        return false;
      }
    },
  };
}

export function classifyCaptureRecord({ relative, readSibling } = {}) {
  if (typeof relative !== 'string') return null;
  let match = relative.match(
    /^action-capture\/enabled\/([A-Za-z0-9._-]+)\/issue-([1-9][0-9]*)\.json$/
  );
  if (match) {
    const context = { repository: match[1], issue: Number(match[2]) };
    return descriptor(relative, (bytes) => metadata(parseJson(bytes), context, 'enabled'));
  }
  match = relative.match(
    /^action-capture\/repositories\/([A-Za-z0-9._-]+)\/issue-([1-9][0-9]*)\/(.+)$/
  );
  if (!match) return null;
  const context = { repository: match[1], issue: Number(match[2]) };
  if (match[3] === '.sequence')
    return descriptor(
      relative,
      (bytes) =>
        /^[0-9]+\n?$/.test(bytes.toString('ascii')) && count(Number(bytes.toString('ascii')))
    );
  const action = match[3].match(/^([0-9]{6,})-([0-9A-HJKMNP-TV-Z]{26})\/([^/]+)$/);
  if (!action) return null;
  context.sequence = Number(action[1]);
  context.actionId = action[2];
  const name = action[3];
  if (['intent.json', 'outcome.json'].includes(name))
    return descriptor(relative, (bytes) => metadata(parseJson(bytes), context, name.slice(0, -5)));
  if (
    !['argv.json', 'stdin.bin', 'stdout.bin', 'stderr.bin'].includes(name) &&
    !/^request-[0-9]{2,}\.bin$/.test(name)
  )
    return null;
  const mode = ['stdout.bin', 'stderr.bin'].includes(name) ? 'outcome' : 'intent';
  return descriptor(relative, (bytes) => {
    if (typeof readSibling !== 'function') return false;
    const record = parseJson(readSibling(mode + '.json'));
    if (!metadata(record, context, mode)) return false;
    const descriptors =
      mode === 'outcome'
        ? [record.stdout, record.stderr]
        : [record.request.argv, record.request.stdin, ...record.request.files];
    const matching = descriptors.filter((entry) => entry.stored && entry.file === name);
    return (
      matching.length === 1 &&
      matching[0].bytes === bytes.length &&
      matching[0].sha256 === sha256(bytes)
    );
  });
}
