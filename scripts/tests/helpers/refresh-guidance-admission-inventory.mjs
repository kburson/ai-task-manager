#!/usr/bin/env node
// @story #1857
// Refresh only source-derived static imports; routes and admission classifications stay review-owned.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'espree';
import prettier from 'prettier';
const root = path.resolve(import.meta.dirname, '../../..');
const inventoryPath = path.join(root, 'scripts/tests/fixtures/1558/admission-surface.json');
export function currentAdmissionInventory() {
  const inventory = JSON.parse(readFileSync(inventoryPath));
  for (const entry of inventory.entrypoints) {
    entry.staticImports = parse(readFileSync(path.join(root, entry.path), 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'module',
    })
      .body.filter(({ type }) => type === 'ImportDeclaration')
      .map(({ source }) => source.value);
  }
  return inventory;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv.length !== 3 || !['--write', '--check'].includes(process.argv[2]))
    throw new Error('usage: refresh-guidance-admission-inventory.mjs --write|--check');
  const bytes = await prettier.format(JSON.stringify(currentAdmissionInventory()), {
    parser: 'json',
    printWidth: 100,
  });
  if (process.argv[2] === '--write') writeFileSync(inventoryPath, bytes);
  else if (readFileSync(inventoryPath, 'utf8') !== bytes)
    throw new Error('guidance admission static imports drift');
}
