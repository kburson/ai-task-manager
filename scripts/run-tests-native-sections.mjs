// @story #1855
// Closed registration DATA. Canonical discovery and source bytes remain outside
// the reviewed membership table; neither missing nor new native members vanish.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NATIVE_SERIAL_MEMBERS } from './run-tests-native-members.mjs';

for (const member of Object.values(NATIVE_SERIAL_MEMBERS)) {
  if (member.registration) Object.freeze(member.registration);
  Object.freeze(member);
}
export function isNativeSerialEntry(entry) {
  const label = typeof entry === 'string' ? entry : entry?.label;
  return (
    typeof label === 'string' &&
    /(?:^|\/)integration\//.test(label) &&
    path.posix.basename(label).startsWith('native-')
  );
}
function fail() {
  throw new Error('run-tests: unknown or malformed native section metadata');
}
function validateMetadata(value) {
  if (value === null) return;
  if (
    !value ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).sort().join(',') !== 'mode,suffix,when'
  )
    fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some((d) => !Object.hasOwn(d, 'value') || !d.enumerable)) fail();
  if (
    typeof value.mode !== 'boolean' &&
    (typeof value.mode !== 'string' || !/^[a-z0-9-]+$/.test(value.mode))
  )
    fail();
  if (value.when === null) {
    if (value.suffix !== null) fail();
    return;
  }
  const suffixes =
    value.mode === 'board-exception-prefix'
      ? ['write', 'readback', 'outcome-write', 'outcome-readback']
      : ['intent-prefix', 'status-source-prefix'].includes(value.mode)
      ? ['write', 'readback']
      : ['intent-write', 'intent-readback', 'effect-write', 'effect-readback'];
  if (!['failBefore', 'failAfter'].includes(value.when) || !suffixes.includes(value.suffix)) fail();
}
export function nativeSerialSection(entry) {
  if (!isNativeSerialEntry(entry)) return 'serial';
  const member = NATIVE_SERIAL_MEMBERS[entry.label];
  if (!member || !Object.hasOwn(entry, 'nativeMetadata')) fail();
  validateMetadata(entry.nativeMetadata);
  const actual = entry.nativeMetadata,
    expected = member.registration;
  if (
    actual === null
      ? expected !== null
      : expected === null || ['mode', 'when', 'suffix'].some((key) => actual[key] !== expected[key])
  )
    fail();
  return member.section;
}
// The supported wrappers deliberately contain one import and one closed literal
// registration. This is a syntax contract, not arbitrary JS execution/parsing.
export function parseNativeSerialRegistration(source) {
  if (typeof source !== 'string') fail();
  if (!/\bregisterNativeStageCase\b/.test(source)) return null;
  const match =
    /^\s*\/\/ @story #\d+(?: #\d+)*\s*\n\s*import\s*\{\s*registerNativeStageCase\s*\}\s*from\s*['"]\.\/native-stage-continuation-fixture\.mjs['"];\s*registerNativeStageCase\(\s*(true|false|"[a-z0-9-]+"|'[a-z0-9-]+')\s*,\s*import\.meta\.url\s*(?:,\s*(\{[^{}]*\}))?\s*\);\s*$/.exec(
      source
    );
  if (!match) fail();
  const mode = match[1].startsWith("'") ? match[1].slice(1, -1) : JSON.parse(match[1]);
  let when = null,
    suffix = null;
  if (match[2]) {
    if ([...match[2].matchAll(/"(?:when|suffix)"\s*:/g)].length !== 2) fail();
    let fault;
    try {
      fault = JSON.parse(match[2]);
    } catch {
      fail();
    }
    if (Object.keys(fault).sort().join(',') !== 'suffix,when') fail();
    ({ when, suffix } = fault);
  }
  const result = { mode, when, suffix };
  validateMetadata(result);
  return result;
}
export function loadSerialSectionMetadata(entries) {
  return entries.map((entry) => {
    if (!isNativeSerialEntry(entry)) return entry;
    if (!entry.full || !NATIVE_SERIAL_MEMBERS[entry.label]) fail();
    const result = {
      ...entry,
      nativeMetadata: parseNativeSerialRegistration(readFileSync(entry.full, 'utf8')),
    };
    nativeSerialSection(result);
    return result;
  });
}
