import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const AITM_PACKAGE_NAME = '@kburson/ai-task-manager';
const AITM_BIN_PATH = 'bin/aitm.mjs';

const SHELL_META = new Set([
  ';',
  '&',
  '|',
  '<',
  '>',
  '`',
  '$',
  '*',
  '?',
  '{',
  '}',
  '(',
  ')',
  '[',
  ']',
  '~',
]);
const DOUBLE_QUOTE_EXPANSION = new Set(['`', '$']);
const DOUBLE_QUOTE_ESCAPES = new Set(['`', '$', '"', '\\']);
const HANDOFF_VALUE_FLAGS = new Set([
  'dir',
  'actor',
  'review',
  'review-of',
  'decision',
  'summary',
  'message',
]);

function reject(reason) {
  return { recognized: false, reason };
}

function isControlCharacter(character) {
  const codePoint = character.codePointAt(0);
  return codePoint <= 0x1f || codePoint === 0x7f;
}

function hasLocalAitm(projectDir, exists) {
  if (exists(path.join(projectDir, 'node_modules', '.bin', 'aitm'))) return true;

  const packageAlias = path.join(projectDir, 'node_modules', 'ai-task-manager');
  try {
    if (realpathSync(packageAlias) !== realpathSync(projectDir)) return false;
    const manifest = JSON.parse(readFileSync(path.join(packageAlias, 'package.json'), 'utf8'));
    if (manifest.name !== AITM_PACKAGE_NAME || manifest.bin?.aitm !== AITM_BIN_PATH) {
      return false;
    }
    return exists(path.join(packageAlias, AITM_BIN_PATH));
  } catch {
    return false;
  }
}

function shellWords(input) {
  const words = [];
  let word = '';
  let quote = '';
  let escaped = false;
  let started = false;
  for (const character of input) {
    if (isControlCharacter(character)) return null;
    if (escaped) {
      if (quote === '"' && !DOUBLE_QUOTE_ESCAPES.has(character)) return null;
      if (!quote && SHELL_META.has(character)) return null;
      word += character;
      escaped = false;
      started = true;
    } else if (character === '\\' && quote !== "'") {
      escaped = true;
    } else if (quote) {
      if (character === quote) quote = '';
      else if (quote === '"' && DOUBLE_QUOTE_EXPANSION.has(character)) return null;
      else word += character;
      started = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (SHELL_META.has(character)) {
      return null;
    } else if (/\s/.test(character)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += character;
      started = true;
    }
  }
  if (quote || escaped) return null;
  if (started) words.push(word);
  return words;
}

function literalPath(value) {
  if (!value || value.includes('\\') || path.isAbsolute(value)) return false;
  const segments = value.split('/');
  return !segments.includes('.') && !segments.includes('..');
}

function options(words, valueFlags, booleanFlags = new Set()) {
  const out = new Map();
  for (let index = 0; index < words.length; index += 1) {
    const token = words[index];
    if (!token.startsWith('--') || token.length === 2) return null;
    const name = token.slice(2);
    if (out.has(name)) return null;
    if (booleanFlags.has(name)) {
      out.set(name, true);
      continue;
    }
    if (!valueFlags.has(name)) return null;
    const value = words[index + 1];
    if (value === undefined || value.startsWith('--') || value.length === 0) return null;
    out.set(name, value);
    index += 1;
  }
  return out;
}

export function classifyReviewerCoReviewCommand(command, config = {}) {
  const projectDir = path.resolve(config.projectDir || process.cwd());
  const exists = config.exists || existsSync;
  if (!hasLocalAitm(projectDir, exists)) return reject('local-aitm-unavailable');

  const words = shellWords(String(command || ''));
  if (!words || words.length < 4) return reject('not-one-literal-command');
  if (words[0] !== 'npx' || words[1] !== 'aitm' || words[2] !== 'co-review') {
    return reject('entrypoint');
  }

  const [name, ...rest] = words.slice(3);
  if (name === 'help') {
    return rest.length === 1 && rest[0] === 'handoff'
      ? { recognized: true, kind: 'help-handoff' }
      : reject('help-grammar');
  }
  if (name === 'status') {
    const parsed = options(rest, new Set(['dir']), new Set(['json']));
    const runtimeDir = parsed?.get('dir');
    if (!parsed || parsed.size < 1 || parsed.size > 2 || !literalPath(runtimeDir)) {
      return reject('status-grammar');
    }
    return {
      recognized: true,
      kind: 'status',
      runtimeDir,
      json: parsed.get('json') === true,
    };
  }
  if (name !== 'handoff') return reject('co-review-command');

  const parsed = options(rest, HANDOFF_VALUE_FLAGS);
  const required = ['dir', 'actor', 'review', 'review-of', 'decision', 'message'];
  if (!parsed || required.some((flag) => !parsed.get(flag))) return reject('handoff-grammar');
  if (![6, 7].includes(parsed.size)) return reject('handoff-option-count');
  if (!['accepted', 'changes-requested'].includes(parsed.get('decision'))) {
    return reject('handoff-decision');
  }
  for (const flag of ['dir', 'review', 'summary']) {
    const value = parsed.get(flag);
    if (value !== undefined && !literalPath(value)) return reject(`handoff-${flag}`);
  }
  return {
    recognized: true,
    kind: 'reviewer-handoff',
    runtimeDir: parsed.get('dir'),
    actor: parsed.get('actor'),
    reviewPath: parsed.get('review'),
    reviewOf: parsed.get('review-of'),
    decision: parsed.get('decision'),
    summaryPath: parsed.get('summary') ?? null,
    message: parsed.get('message'),
  };
}
