import { createHash } from 'node:crypto';

const INPUT_KEYS = ['commitSubjects', 'expectedHeadSha', 'issueNumber', 'prNumber'];
const SHA_RE = /^[0-9a-f]{40}$/;
const TOKEN_CONTENT_RE = /^#([1-9][0-9]*)$/;
const MAX_SOURCE_SUBJECT_BYTES = 1024;
const MAX_COMMIT_TITLE_BYTES = 256;

export const MAX_DELIVERY_COMMIT_MESSAGE_BYTES = 16 * 1024;

function attributionError(category) {
  return new TypeError(`delivery-attribution:${category}`);
}

function isPlainDataObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== 'string') return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value');
  });
}

function hasExactlyKeys(value, expectedKeys) {
  if (!isPlainDataObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertPositiveInteger(value, category) {
  if (!Number.isSafeInteger(value) || value <= 0) throw attributionError(category);
}

function assertSourceSubject(subject) {
  if (
    typeof subject !== 'string' ||
    subject.length === 0 ||
    subject !== subject.trim() ||
    !subject.isWellFormed() ||
    Buffer.byteLength(subject, 'utf8') > MAX_SOURCE_SUBJECT_BYTES ||
    [...subject].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw attributionError('source-subject');
  }
}

function tokensFromSubject(subject) {
  assertSourceSubject(subject);
  const markerStarts = [...subject.matchAll(/\[#/g)].length;
  const markers = [...subject.matchAll(/\[(#[^\]]*)\]/g)];
  if (markers.length === 0 || markers.length !== markerStarts) {
    throw attributionError('source-subject');
  }
  const subjectTokens = [];
  const semanticIssues = new Set();
  for (const marker of markers) {
    const match = marker[1].match(TOKEN_CONTENT_RE);
    if (match === null) throw attributionError('source-subject');
    const issue = match[1];
    if (semanticIssues.has(issue)) throw attributionError('duplicate-token');
    semanticIssues.add(issue);
    subjectTokens.push(`#${issue}`);
  }
  return subjectTokens;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function buildDeliveryCommitText(input = {}) {
  if (!hasExactlyKeys(input, INPUT_KEYS)) throw attributionError('input-keys');
  assertPositiveInteger(input.issueNumber, 'issue-number');
  assertPositiveInteger(input.prNumber, 'pr-number');
  if (typeof input.expectedHeadSha !== 'string' || !SHA_RE.test(input.expectedHeadSha)) {
    throw attributionError('expected-head-sha');
  }
  if (!Array.isArray(input.commitSubjects) || input.commitSubjects.length === 0) {
    throw attributionError('missing-source-subjects');
  }

  const tokenSet = new Set();
  for (const subject of input.commitSubjects) {
    for (const token of tokensFromSubject(subject)) tokenSet.add(token);
  }
  const topLevelToken = `#${input.issueNumber}`;
  if (!tokenSet.has(topLevelToken)) throw attributionError('missing-top-level-token');
  const attributionTokens = [...tokenSet].sort();
  const messageTokens = [
    topLevelToken,
    ...attributionTokens.filter((token) => token !== topLevelToken),
  ];
  const commitTitle = `[${topLevelToken}] Governed PR delivery`;
  const commitMessage =
    `PR #${input.prNumber}\nSource: ${input.expectedHeadSha}\n\n` +
    `Attribution: ${messageTokens.map((token) => `[${token}]`).join(' ')}`;
  if (Buffer.byteLength(commitTitle, 'utf8') > MAX_COMMIT_TITLE_BYTES) {
    throw attributionError('commit-title-too-large');
  }
  if (Buffer.byteLength(commitMessage, 'utf8') > MAX_DELIVERY_COMMIT_MESSAGE_BYTES) {
    throw attributionError('commit-message-too-large');
  }

  return deepFreeze({
    attributionTokens,
    commitTitle,
    commitMessage,
    commitTitleSha256: sha256(commitTitle),
    commitMessageSha256: sha256(commitMessage),
  });
}
