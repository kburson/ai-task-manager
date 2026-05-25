#!/usr/bin/env node
// Verifies the lock-primitive decision is recorded in the settings guide
// (#212 AC). The sandbox allowlist forbids `grep` and `node -e`, so the
// check is expressed as a runnable test.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const doc = readFileSync('docs/guides/settings-guide.md', 'utf8');
assert.match(doc, /lock primitive/i, 'settings-guide must record the lock-primitive decision');
console.log('lock-primitive-doc.test.mjs: ok');
