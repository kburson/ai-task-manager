// @story #1835
import { createHash } from 'node:crypto';

const name = new RegExp('^[_A-Za-z][_0-9A-Za-z]*$');
const number = new RegExp('^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?');
const whitespace = new RegExp('^[\\s,]');
const punctuation = new Set('!$():=@[]{|}&');

function tokenize(document, offsets = []) {
  const tokens = [];
  let offset = 0;
  while (offset < document.length) {
    const rest = document.slice(offset);
    if (whitespace.test(rest)) {
      offset += 1;
      continue;
    }
    if (rest[0] === '#') {
      const end = rest.indexOf('\n');
      offset += end < 0 ? rest.length : end;
      continue;
    }
    offsets.push(offset);
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
    const identifier = rest.match(new RegExp('^[_A-Za-z][_0-9A-Za-z]*'))?.[0];
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

class GraphqlShapeParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.normalized = [...tokens];
    this.position = 0;
    this.depth = 0;
    this.operations = [];
  }
  peek() {
    return this.tokens[this.position];
  }
  eat(token) {
    if (this.peek() !== token) throw new Error('invalid GraphQL shape');
    this.position += 1;
  }
  eatName() {
    const token = this.peek();
    if (!name.test(token || '')) throw new Error('invalid GraphQL name');
    this.position += 1;
    return token;
  }
  nested(callback) {
    this.depth += 1;
    if (this.depth > 100) throw new Error('GraphQL nesting limit');
    try {
      return callback();
    } finally {
      this.depth -= 1;
    }
  }
  parseValue(constant = false) {
    return this.nested(() => {
      const token = this.peek();
      if (token === '$') {
        if (constant) throw new Error('variable in GraphQL constant value');
        this.eat('$');
        this.eatName();
      } else if (token === '[') {
        this.eat('[');
        while (this.peek() !== ']') this.parseValue(constant);
        this.eat(']');
      } else if (token === '{') {
        this.eat('{');
        while (this.peek() !== '}') {
          this.eatName();
          this.eat(':');
          this.parseValue(constant);
        }
        this.eat('}');
      } else if (token === '<string>' || token === '<number>' || name.test(token || '')) {
        this.normalized[this.position] = '<literal>';
        this.position += 1;
      } else throw new Error('invalid GraphQL value');
    });
  }
  parseArguments() {
    this.eat('(');
    let count = 0;
    while (this.peek() !== ')') {
      this.eatName();
      this.eat(':');
      this.parseValue();
      count += 1;
    }
    if (count === 0) throw new Error('empty GraphQL arguments');
    this.eat(')');
  }
  parseDirectives() {
    while (this.peek() === '@') {
      this.eat('@');
      this.eatName();
      if (this.peek() === '(') this.parseArguments();
    }
  }
  parseType() {
    if (this.peek() === '[') {
      this.eat('[');
      this.parseType();
      this.eat(']');
    } else this.eatName();
    if (this.peek() === '!') this.eat('!');
  }
  parseVariables() {
    this.eat('(');
    let count = 0;
    while (this.peek() !== ')') {
      this.eat('$');
      this.eatName();
      this.eat(':');
      this.parseType();
      if (this.peek() === '=') {
        this.eat('=');
        this.parseValue(true);
      }
      this.parseDirectives();
      count += 1;
    }
    if (count === 0) throw new Error('empty GraphQL variables');
    this.eat(')');
  }
  parseSelection() {
    if (this.peek() === '...') {
      this.eat('...');
      if (this.peek() === 'on') {
        this.eat('on');
        this.eatName();
        this.parseDirectives();
        this.parseSelectionSet();
      } else if (this.peek() === '@') {
        this.parseDirectives();
        this.parseSelectionSet();
      } else {
        this.eatName();
        this.parseDirectives();
      }
      return;
    }
    this.eatName();
    if (this.peek() === ':') {
      this.eat(':');
      this.eatName();
    }
    if (this.peek() === '(') this.parseArguments();
    this.parseDirectives();
    if (this.peek() === '{') this.parseSelectionSet();
  }
  parseSelectionSet() {
    this.nested(() => {
      this.eat('{');
      let count = 0;
      while (this.peek() !== '}') {
        this.parseSelection();
        count += 1;
      }
      if (count === 0) throw new Error('empty GraphQL selection');
      this.eat('}');
    });
  }
  parseDefinition() {
    if (this.peek() === 'fragment') {
      this.eat('fragment');
      if (this.eatName() === 'on') throw new Error('invalid fragment name');
      this.eat('on');
      this.eatName();
      this.parseDirectives();
      this.parseSelectionSet();
      return;
    }
    let kind = 'query';
    let operation = null;
    if (this.peek() !== '{') {
      kind = this.peek();
      if (!['query', 'mutation', 'subscription'].includes(kind))
        throw new Error('invalid operation kind');
      this.position += 1;
      if (name.test(this.peek() || '')) operation = this.eatName();
      if (this.peek() === '(') this.parseVariables();
      this.parseDirectives();
    }
    this.parseSelectionSet();
    this.operations.push({ kind, operation, endToken: this.position - 1 });
  }
  parse() {
    while (this.position < this.tokens.length) this.parseDefinition();
    if (this.operations.length === 0) throw new Error('missing operation');
    return this.operations;
  }
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
  if (!tokens?.length || tokens.length > 100_000) return unknown;
  try {
    const parser = new GraphqlShapeParser(tokens);
    const operations = parser.parse();
    const chosen = selectedOperation
      ? operations.find((item) => item.operation === selectedOperation)
      : operations.length === 1
        ? operations[0]
        : { kind: 'mixed', operation: null };
    if (!chosen || chosen.kind === 'subscription') return unknown;
    const digest = createHash('sha256').update(parser.normalized.join(' ')).digest('hex');
    return {
      kind: chosen.kind,
      operation: chosen.operation,
      queryFingerprint: `sha256:${digest}`,
      fingerprintVersion: 'v1',
    };
  } catch {
    return unknown;
  }
}

// @story #1837
// Reuse the validated parser and source offsets; never reconstruct literal values.
export function prepareGraphqlQuery(query, { selectedOperation = null } = {}) {
  const identity = identifyGraphqlOperation(query, { selectedOperation });
  const unchanged = { query, alias: null, identity };
  if (identity.kind !== 'query') return unchanged;
  try {
    const offsets = [];
    const tokens = tokenize(query, offsets);
    const operations = new GraphqlShapeParser(tokens).parse();
    const selected = selectedOperation
      ? operations.find((operation) => operation.operation === selectedOperation)
      : operations[0];
    let alias = '_aitmUsage';
    for (let i = 1; tokens.includes(alias); i += 1) alias = `_aitmUsage${i}`;
    const end = offsets[selected.endToken];
    return {
      query: query.slice(0, end) + ` ${alias}: rateLimit { cost } ` + query.slice(end),
      alias,
      identity,
    };
  } catch {
    return unchanged;
  }
}

// @story #1839
// These are CLI invocation identities; hidden GraphQL requests stay opaque.
export function identifyGhInvocation(args = []) {
  const reads = {
    issue: ['view', 'list', 'status'],
    repo: ['view', 'list'],
    pr: ['view', 'list', 'status', 'checks'],
  };
  const writes = { issue: ['create', 'edit', 'comment', 'close', 'reopen'] };
  const kind = reads[args[0]]?.includes(args[1])
    ? 'query'
    : writes[args[0]]?.includes(args[1])
      ? 'mutation'
      : 'unknown';
  return {
    kind,
    operation: kind === 'unknown' ? null : `gh.${args[0]}.${args[1]}`,
    queryFingerprint: null,
    fingerprintVersion: 'v1',
  };
}
