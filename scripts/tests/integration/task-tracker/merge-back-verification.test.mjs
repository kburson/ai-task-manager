// @story #1882
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as api from '../../../task-tracker/merge-back.mjs';

function fixture(
  t,
  verifier = "import {writeFileSync} from 'node:fs'; writeFileSync('verified.txt','verified');"
) {
  mkdirSync('.scratch', { recursive: true });
  const root = mkdtempSync(path.resolve('.scratch/merge-back-provider-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ name: 'merge-back-fixture', version: '1.0.0' })
  );
  writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      name: 'merge-back-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'merge-back-fixture', version: '1.0.0' } },
    })
  );
  writeFileSync(
    path.join(root, '.gitignore'),
    'node_modules/\nverified.txt\naffected.txt\nreceipt-head.txt\n'
  );
  writeFileSync(path.join(root, 'verify.mjs'), verifier);
  writeFileSync(
    path.join(root, 'affected.mjs'),
    "import {writeFileSync} from 'node:fs'; writeFileSync('affected.txt','affected');"
  );
  git('init', '-q');
  git('config', 'user.name', 'Merge-back fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-qm', 'fixture baseline');
  const config = {
    verificationProvider: {
      id: 'project',
      develop: {
        iterationSteps: [],
        finalSteps: [{ classification: 'lint-full', kind: 'lint', command: 'node verify.mjs' }],
      },
      test: {
        setup: 'npm-ci',
        steps: [{ classification: 'test-cloud', kind: 'test', command: 'node verify.mjs' }],
      },
    },
  };
  return { root, git, config };
}

function runner(input) {
  assert.equal(
    typeof api.createMergeBackTestRunner,
    'function',
    'registered merge-back must expose its real provider runner'
  );
  return api.createMergeBackTestRunner(input);
}

test('#1882: project verification executes configured and declared commands without default suites', (t) => {
  const { root, config } = fixture(t);
  const run = runner({
    cfg: config,
    projectDir: root,
    issueBody: '## Verification Commands\n\n- [ ] `node affected.mjs` <!-- id=1 -->\n',
  });
  assert.equal(run({ path: root }), true);
  assert.equal(readFileSync(path.join(root, 'verified.txt'), 'utf8'), 'verified');
  assert.equal(readFileSync(path.join(root, 'affected.txt'), 'utf8'), 'affected');
});

test('#1882: stale-head evidence is a failed verification, never a suite fallback', (t) => {
  const { root, git, config } = fixture(
    t,
    `import {execFileSync} from 'node:child_process'; import {readFileSync} from 'node:fs'; const actual=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); if(readFileSync('receipt-head.txt','utf8')!==actual) throw new Error('stale evidence');`
  );
  writeFileSync(path.join(root, 'receipt-head.txt'), git('rev-parse', 'HEAD'));
  const run = runner({ cfg: config, projectDir: root });
  assert.equal(run({ path: root }), true);
  writeFileSync(path.join(root, 'later.txt'), 'rebased source');
  git('add', 'later.txt');
  git('commit', '-qm', 'changed source');
  assert.equal(run({ path: root }), false);
});

test('#1882: rejected issue commands refuse plan construction before execution', (t) => {
  const { root, config } = fixture(t);
  assert.throws(
    () =>
      runner({
        cfg: config,
        projectDir: root,
        issueBody: '## Verification Commands\n\n- [ ] `git push origin trunk` <!-- id=1 -->\n',
      }),
    /rejected|verification/i
  );
  assert.equal(existsSync(path.join(root, 'verified.txt')), false);
});

test('#1882: invalid provider configuration cannot silently select Node full suites', (t) => {
  const { root, config } = fixture(t);
  config.verificationProvider.id = 'missing-provider';
  assert.throws(
    () => runner({ cfg: config, projectDir: root }),
    /unknown provider|verification-provider/
  );
});

test('#1882: a passing verifier that changes source cannot authorize integration', (t) => {
  const { root, config } = fixture(
    t,
    "import {appendFileSync} from 'node:fs'; appendFileSync('package.json',' ');"
  );
  assert.equal(runner({ cfg: config, projectDir: root })({ path: root }), false);
});

test('#1882: Node default verifies each existing suite section', (t) => {
  const { root, git } = fixture(t);
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'merge-back-fixture',
      version: '1.0.0',
      scripts: {
        'test:unit': 'node section.mjs unit',
        'test:integration': 'node section.mjs integration',
        'test:slow': 'node section.mjs slow',
      },
    })
  );
  writeFileSync(
    path.join(root, 'section.mjs'),
    "import {appendFileSync} from 'node:fs'; appendFileSync('verified.txt',process.argv[2]+'\\n');"
  );
  git('add', '.');
  git('commit', '-qm', 'default section probes');
  assert.equal(runner({ cfg: {}, projectDir: root })({ path: root }), true);
  assert.equal(readFileSync(path.join(root, 'verified.txt'), 'utf8'), 'unit\nintegration\nslow\n');
});
