// @story #1852
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { mkdtempProjectIsolated } from '../../../../task-tracker/lib/scratch-dir.mjs';
import { authorityResult } from '../../../fixtures/criteria-revision-runtime.mjs';
import {
  withIssueLock,
  withAuthenticatedRevisionIssueLock,
  issueLockPath,
} from '../../../../task-tracker/issue-mutator-lock.mjs';
const domain = await import('../../../../task-tracker/lib/criteria-revision/domain.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const lock = await import('../../../../task-tracker/lib/criteria-revision/interlock.mjs').catch(
  (e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  }
);
const admission =
  await import('../../../../task-tracker/lib/criteria-revision/admission.mjs').catch((e) => {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw e;
  });
function fixture(t) {
  const root = mkdtempProjectIsolated('revision-interlock-');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'first'),
    second = path.join(root, 'second');
  fs.mkdirSync(first);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();
  git(first, 'init', '-q');
  git(first, 'config', 'user.name', 'Fixture');
  git(first, 'config', 'user.email', 'fixture@example.invalid');
  git(first, 'remote', 'add', 'origin', 'https://github.com/owner/repo.git');
  git(first, 'commit', '--allow-empty', '-qm', 'fixture');
  git(first, 'worktree', 'add', '-qb', 'second', second);
  const common = fs.realpathSync(path.join(first, '.git'));
  const ports = { configRoot: path.join(root, 'host-config'), worktree: first };
  const context = {
    repository: 'owner/repo',
    issues: [1852],
    issue: 1852,
    executor: {
      adapter: 'codex-session/v1',
      sessionId: 'fixture-session',
      worktree: first,
      branch: git(first, 'branch', '--show-current'),
    },
  };
  return { root, first, second, common, ports, context, git };
}
function register(r) {
  r.context.domain = domain.registerRevisionDomain(
    {
      repository: 'owner/repo',
      commonDir: r.common,
      host: domain.revisionRuntime(r.ports).inspect(r.first).hostId,
      quiescenceConfirmed: true,
    },
    r.ports
  );
}
test('real linked worktrees and symlinks share deny state and strict issue locks', async (t) => {
  assert.equal(typeof lock.withRevisionInterlock, 'function');
  const r = fixture(t);
  register(r);
  const alias = path.join(r.root, 'alias');
  fs.symlinkSync(r.second, alias);
  const otherPorts = { ...r.ports, worktree: alias },
    other = {
      ...r.context,
      executor: { ...r.context.executor, worktree: alias, branch: 'second' },
    };
  assert.equal(domain.resolveRevisionDomain(other, otherPorts).commonDirectory, r.common);
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await admission.publishAdmission(
        { capability, observation: { issue: 1852 }, state: 'deny' },
        r.ports
      );
      assert.equal(admission.readAdmission(other, otherPorts).state, 'deny');
      await assert.rejects(
        lock.withRevisionInterlock(other, () => {}, otherPorts),
        /revision-lock-held/
      );
    },
    r.ports
  );
  await lock.withRevisionInterlock(
    other,
    (capability) =>
      admission.observeAdmission(
        { capability, context: other, observe: () => authorityResult(other, other.domain) },
        otherPorts
      ),
    otherPorts
  );
  await admission.refreshAdmission(
    { context: other, observe: () => authorityResult(other, other.domain) },
    otherPorts
  );
  assert.equal(admission.readAdmission(r.context, r.ports).state, 'allow');
});
test('independent clones and foreign runtime hosts cannot register the admitted repository', (t) => {
  const r = fixture(t);
  register(r);
  const clone = path.join(r.root, 'clone');
  r.git(r.root, 'clone', '-q', r.first, clone);
  r.git(clone, 'remote', 'set-url', 'origin', 'https://github.com/owner/repo.git');
  assert.throws(
    () =>
      domain.registerRevisionDomain(
        {
          repository: 'owner/repo',
          commonDir: path.join(clone, '.git'),
          host: domain.revisionRuntime(r.ports).inspect(r.first).hostId,
          quiescenceConfirmed: true,
        },
        { ...r.ports, worktree: clone }
      ),
    /domain-mismatch/
  );
  assert.throws(
    () =>
      domain.registerRevisionDomain(
        {
          repository: 'owner/repo',
          commonDir: r.common,
          host: 'foreign-host',
          quiescenceConfirmed: true,
        },
        r.ports
      ),
    /domain-runtime-mismatch/
  );
});
test('strict-before-issue order is enforced and disabled issue-lock behavior is preserved', async (t) => {
  const r = fixture(t);
  register(r);
  await withIssueLock({ issue: 1852, projDir: r.first }, async () => {
    await assert.rejects(
      lock.withRevisionInterlock(r.context, () => {}, r.ports),
      /revision-lock-order/
    );
  });
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await withAuthenticatedRevisionIssueLock(
        {
          issue: 1852,
          projDir: r.first,
          revisionContext: r.context,
          revisionCapability: capability,
          revisionPorts: r.ports,
        },
        async () => {
          assert.equal(fs.existsSync(issueLockPath(1852, r.first)), true);
        }
      );
    },
    r.ports
  );
});
test('a real authenticated child reuses parent locks; fake flags and copied capability do not', async (t) => {
  const r = fixture(t);
  register(r);
  const moduleURL = pathToFileURL(
    path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
  ).href;
  const issueURL = pathToFileURL(path.resolve('scripts/task-tracker/issue-mutator-lock.mjs')).href;
  const childFile = path.join(r.root, 'child.mjs');
  fs.writeFileSync(
    childFile,
    `import {withRevisionDelegation,withRevisionInterlock,assertRevisionCapability} from ${JSON.stringify(moduleURL)};import {withAuthenticatedRevisionIssueLock,issueLockPath} from ${JSON.stringify(issueURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);if(process.argv[4]==='fake'){try{await withRevisionInterlock({...c,capability:{}},()=>{},p);process.exitCode=7;}catch(e){if(!/revision-capability|revision-lock-held/.test(e.message))throw e;}}else{await withRevisionDelegation(c,async capability=>{assertRevisionCapability(capability,c,p);await withRevisionInterlock({...c,capability},async()=>{await withAuthenticatedRevisionIssueLock({issue:1852,projDir:c.executor.worktree,revisionContext:c,revisionCapability:capability,revisionPorts:p},()=>{});},p);},p);}`
  );
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await withAuthenticatedRevisionIssueLock(
        {
          issue: 1852,
          projDir: r.first,
          revisionContext: r.context,
          revisionCapability: capability,
          revisionPorts: r.ports,
        },
        async () => {
          await lock.spawnRevisionDelegate(capability, childFile, [
            JSON.stringify(r.context),
            JSON.stringify(r.ports),
          ]);
        }
      );
      const child = spawn(
        process.execPath,
        [childFile, JSON.stringify(r.context), JSON.stringify(r.ports), 'fake'],
        {
          env: { ...process.env, AITM_ISSUE_LOCK_HELD: '1852', AITM_REVISION_LOCK_HELD: '1' },
          stdio: 'pipe',
        }
      );
      let stderr = '';
      child.stderr.on('data', (x) => (stderr += x));
      assert.equal(await new Promise((resolve) => child.on('exit', resolve)), 0, stderr);
    },
    r.ports
  );
});
test('issue-lock acquisition respects numeric order inside an expanded strict scope', async (t) => {
  const r = fixture(t);
  register(r);
  r.context.issues = [2, 1852];
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await withAuthenticatedRevisionIssueLock(
        {
          issue: 1852,
          projDir: r.first,
          revisionContext: r.context,
          revisionCapability: capability,
          revisionPorts: r.ports,
        },
        async () => {
          await assert.rejects(
            withAuthenticatedRevisionIssueLock(
              {
                issue: 2,
                projDir: r.first,
                revisionContext: r.context,
                revisionCapability: capability,
                revisionPorts: r.ports,
              },
              () => {}
            ),
            /revision-lock-order/
          );
        }
      );
    },
    r.ports
  );
});
test('delegated capability is revoked when the parent invocation ends', async (t) => {
  const r = fixture(t);
  register(r);
  const moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href,
    childFile = path.join(r.root, 'expiry.mjs'),
    ready = path.join(r.root, 'ready'),
    finish = path.join(r.root, 'finish');
  fs.writeFileSync(
    childFile,
    `import fs from 'node:fs';import assert from 'node:assert/strict';import {withRevisionDelegation,assertRevisionCapability} from ${JSON.stringify(moduleURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);await withRevisionDelegation(c,async cap=>{fs.writeFileSync(process.argv[4],'ready');while(!fs.existsSync(process.argv[5])&&process.connected)await new Promise(r=>setTimeout(r,10));assert.throws(()=>assertRevisionCapability(cap,c,p),/revision-capability/);},p);`
  );
  let child;
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      child = lock.spawnRevisionDelegate(capability, childFile, [
        JSON.stringify(r.context),
        JSON.stringify(r.ports),
        ready,
        finish,
      ]);
      for (let i = 0; i < 300 && !fs.existsSync(ready); i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(fs.existsSync(ready), true);
    },
    r.ports
  );
  fs.writeFileSync(finish, 'finish');
  await child;
});

test('real sibling holder is never stolen by age and dead holder requires known liveness', async (t) => {
  const r = fixture(t);
  register(r);
  const moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href,
    childFile = path.join(r.root, 'holder.mjs');
  fs.writeFileSync(
    childFile,
    `import {withRevisionInterlock} from ${JSON.stringify(moduleURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);await withRevisionInterlock(c,async()=>{process.send('held');await new Promise(()=>{});},p);`
  );
  const child = spawn(
    process.execPath,
    [childFile, JSON.stringify(r.context), JSON.stringify(r.ports)],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }
  );
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`holder exited ${code}`)));
  });
  const root = path.join(domain.domainStorage(r.context.domain), 'locks'),
    dir = path.join(root, '1852.lock');
  fs.utimesSync(dir, new Date(0), new Date(0));
  await assert.rejects(
    lock.withRevisionInterlock(r.context, () => {}, r.ports),
    /revision-lock-held/
  );
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
  await assert.rejects(
    lock.withRevisionInterlock(r.context, () => {}, { ...r.ports, liveness: () => 'unknown' }),
    /revision-lock-held/
  );
  await lock.withRevisionInterlock(r.context, () => {}, r.ports);
  assert.equal(fs.existsSync(dir), false);
});

test('captured delegation from a previous child cannot be replayed on another child channel', async (t) => {
  const r = fixture(t);
  register(r);
  const moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href,
    childFile = path.join(r.root, 'replay.mjs'),
    capture = path.join(r.root, 'capture.json');
  fs.writeFileSync(
    childFile,
    `import fs from 'node:fs';import assert from 'node:assert/strict';import {withRevisionDelegation} from ${JSON.stringify(moduleURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);if(process.argv[5]==='replay'){await assert.rejects(withRevisionDelegation(c,()=>{},p),/revision-delegation-binding/);if(process.connected)process.disconnect();}else{process.on('message',m=>{if(m.type==='aitm-revision-delegation/v1')fs.writeFileSync(process.argv[4],JSON.stringify(m));});await withRevisionDelegation(c,()=>{},p);}`
  );
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await lock.spawnRevisionDelegate(capability, childFile, [
        JSON.stringify(r.context),
        JSON.stringify(r.ports),
        capture,
      ]);
      const previous = JSON.parse(fs.readFileSync(capture, 'utf8'));
      const child = spawn(
        process.execPath,
        [childFile, JSON.stringify(r.context), JSON.stringify(r.ports), capture, 'replay'],
        { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] }
      );
      let stderr = '';
      child.stderr.on('data', (x) => (stderr += x));
      child.once('message', () => child.send(previous));
      assert.equal(await new Promise((resolve) => child.once('exit', resolve)), 0, stderr);
    },
    r.ports
  );
});

async function waitForFixtureSignal(file) {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error(`fixture signal timeout: ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function admissionDelegate(r) {
  const childFile = path.join(r.root, 'admission-delegate.mjs');
  const url = (p) => pathToFileURL(path.resolve(p)).href;
  fs.writeFileSync(
    childFile,
    `import * as fs from 'node:fs';import {withRevisionDelegation} from ${JSON.stringify(url('scripts/task-tracker/lib/criteria-revision/interlock.mjs'))};import {observeAdmission,publishAdmission} from ${JSON.stringify(url('scripts/task-tracker/lib/criteria-revision/admission.mjs'))};import {authorityResult} from ${JSON.stringify(url('scripts/tests/fixtures/criteria-revision-runtime.mjs'))};const context=JSON.parse(process.argv[2]),ports=JSON.parse(process.argv[3]),mode=process.argv[4];await withRevisionDelegation(context,async capability=>{if(mode==='deny'){await publishAdmission({capability,observation:{issue:1852},state:'deny'},ports);return;}const observation=await observeAdmission({capability,context,observe:()=>authorityResult(context,context.domain)},ports);const writer={...ports,fs:{...fs,renameSync(from,to){if(to.endsWith('/admission/1852.json')){fs.writeFileSync(process.argv[5],String(process.pid));const deadline=Date.now()+5000;while(!fs.existsSync(process.argv[6])){if(Date.now()>deadline)throw new Error('paused writer timeout');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}fs.renameSync(from,to);}}};await publishAdmission({capability,observation,state:'allow'},writer);},ports);`
  );
  return childFile;
}

test('exclusive delegation prevents a paused older allow from overwriting a newer deny', async (t) => {
  const r = fixture(t);
  register(r);
  const childFile = admissionDelegate(r),
    paused = path.join(r.root, 'paused'),
    resume = path.join(r.root, 'resume');
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      const older = lock.spawnRevisionDelegate(capability, childFile, [
        JSON.stringify(r.context),
        JSON.stringify(r.ports),
        'allow',
        paused,
        resume,
      ]);
      let parentRefused = false,
        siblingRefused = false;
      try {
        await waitForFixtureSignal(paused);
        try {
          await admission.publishAdmission(
            { capability, observation: { issue: 1852 }, state: 'deny' },
            r.ports
          );
        } catch (e) {
          assert.match(e.message, /revision-delegation-held/);
          parentRefused = true;
        }
        try {
          await lock.spawnRevisionDelegate(capability, childFile, [
            JSON.stringify(r.context),
            JSON.stringify(r.ports),
            'deny',
          ]);
        } catch (e) {
          assert.match(e.message, /revision-delegation-held/);
          siblingRefused = true;
        }
      } finally {
        fs.writeFileSync(resume, 'resume');
        await older;
      }
      if (parentRefused && siblingRefused)
        await admission.publishAdmission(
          { capability, observation: { issue: 1852 }, state: 'deny' },
          r.ports
        );
      assert.equal(
        admission.readAdmission(r.context, r.ports).state,
        'deny',
        'paused older allow overwrote a newer deny'
      );
      assert.equal(parentRefused, true);
      assert.equal(siblingRefused, true);
    },
    r.ports
  );
});

test('parent cleanup retains strict ownership until the delegated process has exited', async (t) => {
  const r = fixture(t);
  register(r);
  const childFile = admissionDelegate(r),
    paused = path.join(r.root, 'paused'),
    resume = path.join(r.root, 'resume');
  let child, returned;
  const callbackReturned = new Promise((resolve) => {
    returned = resolve;
  });
  const holding = lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      child = lock.spawnRevisionDelegate(capability, childFile, [
        JSON.stringify(r.context),
        JSON.stringify(r.ports),
        'allow',
        paused,
        resume,
      ]);
      await waitForFixtureSignal(paused);
      returned();
    },
    r.ports
  );
  try {
    await callbackReturned;
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(
      lock.withRevisionInterlock(r.context, () => {}, r.ports),
      /revision-lock-held/
    );
  } finally {
    fs.writeFileSync(resume, 'resume');
    await child;
    await holding;
  }
  await lock.withRevisionInterlock(
    r.context,
    (capability) =>
      admission.publishAdmission(
        { capability, observation: { issue: 1852 }, state: 'deny' },
        r.ports
      ),
    r.ports
  );
  assert.equal(admission.readAdmission(r.context, r.ports).state, 'deny');
});

test('authenticated inherited issue locks participate in numeric ordering and genuine reuse', async (t) => {
  const r = fixture(t);
  register(r);
  r.context.issues = [2, 1852];
  const moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href,
    issueURL = pathToFileURL(path.resolve('scripts/task-tracker/issue-mutator-lock.mjs')).href,
    childFile = path.join(r.root, 'ordered-child.mjs');
  fs.writeFileSync(
    childFile,
    `import assert from 'node:assert/strict';import {withRevisionDelegation} from ${JSON.stringify(moduleURL)};import {withAuthenticatedRevisionIssueLock} from ${JSON.stringify(issueURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);await withRevisionDelegation(c,async capability=>{const options={projDir:c.executor.worktree,revisionContext:c,revisionCapability:capability,revisionPorts:p};await withAuthenticatedRevisionIssueLock({...options,issue:1852},()=>{});if(process.argv[4]==='both')await withAuthenticatedRevisionIssueLock({...options,issue:2},()=>{});else await assert.rejects(withAuthenticatedRevisionIssueLock({...options,issue:2},()=>{}),/revision-lock-order/);},p);`
  );
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      await withAuthenticatedRevisionIssueLock(
        {
          issue: 1852,
          projDir: r.first,
          revisionContext: r.context,
          revisionCapability: capability,
          revisionPorts: r.ports,
        },
        () =>
          lock.spawnRevisionDelegate(capability, childFile, [
            JSON.stringify(r.context),
            JSON.stringify(r.ports),
          ])
      );
    },
    r.ports
  );
  await lock.withRevisionInterlock(
    r.context,
    async (capability) => {
      const options = {
        projDir: r.first,
        revisionContext: r.context,
        revisionCapability: capability,
        revisionPorts: r.ports,
      };
      await withAuthenticatedRevisionIssueLock({ ...options, issue: 2 }, () =>
        withAuthenticatedRevisionIssueLock({ ...options, issue: 1852 }, () =>
          lock.spawnRevisionDelegate(capability, childFile, [
            JSON.stringify(r.context),
            JSON.stringify(r.ports),
            'both',
          ])
        )
      );
    },
    r.ports
  );
});

test('package resolution exposes internal deep imports without a root API facade', async (t) => {
  const consumer = mkdtempProjectIsolated('revision-consumer-');
  t.after(() => fs.rmSync(consumer, { recursive: true, force: true }));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')),
    installed = path.join(consumer, 'node_modules', pkg.name);
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.symlinkSync(process.cwd(), installed, 'dir');
  const require = createRequire(path.join(consumer, 'consumer.cjs'));
  assert.throws(() => require.resolve(pkg.name), { code: 'MODULE_NOT_FOUND' });
  for (const name of ['domain', 'interlock', 'admission']) {
    const resolved = require.resolve(
      `${pkg.name}/scripts/task-tracker/lib/criteria-revision/${name}.mjs`
    );
    assert.equal(
      fs.realpathSync(resolved),
      fs.realpathSync(`scripts/task-tracker/lib/criteria-revision/${name}.mjs`)
    );
    const runtime = await import(pathToFileURL(resolved));
    assert.ok(Object.keys(runtime).length > 0);
  }
});

test('parent SIGKILL cannot reclaim a live delegate paused inside admission publication', async (t) => {
  const r = fixture(t);
  register(r);
  const childFile = admissionDelegate(r),
    paused = path.join(r.root, 'crash-paused'),
    resume = path.join(r.root, 'crash-resume'),
    parentFile = path.join(r.root, 'crash-parent.mjs'),
    moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href;
  fs.writeFileSync(
    parentFile,
    `import {withRevisionInterlock,spawnRevisionDelegate} from ${JSON.stringify(moduleURL)};const c=JSON.parse(process.argv[2]),p=JSON.parse(process.argv[3]);await withRevisionInterlock(c,cap=>spawnRevisionDelegate(cap,process.argv[4],process.argv.slice(2,4).concat(['allow',...process.argv.slice(5)])),p);`
  );
  const parent = spawn(
    process.execPath,
    [parentFile, JSON.stringify(r.context), JSON.stringify(r.ports), childFile, paused, resume],
    { stdio: 'ignore' }
  );
  const exited = new Promise((resolve) =>
    parent.once('exit', (code, signal) => resolve({ code, signal }))
  );
  let childPid,
    refused = false;
  const publishDeny = (ports) =>
    lock.withRevisionInterlock(
      r.context,
      (capability) =>
        admission.publishAdmission(
          { capability, observation: { issue: 1852 }, state: 'deny' },
          ports
        ),
      ports
    );
  try {
    await waitForFixtureSignal(paused);
    childPid = Number(fs.readFileSync(paused, 'utf8'));
    parent.kill('SIGKILL');
    assert.equal((await exited).signal, 'SIGKILL');
    const runtime = domain.revisionRuntime(r.ports);
    assert.equal(runtime.liveness(parent.pid), 'dead');
    assert.equal(runtime.liveness(childPid), 'alive');
    try {
      await publishDeny(r.ports);
    } catch (error) {
      assert.match(error.message, /revision-lock-held/);
      refused = true;
    }
    if (refused)
      await assert.rejects(
        publishDeny({
          ...r.ports,
          liveness: (pid) => (pid === childPid ? 'unknown' : runtime.liveness(pid)),
        }),
        /revision-lock-held/
      );
    fs.writeFileSync(resume, 'resume');
    const deadline = Date.now() + 5000;
    while (runtime.liveness(childPid) !== 'dead' && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10));
    if (refused && runtime.liveness(childPid) === 'dead') await publishDeny(r.ports);
    else if (refused) await assert.rejects(publishDeny(r.ports), /revision-lock-held/);
    assert.equal(
      refused,
      true,
      'dead parent allowed a newer deny while its live delegate could overwrite it'
    );
    if (runtime.liveness(childPid) === 'dead')
      assert.equal(admission.readAdmission(r.context, r.ports).state, 'deny');
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) parent.kill('SIGKILL');
    fs.writeFileSync(resume, 'resume');
    if (childPid && domain.revisionRuntime(r.ports).liveness(childPid) !== 'dead')
      process.kill(childPid, 'SIGKILL');
    await exited;
  }
});

test('partial durable delegation publication cannot grant effects or erase uncertain holders', async (t) => {
  const r = fixture(t);
  register(r);
  r.context.issues = [2, 1852];
  const childFile = path.join(r.root, 'partial-child.mjs'),
    entered = path.join(r.root, 'entered'),
    moduleURL = pathToFileURL(
      path.resolve('scripts/task-tracker/lib/criteria-revision/interlock.mjs')
    ).href;
  fs.writeFileSync(
    childFile,
    `import * as fs from 'node:fs';import {withRevisionDelegation} from ${JSON.stringify(moduleURL)};await withRevisionDelegation(JSON.parse(process.argv[2]),()=>fs.writeFileSync(process.argv[4],'effect'),JSON.parse(process.argv[3]));`
  );
  const ports = {
    ...r.ports,
    fs: {
      ...fs,
      renameSync(from, to) {
        if (
          to.endsWith('/1852.lock/holder.json') &&
          JSON.parse(fs.readFileSync(from, 'utf8')).delegation?.state === 'active'
        )
          throw new Error('injected partial lease publication');
        fs.renameSync(from, to);
      },
    },
  };
  await assert.rejects(
    lock.withRevisionInterlock(
      r.context,
      (capability) =>
        lock.spawnRevisionDelegate(capability, childFile, [
          JSON.stringify(r.context),
          JSON.stringify(r.ports),
          entered,
        ]),
      ports
    ),
    /injected partial lease publication/
  );
  assert.equal(fs.existsSync(entered), false);
  const holder = path.join(
    domain.domainStorage(r.context.domain),
    'locks',
    '1852.lock',
    'holder.json'
  );
  assert.equal(JSON.parse(fs.readFileSync(holder, 'utf8')).delegation.state, 'preparing');
  await assert.rejects(
    lock.withRevisionInterlock({ ...r.context, issues: [1852] }, () => {}, {
      ...r.ports,
      liveness: () => 'dead',
    }),
    /revision-lock-held/
  );
  assert.equal(fs.existsSync(holder), true);
});
