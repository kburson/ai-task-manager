#!/usr/bin/env node
// @story #1202

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { DEFAULTS, formatConfig, loadConfig, setConfigValue } from '../../../config.mjs';
import { resolveMergeMechanism } from '../../../lib/full-auto-merge.mjs';
import { projectScratchDir } from '../../../lib/scratch-dir.mjs';

function fixture() {
  const dir = mkdtempSync(join(projectScratchDir('test'), 'aitm-1202-'));
  return {
    dir,
    projectPath: join(dir, 'project.json'),
    userPath: join(dir, 'user.json'),
  };
}

test('AC1/AC3: fullAutoMerge is nullable by default and explicit project policy survives load', () => {
  const fx = fixture();
  try {
    const absent = loadConfig(fx);
    assert.equal(DEFAULTS.fullAutoMerge, null);
    assert.equal(absent.fullAutoMerge, null);
    assert.equal(resolveMergeMechanism(absent).ok, false);

    const configured = {
      mechanism: 'local-trunk-lane',
      operatorAuthorized: true,
    };
    writeFileSync(fx.projectPath, JSON.stringify({ fullAutoMerge: configured }));

    const loaded = loadConfig(fx);
    assert.deepEqual(loaded.fullAutoMerge, configured);
    assert.equal(loaded._sources.fullAutoMerge, 'project');
    assert.deepEqual(resolveMergeMechanism(loaded), {
      ok: true,
      mechanism: 'local-trunk-lane',
    });
    assert.match(formatConfig(loaded), /fullAutoMerge/);
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});

test('AC2: sanctioned config setter persists an object and rejects malformed values atomically', () => {
  const fx = fixture();
  try {
    const raw = JSON.stringify({
      mechanism: 'local-trunk-lane',
      operatorAuthorized: true,
    });
    const written = setConfigValue('fullAutoMerge', raw, fx);
    assert.deepEqual(written, JSON.parse(raw));
    assert.deepEqual(loadConfig(fx).fullAutoMerge, JSON.parse(raw));

    const before = readFileSync(fx.projectPath, 'utf8');
    for (const invalid of ['not-json', 'true', '[]', 'null']) {
      assert.throws(
        () => setConfigValue('fullAutoMerge', invalid, fx),
        /JSON object/,
        `expected ${invalid} to be rejected`
      );
      assert.equal(readFileSync(fx.projectPath, 'utf8'), before);
    }
  } finally {
    rmSync(fx.dir, { recursive: true, force: true });
  }
});
