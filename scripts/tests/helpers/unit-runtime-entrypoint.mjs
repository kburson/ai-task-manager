// @story #1857
// Test-process dependency injection only. This helper is excluded from the package.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { withUnitRuntimeRoot } from './unit-runtime-root.mjs';

const target = path.resolve(process.argv[2]);
process.argv = [process.execPath, target, ...process.argv.slice(3)];
await withUnitRuntimeRoot(() => import(pathToFileURL(target).href));
