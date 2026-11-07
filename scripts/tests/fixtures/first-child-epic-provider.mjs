// @story #2161 — real Git/native binding, synthetic provider bytes only.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  writeFileSync,
  rmSync,
  realpathSync,
  mkdirSync,
  symlinkSync,
  chmodSync,
  readFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtempOutsideRepo } from '../../task-tracker/lib/scratch-dir.mjs';
import { statePath } from '../../task-tracker/paths.mjs';
import { setActiveTask, getActiveTask } from '../../task-tracker/session-state.mjs';
import { formatIssueFieldDb } from '../../task-tracker/issue-field-db.mjs';
import { reconcileEpicMetadata } from '../../gh/lib/epic-metadata.mjs';
import { verbKind } from '../../task-tracker/verbs/kind.mjs';
import { ensureParentEpicTitle } from '../../gh/lib/epic-retitle.mjs';

const conn = (nodes) => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
export function firstChildFixture(t, stage = 'plan') {
  const previous = { ...process.env },
    cwd = process.cwd();
  const root = realpathSync(mkdtempOutsideRepo('first-child-2161-'));
  t.after(() => {
    process.chdir(cwd);
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(root, { recursive: true, force: true });
  });
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q', '-b', 'codex/fixture');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(path.join(root, 'source.txt'), 'real source\n');
  git('add', 'source.txt');
  git('commit', '-qm', 'Fixture source');
  process.chdir(root);
  process.env.AI_TASK_MANAGER_SESSION_ID = 'first-child-2161-session';
  process.env.AI_TASK_MANAGER_APP_NAME = 'codex';
  process.env.AI_TASK_MANAGER_PROJECT_DIR = root;
  process.env.TT_SKIP_NETWORK = '0';
  const binding = {
    issue: '42',
    entryStartTs: '2026-11-05T00:00:00Z',
    kanbanState: stage,
    bindingGenerationId: 'first-child-generation',
    worktreePath: root,
    worktreeBranch: 'codex/fixture',
  };
  setActiveTask(process.env.AI_TASK_MANAGER_SESSION_ID, binding, root);
  const cfg = {
    repo: 'o/r',
    projectId: 'P',
    kanbanFieldId: 'STATUS',
    fieldIds: { size: 'S', estimate: 'E' },
  };
  const item = (id, stage) => ({
    id,
    project: { id: 'P' },
    fieldValueByName: { name: stage },
    fieldValues: conn([
      {
        id: id + '-STATUS',
        __typename: 'ProjectV2ItemFieldSingleSelectValue',
        name: stage,
        optionId: 'OPT_' + stage,
        field: { id: 'STATUS', name: 'Status' },
      },
    ]),
  });
  const body =
    '## User Story\nAs a task operator\nI want to retain my child because interrupted conversion can lose progress\nSo that duplicate creation is avoided\n\n## Scope\nRetain first-child history.\n\n## Acceptance Criteria\n- [ ] Retain the child.\n\n## Verification Commands\n- [ ] `node verify.mjs` <!-- id=1 -->\n\n## AITM Progress Markers\n<!-- aitm-last-known-state state="' +
    stage +
    '" ts="2026-11-05T00:00:00Z" -->\n' +
    formatIssueFieldDb({ size: 'M', estimate: 4 });
  const child = {
    id: 'C',
    number: 43,
    title: 'Existing child',
    body: '## Scope\nUnsized first child.\n',
    state: 'OPEN',
    labels: conn([]),
    blockedBy: conn([]),
    projectItems: conn([item('CI', 'Backlog')]),
  };
  const node = {
    id: 'I',
    number: 42,
    title: 'Parent task',
    body,
    state: 'OPEN',
    repository: { nameWithOwner: 'o/r' },
    assignees: { nodes: [{ login: 'operator' }] },
    labels: ['bug'],
    projectItems: conn([item('PI', stage)]),
    comments: conn([]),
    subIssues: conn([child]),
  };
  const writes = [],
    queries = [];
  const f = {
    root,
    cfg,
    node,
    child,
    writes,
    queries,
    git,
    stage,
    afterEffect: null,
    inheritedEnv: previous,
    binding,
  };
  const effect = (kind) => {
    writes.push(kind);
    f.afterEffect?.(kind);
  };
  const deps = {
    graphql: async ({ query }) => {
      queries.push(query);
      return {
        data: { viewer: { login: 'operator' }, repository: { issue: structuredClone(node) } },
      };
    },
    readIssue: async () => ({ title: node.title, body: node.body, labels: [...node.labels] }),
    readDodTemplate: () => '',
    fetchBody: async () => node.body,
    pushBody: async (_repo, _issue, value) => {
      node.body = value;
      effect('body');
    },
    writeVisible: async ({ title, labelsToAdd }) => {
      if (title != null) node.title = title;
      node.labels.push(...labelsToAdd);
      effect('visible');
    },
    pexec: async (file, args) => {
      if (file !== 'gh' || args[0] !== 'issue' || args[1] !== 'view' || Number(args[2]) !== 42)
        throw new Error('unclassified transport');
      return {
        stdout:
          args.includes('-q') || args.includes('--jq')
            ? node.body
            : JSON.stringify({ title: node.title, body: node.body, labels: node.labels }),
      };
    },
  };
  f.deps = deps;
  f.reconcile = () =>
    reconcileEpicMetadata({
      issueNumber: 42,
      repo: cfg.repo,
      cfg,
      projectDir: root,
      forceEpic: true,
      deps,
    });
  f.kind = () =>
    verbKind({
      cfg,
      statePath: statePath(root),
      projectDir: root,
      rest: ['42', 'epic'],
      deps,
      pexec: deps.pexec,
    });
  f.automatic = () =>
    ensureParentEpicTitle({
      parentId: 'I',
      issueNumber: 42,
      repo: cfg.repo,
      runGql: async () => ({
        node: { number: 42, title: node.title, repository: { nameWithOwner: cfg.repo } },
      }),
      reconcileEpicMetadata: f.reconcile,
    });
  f.rebind = (update) =>
    setActiveTask(
      process.env.AI_TASK_MANAGER_SESSION_ID,
      { ...getActiveTask(process.env.AI_TASK_MANAGER_SESSION_ID, root), ...update },
      root
    );
  return f;
}

export function installFirstChildCli(f) {
  const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const bin = path.join(f.root, 'fixture-bin');
  mkdirSync(bin);
  mkdirSync(path.join(f.root, '.ai-task-manager'), { recursive: true });
  for (const dir of ['bin', 'templates', 'skill'])
    symlinkSync(path.join(sourceRoot, dir), path.join(f.root, dir), 'dir');
  symlinkSync(
    path.join(sourceRoot, 'templates'),
    path.join(f.root, '.ai-task-manager/templates'),
    'dir'
  );
  const provider = new URL('./first-child-epic-cli-provider.mjs', import.meta.url).href;
  const executable = path.join(bin, 'gh');
  writeFileSync(
    executable,
    '#!' +
      process.execPath +
      '\nimport {runFirstChildGh} from ' +
      JSON.stringify(provider) +
      ';\ntry {process.stdout.write(String(runFirstChildGh(process.argv.slice(2))));} catch(error) {process.stderr.write(error.message);process.exitCode=1;}\n'
  );
  chmodSync(executable, 0o755);
  const node = structuredClone(f.node);
  node.__typename = 'Issue';
  node.url = 'https://example.invalid/o/r/issues/42';
  node.parent = null;
  node.labels = conn([{ id: 'L_bug', name: 'bug' }]);
  node.childNumbers = [];
  const defs = [
    { id: 'E', name: 'Estimate', dataType: 'NUMBER', __typename: 'ProjectV2Field' },
    {
      id: 'S',
      name: 'Size',
      dataType: 'SINGLE_SELECT',
      __typename: 'ProjectV2SingleSelectField',
      options: ['XS', 'S', 'M', 'L', 'XL'].map((name) => ({ id: 'OPT_' + name, name })),
    },
    {
      id: 'STATUS',
      name: 'Status',
      dataType: 'SINGLE_SELECT',
      __typename: 'ProjectV2SingleSelectField',
      options: ['Backlog', 'Refine', 'Plan', 'Develop', 'Test', 'Review', 'Done'].map((name) => ({
        id: 'OPT_' + name,
        name,
      })),
    },
  ];
  defs.push(
    ...['Engaged', 'Session', 'Review', 'Plan', 'Start Time'].map((name) => ({
      id: name.replaceAll(' ', '_'),
      name,
      dataType: 'TEXT',
      __typename: 'ProjectV2Field',
    }))
  );
  const project = {
    __typename: 'ProjectV2',
    id: 'P',
    title: 'Fixture',
    url: 'https://example.invalid/project',
    fields: conn(defs),
  };
  for (const item of node.projectItems.nodes) {
    item.project = project;
    item.__typename = 'ProjectV2Item';
    item.content = {
      __typename: 'Issue',
      id: node.id,
      number: node.number,
      title: node.title,
      url: node.url,
      repository: { nameWithOwner: 'o/r' },
    };
  }
  const child = structuredClone(f.child);
  child.__typename = 'Issue';
  child.url = 'https://example.invalid/o/r/issues/43';
  child.repository = { nameWithOwner: 'o/r' };
  child.comments = conn([]);
  child.assignees = { nodes: [] };
  child.childNumbers = [];
  child.parent = null;
  child.stateReason = null;
  const childItem = child.projectItems.nodes[0];
  childItem.project = project;
  childItem.__typename = 'ProjectV2Item';
  const file = path.join(f.root, 'provider.json');
  writeFileSync(
    file,
    JSON.stringify({
      issues: { 42: node },
      project,
      childTemplate: child,
      childItem,
      effects: [],
      names: Object.fromEntries(defs.map(({ id, name }) => [id, name])),
    })
  );
  const config = {
    ...f.cfg,
    kanbanOptionBacklog: 'OPT_Backlog',
    kanbanOptionPlan: 'OPT_Plan',
    sizeFieldId: 'S',
    sizeOptions: Object.fromEntries(
      ['XS', 'S', 'M', 'L', 'XL'].map((name) => [name, 'OPT_' + name])
    ),
    priorityFieldId: '',
    rankFieldId: '',
    fieldIds: { estimate: 'E', size: 'S' },
  };
  writeFileSync(path.join(f.root, '.ai-task-manager/task-tracker.json'), JSON.stringify(config));
  const env = {
    ...process.env,
    PATH: bin + path.delimiter + process.env.PATH,
    AITM_GH_TEST_DOUBLE_BIN: bin,
    AITM_FIRST_CHILD_FIXTURE: file,
    TT_SKIP_NETWORK: '0',
  };
  const run = (args, overrides = {}) =>
    spawnSync(process.execPath, [path.join(sourceRoot, 'bin/aitm.mjs'), ...args], {
      cwd: f.root,
      env: { ...env, ...overrides },
      encoding: 'utf8',
      timeout: 60000,
    });
  return {
    file,
    env,
    run,
    sourceRoot,
    read: () => JSON.parse(readFileSync(file, 'utf8')),
    write: (value) => writeFileSync(file, JSON.stringify(value)),
  };
}
