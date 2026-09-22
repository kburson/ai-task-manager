#!/usr/bin/env node
// @story #1672
// Publisher-only fingerprint generation. Runtime checks this file; it never restamps it.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'espree';

import { decodeGuidanceSource } from '../../guidance/positions.mjs';
import { certifyGuidanceCache } from './certify-guidance-cache.mjs';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CATALOG = 'instructions/aitm-guidance.yml';
const MANIFEST = 'instructions/aitm-guidance.release.json';

function digest(source) {
  return `sha256:${createHash('sha256').update(decodeGuidanceSource(source), 'utf8').digest('hex')}`;
}

export function expectedGuidanceRelease(packageRoot = DEFAULT_ROOT) {
  const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (pkg.name !== '@kburson/ai-task-manager' || pkg.dependencies?.['js-yaml'] !== '5.4.2') {
    throw new Error('guidance-release-package-identity-invalid');
  }
  return {
    schema: 'aitm.guidance-release/v1',
    package: pkg.name,
    packageVersion: pkg.version,
    catalogPath: CATALOG,
    catalogFileDigest: digest(readFileSync(path.join(packageRoot, CATALOG))),
    parser: { name: 'js-yaml', version: '5.4.2' },
    compiler: { name: 'aitm-guidance', version: 1, adapter: 'js-yaml-events-v1' },
  };
}

export function checkGuidanceRelease(packageRoot = DEFAULT_ROOT) {
  const expected = `${JSON.stringify(expectedGuidanceRelease(packageRoot), null, 2)}\n`;
  let actual;
  try {
    actual = readFileSync(path.join(packageRoot, MANIFEST), 'utf8');
  } catch {
    return { ok: false, code: 'guidance-release-manifest-unavailable' };
  }
  return actual === expected
    ? { ok: true, code: null }
    : { ok: false, code: 'guidance-release-manifest-disagreement' };
}

function shippedRuntimeFiles(packageRoot) {
  const files = [];
  for (const directory of ['bin', 'scripts', 'guidance']) {
    const stack = [path.join(packageRoot, directory)];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        const relative = path.relative(packageRoot, absolute).replaceAll(path.sep, '/');
        if (entry.isDirectory()) {
          if (relative === 'scripts/tests' || relative === 'scripts/maintenance') continue;
          stack.push(absolute);
        } else if (entry.isFile() && /\.[cm]?js$/.test(entry.name)) {
          files.push(relative);
        }
      }
    }
  }
  return files.sort();
}

function importSpecifiers(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const specifiers = [];
  const stack = [ast];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (
      ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
    ) {
      if (typeof node.source?.value === 'string') specifiers.push(node.source.value);
    } else if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') {
      specifiers.push(node.source.value);
    } else if (
      node.type === 'CallExpression' &&
      node.callee?.name === 'require' &&
      typeof node.arguments?.[0]?.value === 'string'
    ) {
      specifiers.push(node.arguments[0].value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object') stack.push(value);
    }
  }
  return specifiers;
}

function isLoaderImport(packageRoot, file, specifier) {
  const target = specifier.startsWith('.')
    ? path.resolve(packageRoot, path.dirname(file), specifier)
    : specifier.startsWith('@kburson/ai-task-manager/')
      ? path.join(packageRoot, specifier.slice('@kburson/ai-task-manager/'.length))
      : null;
  if (!target) return false;
  return ['guidance/source.mjs', 'guidance/admission.mjs', 'guidance/cache.mjs'].some(
    (relative) => target === path.join(packageRoot, relative)
  );
}

/** Scan every shipped runtime module, including indirect loader consumers. */
export function assertGuidanceConsumerRelease(packageRoot = DEFAULT_ROOT) {
  const agreement = checkGuidanceRelease(packageRoot);
  if (!agreement.ok) throw new Error(agreement.code);
  const recoveryOnly = new Set([
    'guidance/source.mjs',
    'guidance/admission.mjs',
    'guidance/cache.mjs',
    'scripts/task-tracker/guidance.mjs',
  ]);
  const consumers = shippedRuntimeFiles(packageRoot).filter((relative) => {
    if (recoveryOnly.has(relative)) return false;
    const source = readFileSync(path.join(packageRoot, relative), 'utf8');
    // Computed import targets cannot be resolved statically. Fail closed when
    // a shipped runtime module constructs a guidance loader path, even when
    // `import(target)` has no literal module specifier.
    if (
      /guidance[\s\S]{0,160}(?:admission|source|cache)\.mjs|(?:admission|source|cache)\.mjs[\s\S]{0,160}guidance/.test(
        source
      )
    )
      return true;
    return importSpecifiers(source).some((specifier) =>
      isLoaderImport(packageRoot, relative, specifier)
    );
  });
  if (consumers.length > 0) {
    const certification = certifyGuidanceCache(packageRoot);
    return { ok: true, consumers, certification };
  }
  return { ok: true, consumers: [] };
}

function main(argv) {
  const [mode] = argv;
  if (argv.length !== 1 || !['--write', '--check', '--assert-consumer-release'].includes(mode)) {
    process.stderr.write(
      'Usage: node scripts/maintenance/generate-guidance-release.mjs ' +
        '<--write|--check|--assert-consumer-release>\n'
    );
    return 2;
  }
  if (mode === '--write') {
    writeFileSync(
      path.join(DEFAULT_ROOT, MANIFEST),
      `${JSON.stringify(expectedGuidanceRelease(), null, 2)}\n`
    );
    process.stdout.write(`${MANIFEST} updated by explicit maintenance command\n`);
    return 0;
  }
  if (mode === '--assert-consumer-release') {
    const result = assertGuidanceConsumerRelease();
    process.stdout.write(
      result.consumers.length > 0
        ? 'guidance consumer release certified: cross-process B2 cache and production package\n'
        : 'guidance consumer release check: no loader consumers\n'
    );
    return 0;
  }
  const result = checkGuidanceRelease();
  if (!result.ok) throw new Error(result.code);
  process.stdout.write('guidance release manifest agrees with catalog and parser\n');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
