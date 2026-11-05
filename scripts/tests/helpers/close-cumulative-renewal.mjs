// @story #2165 — all renewal actions use the real public CLI and native writers.
import assert from 'node:assert/strict';
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  lstatSync,
  readlinkSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { getActiveTask } from '../../task-tracker/session-state.mjs';
import { parseVerificationReceipt } from '../../task-tracker/lib/verification-receipt.mjs';
import {
  findCommitTrailComment,
  parseCommitShas,
} from '../../task-tracker/lib/code-complete-gate.mjs';
import { canonicalRecordJson } from '../../task-tracker/lib/github-records/canonical-json.mjs';
import { qualifyCumulativeAdmission } from './close-cumulative-admission.mjs';

const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
function inventory(dir) {
  const result = [];
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory())
      for (const [name, digest] of inventory(file)) result.push([entry.name + '/' + name, digest]);
    else if (entry.isFile()) result.push([entry.name, hash(file)]);
  }
  return result.sort(([a], [b]) => a.localeCompare(b));
}
function tracked(root) {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .sort()
    .map((file) => {
      const full = path.join(root, file);
      if (!existsSync(full)) return [file, { missing: true }];
      const stat = lstatSync(full);
      return [
        file,
        { mode: stat.mode, data: stat.isSymbolicLink() ? readlinkSync(full) : hash(full) },
      ];
    });
}
function snapshot(f, second, sid) {
  const git = (root, ...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  return {
    head: f.git('rev-parse', 'HEAD'),
    branch: f.git('branch', '--show-current'),
    status: f.git('status', '--porcelain=v1', '--untracked-files=all'),
    index: hash(path.join(f.root, '.git/index')),
    tracked: tracked(f.root),
    objects: inventory(path.join(f.root, '.git/objects')),
    refs: f.git('show-ref'),
    session: inventory(path.join(f.root, '.tmp/aitm')),
    runtime: inventory(path.join(f.root, '.ai-task-manager/runtime/store')),
    provider: hash(f.stateFile),
    second: {
      head: git(second, 'rev-parse', 'HEAD'),
      branch: git(second, 'branch', '--show-current'),
      status: git(second, 'status', '--porcelain=v1', '--untracked-files=all'),
      session: inventory(path.join(second, '.tmp/aitm')),
      index: hash(git(second, 'rev-parse', '--path-format=absolute', '--git-path', 'index')),
      tracked: tracked(second),
      runtime: inventory(path.join(second, '.ai-task-manager/runtime/store')),
    },
    binding: getActiveTask(sid, f.root),
  };
}
function assertSecondContainment(f, second, sid) {
  const urls = Object.fromEntries(
    ['paths', 'runtime-storage', 'test-sandbox-reaper', 'word-counter'].map((name) => [
      name,
      new URL(
        name === 'paths'
          ? '../../task-tracker/paths.mjs'
          : name === 'word-counter'
            ? '../../task-tracker/word-counter.mjs'
            : '../../task-tracker/lib/' + name + '.mjs',
        import.meta.url
      ).href,
    ])
  );
  const code = `import assert from 'node:assert/strict';import path from 'node:path';import * as p from ${JSON.stringify(urls.paths)};import{readPhysicalRuntimeIdentity,runtimeStoragePaths,resolveRuntimeRootOverride}from ${JSON.stringify(urls['runtime-storage'])};import{testSandboxDirectory}from ${JSON.stringify(urls['test-sandbox-reaper'])};import{currentSessionId}from ${JSON.stringify(urls['word-counter'])};const root=process.cwd(),main=${JSON.stringify(f.root)},sid=currentSessionId(),identity=readPhysicalRuntimeIdentity(root);assert.equal(sid,${JSON.stringify(sid)});assert.equal(identity.mainRoot,main);assert.equal(identity.worktreeIdentity.commonDir,path.join(main,'.git'));assert.equal(resolveRuntimeRootOverride(),null);const layout=runtimeStoragePaths({projectRoot:root,mainRoot:main});const owned=[p.activeTaskPath(sid,root),p.sessionDir(sid,root),p.statePath(root),p.queuePath(root),p.fleetPath(main),p.occupancyPath(main),p.timingLockPath('1879',main),p.issueLockPath('1879',main),testSandboxDirectory(root),...['localRuntimeRoot','sharedRuntimeRoot','localRoot','sharedRoot','controlPath','sharedControlPath','migrationRoot'].map(key=>layout[key])];for(const file of owned){const relative=path.relative(main,file);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),file);}console.log(JSON.stringify({identity,sid,owned}));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: second,
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  writeFileSync(path.join(path.dirname(f.stateFile), 'second-containment.json'), result.stdout);
}
export async function renewCumulativeOperator(f, check, initialBinding, initialReceipt) {
  const sid = f.sid;
  const selected = ['--artifact-commit', f.f.head];
  const originalDeliveryReceipt = f.read().receipt,
    historicalDeliveryComments = f
      .read()
      .issues[1878].comments.nodes.filter((c) => c.id.startsWith('IC_fixture_historical_'));
  const executionOffset = readFileSync(f.executionFile, 'utf8').trim().split('\n').length;
  const historical = canonicalRecordJson(initialReceipt);
  const historyFile = path.join(path.dirname(f.stateFile), 'historical-test-receipt.json');
  writeFileSync(historyFile, historical);
  const second = path.join(f.root, '.ai-task-manager/runtime/second-operator');
  f.git('worktree', 'add', '-q', '-b', 'feature/1879', second, f.f.head);
  assertSecondContainment(f, second, sid);
  check(['pause', 'Switch to the second isolated fixture operator']);
  check(['start', '1879', '--role', 'agent'], { cwd: second });
  const switched = getActiveTask(sid, second);
  assert.equal(switched.issue, '#1879');
  assert.equal(switched.worktreePath, second);
  check(['start', '1878', '--role', 'agent']);
  const resumed = getActiveTask(sid, f.root);
  assert.equal(resumed.issue, '#1878');
  assert.notEqual(resumed.bindingGenerationId, initialBinding.bindingGenerationId);
  assert.equal(
    canonicalRecordJson(parseVerificationReceipt(f.read().issues[1878].body, 'test')),
    historical
  );
  const stale = check(['explain', '1878', ...selected, '--json'], { trace: true });
  const staleResult = JSON.parse(stale.stdout).result;
  assert.equal(staleResult.status, 'indeterminate', stale.stdout);
  assert.ok(
    staleResult.blockers.some((row) => row.code === 'authority-read-failed'),
    stale.stdout
  );
  assert.equal(stale.stderr.includes('closeCumulativeTrace'), false);
  check([
    'demote',
    '1878',
    '--rework',
    'Integrate the fixture-delivered runtime implementation while preserving the accepted immutable artifact',
  ]);
  qualifyCumulativeAdmission(f, second, sid);
  f.git('checkout', '-q', '-b', 'delivered-runtime', f.f.merged);
  writeFileSync(
    path.join(f.root, 'runtime.mjs'),
    'export function runtimeProofVersion(){return 2;}\n'
  );
  f.git('add', 'runtime.mjs');
  f.git('commit', '-qm', '[#1879] Deliver fixture runtime implementation');
  const repair = f.git('rev-parse', 'HEAD');
  f.git('push', '-q', 'origin', repair + ':refs/heads/trunk');
  f.git('fetch', '-q', 'origin', 'trunk');
  f.git('checkout', '-q', 'feature/1878');
  f.git(
    'merge',
    '--no-ff',
    '-m',
    '[#1878] Integrate fixture-delivered runtime implementation',
    repair
  );
  const integrated = f.git('rev-parse', 'HEAD');
  assert.notEqual(integrated, f.f.head);
  assert.equal(
    f.git('show', integrated + ':runtime.mjs'),
    'export function runtimeProofVersion(){return 2;}'
  );
  const nameList = f.git('show', '--format=', '--name-only', integrated);
  check(['commit-trace', '1878']);
  const trail = () =>
    parseCommitShas(findCommitTrailComment(f.read().issues[1878].comments.nodes)?.body);
  assert.ok(trail().includes(integrated));
  check(['commit-trace', '1878', ...selected]);
  assert.ok(trail().includes(integrated));
  check(['ac-stamp', 'Accepted prefix and suffix remain present.', ...selected]);
  check(['ensureChecked', 'Accepted prefix and suffix remain present.', ...selected]);
  const dirtyFile = path.join(f.root, 'scripts/tests/unit/fixture/source.test.mjs'),
    cleanBytes = readFileSync(dirtyFile);
  const providerBeforeDirty = hash(f.stateFile);
  writeFileSync(
    dirtyFile,
    Buffer.concat([cleanBytes, Buffer.from('\n// Uncommitted fixture change\n')])
  );
  const dirtyRefusal = f.run(['promote', '1878', ...selected]);
  assert.notEqual(dirtyRefusal.status, 0);
  assert.match(dirtyRefusal.stdout + dirtyRefusal.stderr, /code-complete-dirty-files/);
  assert.equal(
    hash(f.stateFile),
    providerBeforeDirty,
    'refused dirty promotion must not write provider state'
  );
  writeFileSync(dirtyFile, cleanBytes);
  const providerBeforeSource = hash(f.stateFile);
  const wrongSource = f.run([
    'ac-stamp',
    'Accepted prefix and suffix remain present.',
    '--artifact-commit',
    f.f.prefixHead,
  ]);
  assert.notEqual(
    wrongSource.status,
    0,
    'prefix without accepted suffix must fail actual artifact verification'
  );
  assert.equal(
    hash(f.stateFile),
    providerBeforeSource,
    'failed source verification must not publish evidence'
  );
  assert.equal(f.git('status', '--porcelain=v1', '--untracked-files=all'), '');
  check(['promote', '1878', ...selected]);
  const renewed = parseVerificationReceipt(f.read().issues[1878].body, 'test');
  assert.equal(renewed.commitSha, f.f.head);
  assert.equal(renewed.artifactSubject.commitSha, f.f.head);
  assert.equal(renewed.artifactSubject.treeSha, f.git('rev-parse', f.f.head + '^{tree}'));
  assert.equal(renewed.operatorContext.headSha, integrated);
  assert.equal(renewed.operatorContext.bindingGenerationId, resumed.bindingGenerationId);
  assert.equal(renewed.operatorContext.sessionId, sid);
  assert.equal(renewed.operatorContext.worktreePath, f.root);
  assert.equal(renewed.operatorContext.branch, 'feature/1878');
  assert.equal(renewed.operatorContext.boundIssue, 1878);
  assert.equal(readFileSync(historyFile, 'utf8'), historical);
  const executions = readFileSync(f.executionFile, 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse)
    .slice(executionOffset);
  for (const script of [
    'lint',
    'format:check',
    'test:unit',
    'test:integration',
    'test:slow',
    'node-verify',
  ])
    assert.ok(
      executions.some(
        (row) => row.script === script && row.head === f.f.head && row.prefix && row.suffix
      ),
      'missing actual renewed fixture verifier execution: ' + script
    );
  assert.ok(executions.every((row) => row.head === f.f.head));
  check(['promote', '1878', ...selected]);
  check(['approve', '1878', ...selected], { env: { TT_FULL_AUTO: '1' } });
  assert.equal(canonicalRecordJson(f.read().receipt), canonicalRecordJson(originalDeliveryReceipt));
  assert.deepEqual(
    f.read().issues[1878].comments.nodes.filter((c) => c.id.startsWith('IC_fixture_historical_')),
    historicalDeliveryComments
  );
  const results = [];
  for (const args of [
    ['explain', '1878', ...selected, '--json'],
    ['close', '1878', '--explain', '--json', ...selected],
  ]) {
    const runReadOnly = (options) => {
      const before = snapshot(f, second, sid),
        result = check(args, options),
        after = snapshot(f, second, sid);
      writeFileSync(
        path.join(path.dirname(f.stateFile), 'read-only-snapshots.jsonl'),
        JSON.stringify({
          args,
          trace: options.trace === true,
          wrapperOnly: options.wrapperOnly === true,
          before,
          after,
        }) + '\n',
        { flag: 'a' }
      );
      assert.deepEqual(
        after,
        before,
        'public Explain must leave both operators and semantic provider state unchanged'
      );
      return result;
    };
    const wrapperOnly = runReadOnly({ wrapperOnly: true });
    assert.equal(
      wrapperOnly.stderr.includes('closeCumulativeTrace'),
      false,
      'wrapper-only --import must not be mistaken for child observation'
    );
    const bootstrapOverride = {
      NODE_OPTIONS: '--require ' + JSON.stringify(path.join(f.root, '.tmp/must-not-load.cjs')),
      NODE_TEST_CONTEXT: 'child-v8',
    };
    const unobserved = runReadOnly({ env: bootstrapOverride });
    assert.equal(
      unobserved.stderr.includes('closeCumulativeTrace'),
      false,
      'non-trace overlay must not install observer'
    );
    const result = runReadOnly({ trace: true, env: bootstrapOverride });
    assert.deepEqual(
      JSON.parse(result.stdout),
      JSON.parse(unobserved.stdout),
      'observer must preserve public result'
    );
    assert.deepEqual(
      JSON.parse(wrapperOnly.stdout),
      JSON.parse(unobserved.stdout),
      'public wrapper behavior must remain unchanged'
    );
    const trace = result.stderr.split('\n').flatMap((line) => {
      try {
        const value = JSON.parse(line);
        return value.closeCumulativeTrace ? [value] : [];
      } catch {
        return [];
      }
    });
    const entry = trace.filter((row) => row.closeCumulativeTrace === 'entry');
    const thrown = trace.filter((row) => row.closeCumulativeTrace === 'throw');
    assert.equal(entry.length, 1, result.stdout + result.stderr);
    assert.equal(thrown.length, 1);
    assert.deepEqual(entry[0].input, {
      method: 'squash',
      sourceBase: f.f.sourceBase,
      sourceHead: f.f.head,
      integrationBase: f.f.integrationBase,
      integrationHead: f.f.merged,
    });
    assert.equal(thrown[0].error.message, 'close-readiness:content-proof-unavailable');
    results.push({ args, status: JSON.parse(result.stdout).result.status, trace });
  }
  writeFileSync(
    path.join(path.dirname(f.stateFile), 'renewal-qualification.json'),
    JSON.stringify(
      {
        synthetic: true,
        realHostRecovery: false,
        initialBinding,
        resumed,
        selectedSource: f.f.head,
        repair,
        integrated,
        nameList,
        trail: trail(),
        initialReceipt,
        renewed,
        results,
      },
      null,
      2
    )
  );
  return { second, resumed, integrated, results };
}
