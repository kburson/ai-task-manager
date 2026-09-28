// @story #1835
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GRAPHQL_USAGE_SCHEMAS, validateInventoryRow } from './records.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultExpectations = path.join(moduleDir, 'inventory-expectations.json');

function productionFiles(root) {
  const results = {};
  function visit(relative) {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (
          ['tests', 'fixtures', 'maintenance', 'graphql-usage', 'node_modules'].includes(entry.name)
        )
          continue;
        visit(next);
      } else if (entry.isFile() && ['.mjs', '.js', '.sh', ''].includes(path.extname(entry.name))) {
        results[next] = readFileSync(path.join(root, next), 'utf8');
      }
    }
  }
  for (const dir of ['bin', 'scripts', 'hooks', 'statusline']) {
    try {
      visit(dir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return results;
}

function classify(line, source) {
  const value = line.trim();
  if (!value || value.startsWith('//') || value.startsWith('#') || value.startsWith('*'))
    return null;
  const shell = source.endsWith('.sh');
  const dispatchSyntax = ['exec', 'spawn', 'gh(', 'gql('].some((term) => value.includes(term));
  if (
    !shell &&
    !dispatchSyntax &&
    ['gh api ', 'gh issue ', 'gh project ', 'gh pr ', 'gh repo ', 'gh auth '].some((term) =>
      value.includes(term)
    )
  )
    return ['out-of-scope', 'static command text without dispatch evidence', 'out-of-scope'];
  if (source === 'scripts/task-tracker/action-capture-bin/gh' && value.includes('spawn(realGh'))
    return ['uncovered', 'shared action capture shim lacks usage observation', 'uncovered'];
  if (value.includes('api.github.com/graphql') || value.includes('graphql.github.com'))
    return ['direct-http', 'direct GraphQL HTTP endpoint', 'planned'];
  if (/['"]\/[A-Za-z0-9_./-]*gh['"]/.test(value) && /(exec|spawn|\bgh\b)/.test(value))
    return ['uncovered', 'absolute gh executable bypasses inherited PATH', 'uncovered'];
  if (/\$\{?GH_[A-Za-z_]*\}?\s+api\s+graphql/.test(value))
    return ['uncovered', 'environment selected gh executable may bypass PATH', 'uncovered'];
  if (
    /\bgh\s+api\s+graphql\b/.test(value) ||
    /['"]api['"]\s*,\s*['"]graphql['"]/.test(value) ||
    /\b(?:gql)\s*\(/.test(value)
  )
    return ['gh-api-graphql', 'explicit GraphQL CLI or shared gql wrapper', 'planned'];
  if (/\bgh\s+api\s+(?!graphql\b)/.test(value) || /['"]api['"]\s*,\s*['"]repos\//.test(value))
    return ['rest-or-non-graphql', 'explicit REST or non GraphQL endpoint', 'out-of-scope'];
  if (/\b(?:run|runCommand)\s*\(\s*['"]gh['"]/.test(value))
    return [
      'uncovered',
      'dynamic gh wrapper arguments require runtime classification',
      'uncovered',
    ];
  if (
    /\bgh\s+(?:issue|project|pr|repo|auth)\b/.test(value) ||
    /(?:execFile|execFileSync|spawn|spawnSync)\s*\(\s*['"]gh['"]/.test(value) ||
    /\bgh\s*\(/.test(value)
  )
    return ['opaque-gh-cli', 'high level gh CLI invocation hides request attempts', 'opaque'];
  if (value.includes('resolveRealGhExecutable') || value.includes('runCapturedGh'))
    return ['opaque-gh-cli', 'shared action capture shim process boundary', 'opaque'];
  return null;
}

export function scanGraphqlSurfaces({ root, files } = {}) {
  if (!files) files = productionFiles(root);
  const rows = [];
  for (const [source, content] of Object.entries(files)) {
    const lines = content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      let candidate = lines[index];
      let consumed = index;
      if (candidate.trimEnd().endsWith('\\') && !candidate.includes('gh api graphql')) {
        let next = index + 1;
        while (next < lines.length && candidate.trimEnd().endsWith('\\')) {
          candidate = candidate.trimEnd().slice(0, -1) + ' ' + lines[next].trim();
          next += 1;
        }
        consumed = next - 1;
      } else if (
        ['execFileSync(', 'execFile(', 'spawnSync(', 'spawn(', 'run(', 'runCommand('].some((call) =>
          candidate.includes(call)
        ) &&
        !candidate.includes(');')
      ) {
        let next = index + 1;
        while (next < lines.length && next < index + 12 && !candidate.includes(');')) {
          candidate += ' ' + lines[next].trim();
          next += 1;
        }
        consumed = next - 1;
      }
      const result = classify(candidate, source);
      if (!result) {
        index = consumed;
        continue;
      }
      const [classification, reason, coverage] = result;
      rows.push(
        validateInventoryRow({
          schemaVersion: GRAPHQL_USAGE_SCHEMAS.inventory,
          source,
          line: index + 1,
          classification,
          reason,
          coverage,
        })
      );
      index = consumed;
    }
  }
  return rows.sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line);
}

export function inventorySummary(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = [row.source, row.classification, row.coverage].join('|');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
}

export function inventorySites(rows) {
  return rows
    .map((row) => [row.source, row.line, row.classification, row.coverage].join('|'))
    .sort();
}

export function compareInventory(rows, { expectationsPath = defaultExpectations } = {}) {
  const inventory = JSON.parse(readFileSync(expectationsPath, 'utf8'));
  const expected = inventory.surfaces;
  const actual = inventorySummary(rows);
  const expectedMap = new Map(expected.map(({ key, count }) => [key, count]));
  const actualMap = new Map(actual.map(({ key, count }) => [key, count]));
  const keys = new Set([...expectedMap.keys(), ...actualMap.keys()]);
  const differences = [...keys]
    .sort()
    .flatMap((key) =>
      expectedMap.get(key) === actualMap.get(key)
        ? []
        : [{ key, expected: expectedMap.get(key) ?? 0, actual: actualMap.get(key) ?? 0 }]
    );
  const expectedSites = new Set(inventory.sites);
  const actualSites = new Set(inventorySites(rows));
  for (const site of new Set([...expectedSites, ...actualSites])) {
    if (expectedSites.has(site) !== actualSites.has(site))
      differences.push({ site, expected: expectedSites.has(site), actual: actualSites.has(site) });
  }
  return differences;
}
