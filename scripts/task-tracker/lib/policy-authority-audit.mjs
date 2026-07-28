// Pure structural audit for duplicate state-engine policy authorities.
//
// Contract: this audit detects accidental duplication of policy authority in
// production source. Its adversary is a maintainer who copy-pastes a state
// array or policy table without realizing another module already owns it. It is
// not evasion-proof and must not try to be. The production-source scan is its
// pass condition, and a finding is actionable only when it reproduces against a
// real file under scripts/. Fixtures should represent shapes that exist in this
// repository or that a maintainer would plausibly write, not deliberately
// pathological JavaScript constructions intended to defeat the audit.
//
// This deliberately inspects declarations rather than imports: compatibility
// projections may consume canonical policy safely, while a second literal
// table can drift even when it also imports the canonical package.
// cspell:ignore quasis

import { parse } from 'espree';

import { actionPolicyFor, stateIds } from './lifecycle-policy/index.mjs';
import { isKnownTimingEvent } from './timing-events/index.mjs';

const STATE_IDS = stateIds();
const PARSE_OPTIONS = Object.freeze({
  ecmaVersion: 'latest',
  sourceType: 'module',
  range: true,
});

export const POLICY_AUTHORITY_CATEGORIES = Object.freeze([
  'state-identity',
  'directional-edges',
  'action-eligibility',
  'timing-events',
  'cli-metadata',
]);

const CANONICAL_OWNERS = Object.freeze({
  'state-identity': new Set([
    'scripts/task-tracker/lib/lifecycle-policy/states.mjs',
    // Complete operational registry derived from per-state modules.
    'scripts/task-tracker/states/index.mjs',
    // Complete activity-class matrix; policy subset, not state identity.
    'scripts/task-tracker/activity-policy.mjs',
  ]),
  'directional-edges': new Set([
    'scripts/task-tracker/lib/lifecycle-policy/executable-transitions.mjs',
    'scripts/task-tracker/lib/lifecycle-policy/history.mjs',
    // Public help projection; descriptive only and never imported by movement.
    'scripts/task-tracker/verbs/help-data.mjs',
  ]),
  'action-eligibility': new Set(['scripts/task-tracker/lib/lifecycle-policy/actions.mjs']),
  'timing-events': new Set([
    'scripts/task-tracker/lib/timing-events/catalog.mjs',
    'scripts/task-tracker/lib/timing-events/legacy.mjs',
    'scripts/task-tracker/lib/timing-events/parameterized.mjs',
    // Explicit retired-event cleanup subset; never an emission authority.
    'scripts/task-tracker/lib/heal-timing-log.mjs',
  ]),
  'cli-metadata': new Set([
    'scripts/lib/self-doc.mjs',
    'scripts/task-tracker/verbs/help-data.mjs',
    'scripts/task-tracker/lib/command-surface/catalog.mjs',
    'scripts/task-tracker/lib/command-surface/entrypoints.mjs',
    'scripts/task-tracker/lib/command-surface/routing.mjs',
  ]),
});

const DATA_TRAVERSAL_BOUNDARIES = new Set([
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'TaggedTemplateExpression',
]);

function isNode(value) {
  return Boolean(value && typeof value === 'object' && typeof value.type === 'string');
}

function childNodes(node) {
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'range' || key === 'loc' || key === 'tokens' || key === 'comments') continue;
    if (isNode(value)) {
      children.push(value);
    } else if (Array.isArray(value)) {
      children.push(...value.filter(isNode));
    }
  }
  return children;
}

function walkAst(node, visit) {
  if (!isNode(node)) return;
  visit(node);
  for (const child of childNodes(node)) walkAst(child, visit);
}

function walkData(node, visit) {
  if (!isNode(node)) return;
  visit(node);
  if (DATA_TRAVERSAL_BOUNDARIES.has(node.type)) return;
  if (node.type === 'TemplateLiteral') return;
  for (const child of childNodes(node)) walkData(child, visit);
}

function declarations(source = '') {
  const ast = parse(String(source), PARSE_OPTIONS);
  const found = [];
  walkAst(ast, (node) => {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') return;
    for (const declarator of node.declarations) {
      if (declarator.id?.type !== 'Identifier' || !declarator.init) continue;
      found.push({ name: declarator.id.name, initializer: declarator.init });
    }
  });
  return found;
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type !== 'TemplateLiteral' || node.expressions.length > 0) return null;
  return node.quasis[0]?.value?.cooked ?? node.quasis[0]?.value?.raw ?? '';
}

function stringLiterals(node) {
  const values = [];
  walkData(node, (candidate) => {
    const value = staticString(candidate);
    if (value !== null) values.push(value);
  });
  return values;
}

function propertyName(property) {
  if (property?.type !== 'Property') return null;
  if (!property.computed && property.key?.type === 'Identifier') return property.key.name;
  return staticString(property.key);
}

function properties(node) {
  const found = [];
  walkData(node, (candidate) => {
    if (candidate.type === 'Property') found.push(candidate);
  });
  return found;
}

function unwrapFreeze(node) {
  if (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'MemberExpression' &&
    !node.callee.computed &&
    node.callee.object?.type === 'Identifier' &&
    node.callee.object.name === 'Object' &&
    node.callee.property?.type === 'Identifier' &&
    node.callee.property.name === 'freeze' &&
    node.arguments[0]
  ) {
    return node.arguments[0];
  }
  return node;
}

function directArrayStrings(node) {
  const value = unwrapFreeze(node);
  if (value?.type !== 'ArrayExpression') return null;
  return value.elements.map(staticString).filter((entry) => entry !== null);
}

function simpleMappings(node) {
  return properties(node).flatMap((property) => {
    const key = propertyName(property);
    if (key === null) return [];
    const arrayValues = directArrayStrings(property.value);
    if (arrayValues !== null) return [{ key, values: arrayValues, array: true }];
    const value = staticString(unwrapFreeze(property.value));
    return value === null ? [] : [{ key, values: [value], array: false }];
  });
}

function propertyCount(node, name) {
  return properties(node).filter((property) => propertyName(property) === name).length;
}

function stateLiteralCount(node) {
  return new Set(stringLiterals(node).filter((value) => STATE_IDS.includes(value))).size;
}

function ownsCompleteStateIdentity({ initializer }) {
  const values = stringLiterals(initializer);
  const orderedValues =
    values.length === STATE_IDS.length &&
    values.every((value, index) => value === STATE_IDS[index]);
  const keys = new Set(properties(initializer).map(propertyName).filter(Boolean));
  return orderedValues || STATE_IDS.every((state) => keys.has(state));
}

function ownsDirectionalEdges({ initializer }) {
  const mappedArrays = simpleMappings(initializer).filter(
    ({ key, values, array }) =>
      array &&
      STATE_IDS.includes(key) &&
      values.length > 0 &&
      values.every((value) => STATE_IDS.includes(value))
  ).length;
  const rows = propertyCount(initializer, 'from');
  const targets = propertyCount(initializer, 'to');
  return mappedArrays >= 2 || (rows >= 2 && targets >= 2 && stateLiteralCount(initializer) >= 2);
}

function ownsActionEligibility({ initializer }) {
  const repeatedAllowedStates =
    propertyCount(initializer, 'allowedStates') >= 2 && stateLiteralCount(initializer) >= 2;
  const rootIsObject = unwrapFreeze(initializer)?.type === 'ObjectExpression';
  const stateValuedActions = simpleMappings(initializer).filter(
    ({ key, values }) =>
      !STATE_IDS.includes(key) &&
      actionPolicyFor(key).kind !== 'unknown-action' &&
      values.length > 0 &&
      values.every((value) => STATE_IDS.includes(value))
  );
  return repeatedAllowedStates || (rootIsObject && stateValuedActions.length >= 2);
}

function timingLiteralCatalog(initializer) {
  const values = stringLiterals(initializer);
  if (values.length < 2) return false;
  const known = values.filter((value) => isKnownTimingEvent(value));
  return known.length >= 2 && known.length / values.length >= 0.5;
}

function rootIsTimingCollection(initializer) {
  const root = unwrapFreeze(initializer);
  if (root?.type === 'ArrayExpression') return true;
  return (
    root?.type === 'NewExpression' &&
    root.callee?.type === 'Identifier' &&
    root.callee.name === 'Set' &&
    root.arguments[0]?.type === 'ArrayExpression'
  );
}

function ownsTimingEvents({ initializer }) {
  const eventFields = propertyCount(initializer, 'event');
  return (
    (eventFields >= 2 && timingLiteralCatalog(initializer)) ||
    (rootIsTimingCollection(initializer) && timingLiteralCatalog(initializer))
  );
}

function ownsCliMetadata({ initializer }) {
  const recordKeys = ['verb', 'dispatch', 'usage', 'summary', 'path', 'command'];
  const counts = recordKeys.map((key) => propertyCount(initializer, key));
  const dispatchMappings = simpleMappings(initializer).filter(
    ({ values }) =>
      values.length === 1 && /^(?:inline|verbs\/[A-Za-z0-9_./-]+\.mjs)$/.test(values[0])
  );
  const distinctDispatchKeys = new Set(dispatchMappings.map(({ key }) => key));
  return counts.filter((count) => count >= 2).length >= 2 || distinctDispatchKeys.size >= 2;
}

const DETECTORS = Object.freeze({
  'state-identity': ownsCompleteStateIdentity,
  'directional-edges': ownsDirectionalEdges,
  'action-eligibility': ownsActionEligibility,
  'timing-events': ownsTimingEvents,
  'cli-metadata': ownsCliMetadata,
});

export function auditPolicyAuthorities(sources = {}) {
  const entries = sources instanceof Map ? [...sources.entries()] : Object.entries(sources);
  const parsed = entries.map(([file, source]) => ({ file, declarations: declarations(source) }));
  const findings = [];

  for (const category of POLICY_AUTHORITY_CATEGORIES) {
    const allowed = CANONICAL_OWNERS[category];
    const detects = DETECTORS[category];
    for (const { file, declarations: fileDeclarations } of parsed) {
      if (allowed.has(file)) continue;
      const declaration = fileDeclarations.find(detects);
      if (!declaration) continue;
      findings.push({
        category,
        file,
        declaration: declaration.name,
        detail: `${declaration.name} is a literal ${category} authority outside its approved owner`,
      });
    }
  }
  return findings;
}
