// @story #1835
import { createHash } from 'node:crypto';

const name = new RegExp('^[_A-Za-z][_0-9A-Za-z]*');
const number = new RegExp('^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?');
const punctuation = new Set('!$():=@[]{|}&');

function tokenize(document) {
  const tokens = [];
  let offset = 0;
  while (offset < document.length) {
    const rest = document.slice(offset);
    if (/^[\s,]/.test(rest)) {
      offset += 1;
      continue;
    }
    if (rest[0] === '#') {
      const end = rest.indexOf('\n');
      offset += end < 0 ? rest.length : end;
      continue;
    }
    if (rest.startsWith('"""')) {
      const end = rest.indexOf('"""', 3);
      if (end < 0) return null;
      tokens.push('<string>');
      offset += end + 3;
      continue;
    }
    if (rest[0] === '"') {
      let index = 1;
      for (; index < rest.length; index += 1) {
        if (rest[index] === '\\') {
          index += 1;
          continue;
        }
        if (rest[index] === '"') break;
      }
      if (index >= rest.length) return null;
      tokens.push('<string>');
      offset += index + 1;
      continue;
    }
    if (rest.startsWith('...')) {
      tokens.push('...');
      offset += 3;
      continue;
    }
    const numeral = rest.match(number)?.[0];
    if (numeral) {
      tokens.push('<number>');
      offset += numeral.length;
      continue;
    }
    const identifier = rest.match(name)?.[0];
    if (identifier) {
      tokens.push(identifier);
      offset += identifier.length;
      continue;
    }
    if (punctuation.has(rest[0])) {
      tokens.push(rest[0]);
      offset += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

export function identifyGraphqlOperation(document, { selectedOperation = null } = {}) {
  const unknown = {
    kind: 'unknown',
    operation: null,
    queryFingerprint: null,
    fingerprintVersion: 'v1',
  };
  if (typeof document !== 'string' || document.length > 1_000_000) return unknown;
  const tokens = tokenize(document);
  if (!tokens?.length) return unknown;
  const operations = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let needDefinition = true;
  let selectionStarted = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (braceDepth === 0 && parenDepth === 0 && bracketDepth === 0 && needDefinition) {
      if (['query', 'mutation', 'subscription'].includes(token)) {
        const next = tokens[index + 1];
        operations.push({ kind: token, operation: next && name.test(next) ? next : null });
        needDefinition = false;
        selectionStarted = false;
      } else if (token === 'fragment') {
        needDefinition = false;
        selectionStarted = false;
      } else if (token === '{') {
        operations.push({ kind: 'query', operation: null });
        needDefinition = false;
        selectionStarted = true;
      } else return unknown;
    }
    if (token === '(') parenDepth += 1;
    if (token === ')') parenDepth -= 1;
    if (token === '[') bracketDepth += 1;
    if (token === ']') bracketDepth -= 1;
    if (token === '{') {
      if (parenDepth === 0 && braceDepth === 0) selectionStarted = true;
      braceDepth += 1;
    }
    if (token === '}') {
      braceDepth -= 1;
      if (braceDepth === 0 && selectionStarted && parenDepth === 0) {
        needDefinition = true;
        selectionStarted = false;
      }
    }
    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) return unknown;
  }
  if (
    braceDepth !== 0 ||
    parenDepth !== 0 ||
    bracketDepth !== 0 ||
    !needDefinition ||
    operations.length === 0
  )
    return unknown;
  let chosen;
  if (selectedOperation) {
    chosen = operations.find((item) => item.operation === selectedOperation);
    if (!chosen) return unknown;
  } else if (operations.length === 1) {
    chosen = operations[0];
  } else {
    chosen = { kind: 'mixed', operation: null };
  }
  if (chosen.kind === 'subscription') return unknown;
  const fingerprint = createHash('sha256').update(tokens.join(' ')).digest('hex');
  return { ...chosen, queryFingerprint: `sha256:${fingerprint}`, fingerprintVersion: 'v1' };
}
