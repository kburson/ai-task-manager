#!/usr/bin/env node
// @story #1293
// Reject a discovered test entrypoint importing another discovered entrypoint:
// canonical discovery schedules each file independently, so such an edge runs
// the imported suite twice.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, VisitorKeys } from 'espree';

import { discoverTestFiles } from '../../task-tracker/lib/discover-test-files.mjs';

function relativeSpecifier(node) {
  return node?.type === 'Literal' && typeof node.value === 'string' && node.value.startsWith('.')
    ? node.value
    : null;
}

function moduleEdges(source) {
  const program = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    loc: true,
  });
  const edges = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    let specifier = null;
    let kind = null;
    if (node.type === 'ImportDeclaration') {
      specifier = relativeSpecifier(node.source);
      kind = 'import';
    } else if (node.type === 'ImportExpression') {
      specifier = relativeSpecifier(node.source);
      kind = 'dynamic import';
    } else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      specifier = relativeSpecifier(node.source);
      kind = 're-export';
    }
    if (specifier) edges.push({ specifier, kind, line: node.loc.start.line });
    for (const key of VisitorKeys[node.type] ?? []) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  };
  visit(program);
  return edges;
}

function relativePath(projectRoot, absolutePath) {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

function resolveRelativeSpecifier(importerPath, specifier) {
  try {
    return fileURLToPath(new URL(specifier, pathToFileURL(importerPath)));
  } catch {
    return null;
  }
}

export function auditTestEntrypointImports({
  projectRoot = process.cwd(),
  discover = discoverTestFiles,
  read = readFileSync,
} = {}) {
  const files = discover({ projectRoot });
  const discovered = new Set(files);
  const violations = [];
  for (const importer of files) {
    const importerPath = path.join(projectRoot, importer);
    const source = read(importerPath, 'utf8');
    for (const edge of moduleEdges(source)) {
      const targetPath = resolveRelativeSpecifier(importerPath, edge.specifier);
      if (!targetPath) continue;
      const target = relativePath(projectRoot, targetPath);
      if (discovered.has(target))
        violations.push({ importer, target, line: edge.line, kind: edge.kind });
    }
  }
  violations.sort(
    (left, right) =>
      left.importer.localeCompare(right.importer) ||
      left.line - right.line ||
      left.target.localeCompare(right.target)
  );
  return { files, violations };
}

function main() {
  const { files, violations } = auditTestEntrypointImports();
  if (violations.length === 0) {
    console.log(
      `audit-test-entrypoint-imports: no discovered test entrypoint imports among ${files.length} files.`
    );
    return 0;
  }
  console.error(
    `audit-test-entrypoint-imports: ${violations.length} discovered-entrypoint import violation(s):`
  );
  for (const { importer, target, line, kind } of violations) {
    console.error(`  ${importer}:${line} ${kind} -> ${target}`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
