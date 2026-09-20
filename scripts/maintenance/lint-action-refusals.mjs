#!/usr/bin/env node
// @story #1661

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as espree from 'espree';

import { CODE_DEFINITIONS } from '../task-tracker/lib/action-decision/contract.mjs';
import { discoverFiles } from '../task-tracker/lib/discover-test-files.mjs';
import { STATE_MACHINE } from '../task-tracker/states/index.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INVENTORY_PATH = path.join(
  PROJECT_ROOT,
  'scripts/task-tracker/lib/action-decision/legacy-refusals.json'
);
const V1_VERB_FILES = new Map([
  ['scripts/task-tracker/verbs/start.mjs', 'verb:bind'],
  ['scripts/task-tracker/verbs/resume.mjs', 'verb:resume'],
  ['scripts/task-tracker/verbs/promote.mjs', 'verb:promote'],
  ['scripts/task-tracker/verbs/test.mjs', 'verb:test'],
  ['scripts/task-tracker/verbs/review.mjs', 'verb:review'],
  ['scripts/task-tracker/verbs/deliver.mjs', 'verb:deliver'],
  ['scripts/task-tracker/verbs/close.mjs', 'verb:close'],
]);

function keyName(property) {
  if (!property || property.type !== 'Property' || property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  return property.key.type === 'Literal' ? property.key.value : null;
}

function property(object, name) {
  return object.properties?.find((candidate) => keyName(candidate) === name) ?? null;
}

function literal(propertyNode) {
  return propertyNode?.value?.type === 'Literal' ? propertyNode.value.value : undefined;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range', 'start', 'end'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}

function fingerprint(kind, source) {
  return `sha256:${createHash('sha256').update(`${kind}\0${source}`).digest('hex')}`;
}

function parseSource(source, file) {
  try {
    return espree.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      loc: true,
      range: true,
    });
  } catch (error) {
    throw new TypeError(`action-refusal-lint:parse:${file}:${error.message}`);
  }
}

function isLegacyRefusalObject(node) {
  if (node?.type !== 'ObjectExpression' || literal(property(node, 'ok')) !== false) return false;
  const code = literal(property(node, 'code'));
  const typedDisposition =
    property(node, 'remediation') !== null || property(node, 'noAutomaticRemediation') !== null;
  return !(typeof code === 'string' && typedDisposition);
}

function constructorKind(name) {
  if (/^(?:refuse|refusal|reject|blocked|blocker)$/i.test(name)) return 'refusal';
  if (/^(?:warn|warning)$/i.test(name)) return 'warning';
  return null;
}

function constructorKinds(ast) {
  const names = new Map();
  const namespaces = new Set();
  const functionResultKind = (fn) => {
    let found = null;
    walk(fn.body, (node) => {
      if (isLegacyRefusalObject(node)) found = 'refusal';
      else if (node?.type === 'ObjectExpression' && property(node, 'warn') !== null) {
        found ??= 'warning';
      }
    });
    return found;
  };
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers ?? []) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaces.add(specifier.local.name);
          continue;
        }
        const importedName = specifier.imported?.name ?? specifier.local?.name;
        const kind = constructorKind(importedName);
        if (kind && specifier.local?.name) names.set(specifier.local.name, kind);
      }
    }
    if (
      node.type === 'VariableDeclarator' &&
      node.id?.type === 'Identifier' &&
      ['ArrowFunctionExpression', 'FunctionExpression'].includes(node.init?.type) &&
      functionResultKind(node.init)
    ) {
      names.set(node.id.name, functionResultKind(node.init));
    }
    if (
      node.type === 'FunctionDeclaration' &&
      node.id?.type === 'Identifier' &&
      functionResultKind(node)
    ) {
      names.set(node.id.name, functionResultKind(node));
    }
  });
  return { names, namespaces };
}

function analyzeSource({ file, source }) {
  const ast = parseSource(source, file);
  const constructors = constructorKinds(ast);
  const guardIds = new Set();
  const sites = [];
  const codeEmissions = [];
  walk(ast, (node) => {
    if (node.type === 'CallExpression') {
      const directKind =
        node.callee?.type === 'Identifier' ? constructors.names.get(node.callee.name) : null;
      const memberKind =
        node.callee?.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object?.type === 'Identifier' &&
        constructors.namespaces.has(node.callee.object.name)
          ? constructorKind(node.callee.property?.name)
          : null;
      const kind = directKind ?? memberKind;
      if (!kind) return;
      const exactSource = source.slice(node.range[0], node.range[1]);
      sites.push({
        file,
        line: node.loc.start.line,
        fingerprint: fingerprint(kind, exactSource),
        kind,
      });
      return;
    }
    if (node.type !== 'ObjectExpression') return;
    const id = literal(property(node, 'id'));
    const run = property(node, 'run')?.value;
    if (
      typeof id === 'string' &&
      ['FunctionExpression', 'ArrowFunctionExpression'].includes(run?.type)
    ) {
      guardIds.add(id);
    }

    const refusal = literal(property(node, 'ok')) === false;
    const warning = property(node, 'warn') !== null;
    const code = literal(property(node, 'code'));
    const declaresDefinition = property(node, 'domain') !== null;
    const typedDisposition =
      property(node, 'remediation') !== null || property(node, 'noAutomaticRemediation') !== null;
    const vocabularyModule = file.includes('/action-decision/') || file.includes('/guidance/');
    const typedArgs = property(node, 'args') !== null;
    if (
      typeof code === 'string' &&
      !declaresDefinition &&
      (typedDisposition || typedArgs || vocabularyModule)
    ) {
      codeEmissions.push({ code, decision: refusal, line: node.loc.start.line });
    }
    for (const kind of [
      refusal && !(typeof code === 'string' && typedDisposition) ? 'refusal' : null,
      warning ? 'warning' : null,
    ]) {
      if (!kind) continue;
      const exactSource = source.slice(node.range[0], node.range[1]);
      sites.push({
        file,
        line: node.loc.start.line,
        fingerprint: fingerprint(kind, exactSource),
        kind,
      });
    }
  });
  return { guardIds: [...guardIds].sort(), sites, codeEmissions };
}

export function scanRefusalSites({ file, source }) {
  return analyzeSource({ file, source }).sites;
}

function siteKey(site) {
  return `${site.file}:${site.line}:${site.kind}`;
}

function compareSites(guardId, expected, actual, diagnostics) {
  const expectedByPosition = new Map(expected.map((site) => [siteKey(site), site]));
  const actualByPosition = new Map(actual.map((site) => [siteKey(site), site]));
  for (const site of actual) {
    const prior = expectedByPosition.get(siteKey(site));
    if (!prior) {
      diagnostics.push(`${guardId}: new unclassified ${site.kind} at ${siteKey(site)}`);
    } else if (prior.fingerprint !== site.fingerprint) {
      diagnostics.push(`${guardId}: changed legacy site at ${siteKey(site)}`);
    }
  }
  for (const site of expected) {
    if (!actualByPosition.has(siteKey(site))) {
      diagnostics.push(`${guardId}: stale legacy inventory site at ${siteKey(site)}`);
    }
  }
}

function lintCodeEmissions(analysis, diagnostics) {
  for (const emission of analysis.codeEmissions) {
    const definition = CODE_DEFINITIONS[emission.code];
    const location = `${analysis.file}:${emission.line}`;
    if (!definition) {
      diagnostics.push(`${location}: undeclared code ${emission.code}`);
      continue;
    }
    if (
      emission.decision &&
      !['decision-blocker', 'execution-normalization'].includes(definition.domain)
    ) {
      diagnostics.push(`${location}: illegal decision code ${emission.code}`);
    }
    if (analysis.guardIds.length > 0) {
      if (!definition.allowedProducerIds.includes('registered-guard')) {
        diagnostics.push(`${location}: illegal producer ${emission.code}`);
      } else if (!definition.legalPhases.includes('evaluation')) {
        diagnostics.push(`${location}: illegal phase ${emission.code}`);
      }
    }
  }
}

export function lintRefusalInventory({ inventory, sources, registeredGuardIds }) {
  const diagnostics = [];
  if (
    inventory?.version !== 1 ||
    inventory.guards === null ||
    typeof inventory.guards !== 'object'
  ) {
    return ['legacy-refusals.json: invalid inventory schema'];
  }
  const registered = new Set(registeredGuardIds);
  const actualByGuard = new Map([...registered].map((id) => [id, []]));
  const actualBySymbol = new Map();
  for (const source of sources) {
    const analysis = { file: source.file, ...analyzeSource(source) };
    lintCodeEmissions(analysis, diagnostics);
    const sourceGuardIds = new Set([...analysis.guardIds, ...(source.guardIds ?? [])]);
    for (const guardId of sourceGuardIds) {
      if (!registered.has(guardId)) continue;
      actualByGuard.get(guardId).push(...analysis.sites);
    }
    if (source.symbolId) actualBySymbol.set(source.symbolId, analysis.sites);
  }
  for (const guardId of [...registered].sort()) {
    const frozen = inventory.guards[guardId];
    if (frozen?.complete !== true || !Array.isArray(frozen.sites)) {
      diagnostics.push(`${guardId}: registered guard lacks a complete frozen inventory`);
      continue;
    }
    compareSites(guardId, frozen.sites, actualByGuard.get(guardId) ?? [], diagnostics);
  }
  for (const guardId of Object.keys(inventory.guards)) {
    if (!registered.has(guardId)) diagnostics.push(`${guardId}: inventory guard is not registered`);
  }
  for (const [symbolId, actual] of actualBySymbol) {
    const frozen = inventory.symbols?.[symbolId];
    if (frozen?.complete !== true || !Array.isArray(frozen.sites)) {
      diagnostics.push(`${symbolId}: verb boundary lacks a complete frozen inventory`);
      continue;
    }
    compareSites(symbolId, frozen.sites, actual, diagnostics);
  }
  for (const symbolId of Object.keys(inventory.symbols ?? {})) {
    if (!actualBySymbol.has(symbolId))
      diagnostics.push(`${symbolId}: inventory symbol is not scanned`);
  }
  return diagnostics.sort();
}

export function createRefusalInventory({ sources, registeredGuardIds }) {
  const registered = new Set(registeredGuardIds);
  const guards = Object.fromEntries(
    [...registered].sort().map((guardId) => [guardId, { complete: true, sites: [] }])
  );
  const symbols = {};
  for (const source of sources) {
    const analysis = analyzeSource(source);
    const sourceGuardIds = new Set([...analysis.guardIds, ...(source.guardIds ?? [])]);
    for (const guardId of sourceGuardIds) {
      if (registered.has(guardId)) guards[guardId].sites.push(...analysis.sites);
    }
    if (source.symbolId) {
      symbols[source.symbolId] = { complete: true, sites: [...analysis.sites] };
    }
  }
  for (const entry of Object.values(guards)) {
    entry.sites.sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.kind.localeCompare(right.kind)
    );
  }
  for (const entry of Object.values(symbols)) {
    entry.sites.sort(
      (left, right) =>
        left.file.localeCompare(right.file) ||
        left.line - right.line ||
        left.kind.localeCompare(right.kind)
    );
  }
  return { version: 1, guards, symbols };
}

function registeredGuardIds() {
  return [
    ...new Set(
      STATE_MACHINE.order.flatMap((state) => {
        const definition = STATE_MACHINE.get(state);
        return [...definition.entryGuards, ...definition.exitGuards].map(({ id }) => id);
      })
    ),
  ].sort();
}

function repositorySources(ids) {
  const candidates = discoverFiles({
    projectRoot: PROJECT_ROOT,
    root: 'scripts/task-tracker',
    match: /\.mjs$/,
    excludes: ['node_modules', 'tests'],
  });
  return candidates.flatMap((file) => {
    const source = readFileSync(path.join(PROJECT_ROOT, file), 'utf8');
    const guardIds = file.includes('/lib/')
      ? ids.filter((id) => source.includes(`'${id}'`) || source.includes(`"${id}"`))
      : [];
    const symbolId = V1_VERB_FILES.get(file) ?? null;
    const relevant =
      guardIds.length > 0 ||
      symbolId !== null ||
      file.includes('/action-decision/') ||
      file.includes('/guidance/');
    return relevant ? [{ file, source, guardIds, ...(symbolId ? { symbolId } : {}) }] : [];
  });
}

function runCli() {
  const ids = registeredGuardIds();
  const sources = repositorySources(ids);
  if (process.argv.includes('--print-current')) {
    process.stdout.write(
      `${JSON.stringify(createRefusalInventory({ sources, registeredGuardIds: ids }), null, 2)}\n`
    );
    return;
  }
  let inventory;
  try {
    inventory = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  } catch (error) {
    process.stderr.write(`lint:action-refusals: inventory unreadable: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const diagnostics = lintRefusalInventory({ inventory, sources, registeredGuardIds: ids });
  if (diagnostics.length > 0) {
    process.stderr.write(`lint:action-refusals: ${diagnostics.length} violation(s)\n`);
    diagnostics.forEach((diagnostic) => process.stderr.write(`  ${diagnostic}\n`));
    process.exitCode = 1;
    return;
  }
  console.log(`lint:action-refusals: ${ids.length} registered guards frozen`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) runCli();
