// @story #2163 — fixture-owned physical roots and transport-only public execution.
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { projectScratchDir } from '../../task-tracker/lib/scratch-dir.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const providerSource = fileURLToPath(
  new URL('./inflation-transport-provider.mjs', import.meta.url)
);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = (file) => digest(readFileSync(file));
const clone = (value) => structuredClone(value);
const osKeys = ['LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT', 'WINDIR'];
const actor = '21630000-0000-4000-8000-000000004242';
const issue = 4242;

function trustedExecutable(name) {
  const locations = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  const candidate = locations.map((dir) => path.join(dir, name)).find(existsSync);
  if (!candidate) throw new Error(`inflation-fixture:missing-real-tool:${name}`);
  const resolved = realpathSync(candidate);
  accessSync(resolved, constants.X_OK);
  return resolved;
}
function inventory(root, prefix = '') {
  return readdirSync(path.join(root, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const relative = path.posix.join(prefix, entry.name);
      if (['.git', 'node_modules', '.tmp', '.scratch'].includes(entry.name)) return [];
      const file = path.join(root, relative);
      if (entry.isSymbolicLink()) throw new Error(`inflation-fixture:source-symlink:${relative}`);
      return entry.isDirectory()
        ? inventory(root, relative)
        : [{ path: relative, sha256: hashFile(file), bytes: lstatSync(file).size }];
    });
}
function copyDependencies(target) {
  const records = [],
    seen = new Set();
  function copy(name, from) {
    const require = createRequire(from);
    let entry = require.resolve(name),
      dir = path.dirname(entry);
    while (
      !existsSync(path.join(dir, 'package.json')) ||
      JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name
    ) {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`inflation-fixture:dependency-root:${name}`);
      dir = parent;
    }
    dir = realpathSync(dir);
    const base = path.join(repository, 'node_modules');
    const relative = path.relative(base, dir);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      throw new Error(`inflation-fixture:external-dependency:${name}`);
    if (seen.has(relative)) return;
    seen.add(relative);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const out = path.join(target, 'node_modules', relative);
    cpSync(dir, out, {
      recursive: true,
      filter: (file) => file === dir || path.basename(file) !== 'node_modules',
    });
    records.push({ name, version: manifest.version, path: relative, files: inventory(out) });
    for (const dependency of Object.keys(manifest.dependencies ?? {}))
      copy(dependency, path.join(dir, 'package.json'));
  }
  for (const name of ['espree', 'js-yaml', 'js-tiktoken'])
    copy(name, path.join(repository, 'package.json'));
  return records;
}
function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

export async function createInflationPublicEntryFixture({ source, seed = {}, retainDir } = {}) {
  if (!source || Object.keys(source).length !== 1 || (!source.commit && !source.root))
    throw new Error('inflation-fixture:source-selection');
  const token = `inflation-${randomUUID().slice(0, 8)}`;
  const bootstrapHome = path.join(projectScratchDir('test', repository), token);
  mkdirSync(bootstrapHome, { recursive: true });
  let container;
  try {
    const node = realpathSync(process.execPath),
      git = trustedExecutable('git');
    const bootstrap = Object.fromEntries(
      osKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]])
    );
    Object.assign(bootstrap, {
      HOME: bootstrapHome,
      XDG_CONFIG_HOME: bootstrapHome,
      GIT_CONFIG_NOSYSTEM: '1',
      PATH: [...new Set([path.dirname(node), path.dirname(git), '/usr/bin', '/bin'])].join(
        path.delimiter
      ),
    });
    const helper = path.join(repository, 'scripts/task-tracker/lib/scratch-dir.mjs');
    const main = execFileSync(
      node,
      [
        '--input-type=module',
        '-e',
        `import {mkdtempProjectIsolated} from ${JSON.stringify(helper)}; console.log(mkdtempProjectIsolated('repository-', ${JSON.stringify(token)}));`,
      ],
      { cwd: repository, env: bootstrap, encoding: 'utf8' }
    ).trim();
    container = path.dirname(main);
    const worker = path.join(container, 'worker');
    const runGit = (cwd, ...args) =>
      execFileSync(git, args, {
        cwd,
        env: bootstrap,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    const originCommit = source.commit
      ? runGit(repository, 'rev-parse', `${source.commit}^{commit}`).trim()
      : runGit(source.root, 'rev-parse', 'HEAD').trim();
    if (source.commit) {
      const archive = execFileSync(git, ['archive', originCommit], {
        cwd: repository,
        env: bootstrap,
        maxBuffer: 256 * 1024 * 1024,
      });
      execFileSync(trustedExecutable('tar'), ['-x', '-C', main], {
        env: bootstrap,
        input: archive,
      });
    } else {
      const names = runGit(
        source.root,
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard'
      )
        .split('\0')
        .filter(Boolean);
      for (const name of [...new Set(names)]) {
        const from = path.join(source.root, name);
        if (!existsSync(from)) continue;
        if (lstatSync(from).isSymbolicLink())
          throw new Error(`inflation-fixture:source-symlink:${name}`);
        mkdirSync(path.dirname(path.join(main, name)), { recursive: true });
        copyFileSync(from, path.join(main, name));
      }
    }
    const capturedFiles = inventory(main);
    const planPath = 'docs/superpowers/plans/2026-11-05-4242-inflation-fixture.md';
    mkdirSync(path.dirname(path.join(main, planPath)), { recursive: true });
    writeFileSync(
      path.join(main, planPath),
      '# Fixture publication\n\n## Scope\n\nPublish one audited estimate revision.\n'
    );
    const cfg = {
      repo: 'fixture/inflation',
      projectId: 'PVT_fixture',
      kanbanFieldId: 'F_STATUS',
      priorityFieldId: 'F_PRIORITY',
      fieldBlockedBy: 'F_BLOCKED',
      fieldDisposition: 'F_DISPOSITION',
      fieldStartTime: 'F_STARTED',
      fieldEngagedTime: 'F_ENGAGED',
      fieldSessionTime: 'F_SESSION',
      fieldReviewTime: 'F_REVIEW',
      fieldPlanTime: 'F_PLAN',
      fieldIds: {
        size: 'F_SIZE',
        estimate: 'F_EST',
        priority: 'F_PRIORITY',
        rank: 'F_RANK',
        status: 'F_STATUS',
      },
      preferences: { gateAssigneeMatch: true },
      estimationRubricIssue: 0,
    };
    mkdirSync(path.join(main, '.ai-task-manager'), { recursive: true });
    writeFileSync(
      path.join(main, '.ai-task-manager/task-tracker.json'),
      JSON.stringify(cfg, null, 2) + '\n'
    );
    runGit(main, 'add', '--all');
    runGit(
      main,
      '-c',
      'user.name=Inflation Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Capture immutable fixture source and planning inputs'
    );
    const fixtureCommit = runGit(main, 'rev-parse', 'HEAD').trim();
    runGit(main, 'worktree', 'add', '-b', 'codex/4242-fixture', worker, fixtureCommit);
    const dependencies = copyDependencies(main);
    symlinkSync(path.join(main, 'node_modules'), path.join(worker, 'node_modules'), 'dir');
    mkdirSync(path.join(main, 'node_modules/@kburson'), { recursive: true });
    symlinkSync(worker, path.join(main, 'node_modules/ai-task-manager'), 'dir');
    symlinkSync(worker, path.join(main, 'node_modules/@kburson/ai-task-manager'), 'dir');
    const providerDir = path.join(container, 'provider'),
      home = path.join(container, 'home');
    mkdirSync(providerDir);
    mkdirSync(home);
    const gh = path.join(providerDir, 'gh');
    copyFileSync(providerSource, gh);
    chmodSync(gh, 0o755);
    writeFileSync(path.join(providerDir, 'package.json'), '{"type":"module"}\n');
    for (const [name, executable] of [
      ['node', node],
      ['git', git],
      ['sh', trustedExecutable('sh')],
      ['bash', trustedExecutable('bash')],
    ])
      symlinkSync(executable, path.join(providerDir, name));
    const providerHash = hashFile(gh),
      dataFile = path.join(providerDir, 'state.json');
    const fields = { priority: 'P1', size: 'S', estimate: 2, rank: issue, startTime: null };
    const state = {
      worktreePath: worker,
      repository: cfg.repo,
      number: issue,
      issueId: 'I_fixture',
      projectId: cfg.projectId,
      itemId: 'ITEM_fixture',
      viewer: 'operator',
      assignees: ['operator'],
      status: 'Plan',
      body: `<!-- aitm-last-known-state state="plan" ts="2026-11-05T00:00:00.000Z" -->\n\n## User Story\n\nAs a task operator I want an audited estimate revision so that planning reflects discovered work.\n\n## Scope\n\nPublish one audited estimate revision.\n\n## Plan Metadata\n\n- **Implementation-plan**: ${planPath}\n- **Plan-commit**: ${fixtureCommit}\n\n## Acceptance Criteria\n\n- [ ] Publish exactly once. <!-- aitm-verified vc-list="vc:1" -->\n\n## Verification Commands\n\n- [ ] \`node --version\` <!-- id=1 -->\n\n<!-- aitm-fields: ${JSON.stringify({ schema: 1, values: fields })} -->\n`,
      board: { ...fields },
      comments: [
        {
          id: 101,
          node_id: 'IC_fixture_refine',
          issue_url: `https://api.github.com/repos/${cfg.repo}/issues/${issue}`,
          body: `<!-- aitm-refined-estimate: ${issue} -->\n### 🛠 Refine estimate\n\n| Field | Value |\n|---|---|\n| Size | S |\n\n### Planned Estimate\n\n| Field | Refine | Planned |\n|---|---|---|\n| Size | S | S |\n| Estimate (h) | 2 | 2 |\n`,
          created_at: '2026-11-05T00:00:00Z',
          updated_at: '2026-11-05T00:00:00Z',
        },
      ],
      ...clone(seed),
    };
    writeFileSync(dataFile, JSON.stringify({ state, ledger: [], faults: [] }));
    const initialState = clone(state);
    const env = {
      ...Object.fromEntries(
        osKeys.filter((key) => bootstrap[key] !== undefined).map((key) => [key, bootstrap[key]])
      ),
      HOME: home,
      XDG_CONFIG_HOME: home,
      GH_CONFIG_DIR: path.join(home, 'gh'),
      CODEX_HOME: path.join(home, 'codex'),
      CODEX_THREAD_ID: actor,
      CODEX_SESSION_ID: actor,
      PATH: providerDir,
      INFLATION_FIXTURE_DATA: dataFile,
    };
    const sourceIdentity = {
      originCommit,
      originTree: runGit(repository, 'rev-parse', `${originCommit}^{tree}`).trim(),
      fixtureCommit,
      files: capturedFiles,
      fixtureInputs: [planPath, '.ai-task-manager/task-tracker.json'].map((relative) => ({
        path: relative,
        sha256: hashFile(path.join(worker, relative)),
        contents: readFileSync(path.join(worker, relative), 'utf8'),
      })),
      dependencies,
      fixtureFiles: [providerSource, fileURLToPath(import.meta.url)].map((file) => ({
        path: path.relative(repository, file),
        sha256: hashFile(file),
      })),
      executables: {
        node: { path: node, sha256: hashFile(node) },
        git: { path: git, sha256: hashFile(git) },
      },
    };
    const attempts = [];
    let active = false,
      closed = false;
    function readState() {
      const bindingFile = path.join(worker, '.tmp/aitm/sessions', actor, 'active-task.json');
      const timingFile = path.join(worker, '.tmp/aitm/state/task-tracker-state.json');
      return {
        provider: clone(readJson(dataFile).state),
        runtime: { binding: readJson(bindingFile), timing: readJson(timingFile) },
      };
    }
    async function run(argv, { timeoutMs = 120000, actor: selectedActor = 'operator' } = {}) {
      if (
        closed ||
        active ||
        selectedActor !== 'operator' ||
        !Array.isArray(argv) ||
        argv.some((value) => typeof value !== 'string') ||
        !Number.isSafeInteger(timeoutMs) ||
        timeoutMs < 1
      )
        throw new Error('inflation-fixture:run-contract');
      if (!existsSync(gh) || realpathSync(gh) !== gh || hashFile(gh) !== providerHash)
        throw new Error('inflation-fixture:provider-identity');
      accessSync(gh, constants.X_OK);
      active = true;
      const result = await new Promise((resolve, reject) => {
        const child = spawn(node, [path.join(worker, 'bin/aitm.mjs'), ...argv], {
          cwd: worker,
          env,
          detached: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '',
          stderr = '',
          timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch (error) {
            if (error.code !== 'ESRCH') reject(error);
          }
        }, timeoutMs);
        child.stdout.on('data', (data) => {
          stdout += data;
        });
        child.stderr.on('data', (data) => {
          stderr += data;
        });
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (status, signal) => {
          clearTimeout(timer);
          resolve({ status, signal, stdout, stderr, timedOut });
        });
      }).finally(() => {
        active = false;
      });
      const evidence = {
        ...result,
        argv: [...argv],
        cwd: worker,
        sourceIdentity,
        environment: clone(env),
        stateAfter: readState(),
      };
      attempts.push(evidence);
      return clone(evidence);
    }
    function fault(spec) {
      if (
        active ||
        closed ||
        !spec ||
        Object.keys(spec).sort().join(',') !== 'action,checkpoint,occurrence,phase' ||
        !Number.isSafeInteger(spec.occurrence) ||
        spec.occurrence < 1
      )
        throw new Error('inflation-fixture:fault-contract');
      if (!['before-apply', 'after-apply-before-response'].includes(spec.phase))
        throw new Error('inflation-fixture:fault-phase');
      if (
        ![
          'transport-failure',
          'malformed-response',
          'duplicate-comment-id',
          'truncated-comments',
          'repeated-comment-cursor',
        ].includes(spec.action)
      )
        throw new Error('inflation-fixture:fault-action');
      if (
        ![
          'viewer',
          'location-assignment',
          'assignment',
          'membership',
          'project-values',
          'forecast-projection',
          'forecast-page',
          'rest-comments',
          'audit',
          'size',
          'estimate',
          'fields',
          'publication',
          'before-record',
          'assessment',
          'issue-body',
          'timing-read',
          'timing-write',
        ].includes(spec.checkpoint)
      )
        throw new Error('inflation-fixture:fault-checkpoint');
      const data = readJson(dataFile);
      if (
        !['transport-failure'].includes(spec.action) &&
        !['forecast-projection', 'forecast-page'].includes(spec.checkpoint)
      )
        throw new Error('inflation-fixture:fault-response-target');
      data.faults.push(clone(spec));
      writeFileSync(dataFile, JSON.stringify(data));
    }
    function close() {
      if (active) throw new Error('inflation-fixture:active-close');
      if (closed) return;
      try {
        if (retainDir) {
          const destination = path.resolve(retainDir),
            allowed = path.join(repository, 'docs/peer-reviews/2163/public-entry-red');
          if (!destination.startsWith(allowed + path.sep))
            throw new Error('inflation-fixture:retention-path');
          mkdirSync(destination, { recursive: true });
          if (readdirSync(destination).length)
            throw new Error('inflation-fixture:retention-exists');
          for (const [name, value] of Object.entries({
            sourceIdentity,
            initialState,
            finalState: readState(),
            ledger: readJson(dataFile).ledger,
            attempts,
          }))
            writeFileSync(
              path.join(destination, `${name}.json`),
              JSON.stringify(value, null, 2) + '\n'
            );
          const emitted = attempts.find((attempt) =>
            attempt.stderr.includes('final-authority-drift')
          )?.stateAfter.provider;
          if (emitted) {
            const markers = {
              'legacy-issue-body.md': emitted.body,
              'legacy-publication.txt': emitted.body.match(
                /<!-- aitm-decomposition-publication[^>]*-->/
              )?.[0],
              'legacy-before-record.txt': emitted.body.match(
                /<!-- aitm-estimate-before[^>]*-->/
              )?.[0],
              'legacy-audit.md': emitted.comments.find((comment) => comment.id === 101)?.body,
            };
            for (const [name, body] of Object.entries(markers)) {
              if (typeof body !== 'string')
                throw new Error('inflation-fixture:missing-legacy-evidence');
              writeFileSync(path.join(destination, name), body);
            }
          }
          writeFileSync(
            path.join(destination, 'manifest.json'),
            JSON.stringify(
              {
                evidenceClass: 'automated-provider-isolated-public-entry',
                nativeHostAdmission: false,
                files: inventory(destination),
              },
              null,
              2
            ) + '\n'
          );
        }
      } finally {
        closed = true;
        rmSync(container, { recursive: true, force: true });
        rmSync(bootstrapHome, { recursive: true, force: true });
      }
    }
    return {
      run,
      readState,
      readLedger: () => clone(readJson(dataFile).ledger),
      fault,
      close,
      sourceIdentity: clone(sourceIdentity),
    };
  } catch (error) {
    if (container) rmSync(container, { recursive: true, force: true });
    rmSync(bootstrapHome, { recursive: true, force: true });
    throw error;
  }
}
