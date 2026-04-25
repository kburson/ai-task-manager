#!/usr/bin/env node
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig, setConfigValue, DEFAULTS } from '../config.mjs';

const tmp = mkdtempSync(path.join(tmpdir(), 'tt-config-'));
const projectPath = path.join(tmp, 'project.json');
const userPath = path.join(tmp, 'user.json');

// Test 1: defaults when no files exist
let cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 180, 'default wpm');
assert.equal(cfg.repo, '', 'default repo is empty (set by init)');
assert.equal(cfg._sources.wpm, 'default');

// Test 2: user-global overrides default
writeFileSync(userPath, JSON.stringify({ wpm: 200 }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 200);
assert.equal(cfg._sources.wpm, 'user');

// Test 3: project-local overrides user-global
writeFileSync(projectPath, JSON.stringify({ wpm: 150 }));
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 150);
assert.equal(cfg._sources.wpm, 'project');

// Test 4: setConfigValue writes project-local
setConfigValue('wpm', '175', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.wpm, 175);

// Test 5: type coercion
setConfigValue('autoEndOnSwitch', 'false', { projectPath, userPath });
cfg = loadConfig({ projectPath, userPath });
assert.equal(cfg.autoEndOnSwitch, false);

// Test 6: unknown key rejected
assert.throws(() => setConfigValue('bogus', 'x', { projectPath, userPath }), /unknown config key/i);

// Test 7: bad type rejected
assert.throws(() => setConfigValue('wpm', 'abc', { projectPath, userPath }), /numeric/i);

rmSync(tmp, { recursive: true });
console.log('config.test.mjs: all passed');
