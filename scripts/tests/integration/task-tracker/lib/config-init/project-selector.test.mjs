// @story #2144
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { projectScratchDir } from '../../../../../task-tracker/lib/scratch-dir.mjs';

const repoRoot = fileURLToPath(new URL('../../../../../..', import.meta.url));
const script = join(repoRoot, 'scripts/gh/init-project-config.sh');
const project = { id: 'PVT_user_fixture', title: 'Selector fixture', number: 23 };
const fields = [
  {
    id: 'F_STATUS',
    name: 'Status',
    options: [
      'Backlog',
      'Refine',
      'Ready for Planning',
      'Plan',
      'Develop',
      'Test',
      'Review',
      'Done',
    ].map((name, i) => ({ id: `O_${i}`, name, color: 'GRAY', description: '' })),
  },
  {
    id: 'F_PRIORITY',
    name: 'Priority',
    options: ['P0', 'P1', 'P2', 'P3'].map((name) => ({
      id: name,
      name,
      color: 'GRAY',
      description: '',
    })),
  },
  {
    id: 'F_SIZE',
    name: 'Size',
    options: ['XS', 'S', 'M', 'L', 'XL'].map((name) => ({
      id: name,
      name,
      color: 'GRAY',
      description: '',
    })),
  },
  {
    id: 'F_DISPOSITION',
    name: 'Disposition',
    options: ['Delivered', 'Replaced', 'Discarded', 'Duplicate', 'Incorporated', 'BLOCKED'].map(
      (name) => ({ id: name, name })
    ),
  },
  ...['Estimate', 'Engaged', 'Session', 'Review', 'Plan', 'Rank', 'Started'].map((name) => ({
    id: `F_${name}`,
    name,
    dataType: ['Estimate', 'Rank'].includes(name) ? 'NUMBER' : 'TEXT',
  })),
];

// Only gh transport is replaced: the real bash entrypoint, jq, parsers and writer run.
const fixture = String.raw`#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const args = process.argv.slice(2), text = args.join(' ');
fs.appendFileSync(process.env.SELECTOR_CALLS, JSON.stringify(args) + '\n');
const mode = process.env.SELECTOR_MODE;
const project = JSON.parse(process.env.SELECTOR_PROJECT);
function emit(value) {
  const index = args.indexOf('--jq');
  if (index >= 0) {
    const result = spawnSync('jq', ['-r', args[index + 1]], {input: JSON.stringify(value), encoding:'utf8'});
    process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(result.status);
  }
  console.log(JSON.stringify(value));
}
function fail(message, partial) {if(partial) console.log(JSON.stringify(partial)); console.error(message); process.exit(1);}
if (text === 'auth status') {console.log("Token scopes: 'repo', 'project'"); process.exit(0);}
if (text === 'api user --jq .login') {console.log('fixture-owner'); process.exit(0);}
if (args[0] === 'repo' && args[1] === 'view') {emit({nameWithOwner:'fixture-owner/selector-fixture'}); process.exit(0);}
if (args[0] !== 'api' || args[1] !== 'graphql') fail('unexpected gh call');
if (/projectV2\(number:/.test(text)) {
  if (mode === 'auth') fail('HTTP 403: Resource not accessible by token');
  if (mode === 'auth-partial') fail('GraphQL authorization error', project);
  if (mode === 'transport') fail('dial tcp: connection refused');
  if (/user\(login:/.test(text) && /organization\(login:/.test(text)) {
    const user = mode !== 'organization';
    fail('Could not resolve to ' + (user ? 'an Organization' : 'a User'), {data:{user:user?{projectV2:project}:null,organization:user?null:{projectV2:project}},errors:[{type:'NOT_FOUND',path:[user?'organization':'user']}]});
  }
  if (!/repositoryOwner\(login:/.test(text) || !args.includes('login=fixture-owner') || !args.includes('number=23')) fail('unexpected selector query');
  if (!text.includes(mode === 'organization' ? '... on Organization' : '... on User')) fail('owner fragment missing');
  if (mode === 'missing-owner') emit({data:{repositoryOwner:null}});
  else if (mode === 'missing-project') emit({data:{repositoryOwner:{projectV2:null}}});
  else emit({data:{repositoryOwner:{projectV2:project}}});
} else if (/projectsV2\(first: 50\)/.test(text)) {
  const nodes = mode === 'linked' && /repository\(owner:/.test(text) ? [project] : [];
  emit({data:{repository:{projectsV2:{nodes}},user:{projectsV2:{nodes:[]}},organization:null}});
} else if (/workflows\(first:/.test(text)) emit({data:{node:{workflows:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}});
else if (/fields\(first:/.test(text)) emit({data:{node:{fields:{nodes:JSON.parse(process.env.SELECTOR_FIELDS)}}}});
else if (/repository\(owner:/.test(text)) emit({data:{repository:{id:'R_FIXTURE'}}});
else if (/mutation/.test(text)) emit({data:{}});
else fail('unexpected graphql call');
`;

function runSetup({
  mode = 'user',
  selector = 'fixture-owner:23',
  existing = false,
  selected = project,
} = {}) {
  const temp = mkdtempSync(join(projectScratchDir('test'), 'selector-'));
  const bin = join(temp, 'bin'),
    target = join(temp, 'target'),
    callsFile = join(temp, 'calls.jsonl');
  mkdirSync(bin);
  mkdirSync(target);
  writeFileSync(join(bin, 'gh'), fixture);
  chmodSync(join(bin, 'gh'), 0o755);
  const configFile = join(target, '.ai-task-manager/task-tracker.json');
  const prior = {
    repo: 'fixture-owner/selector-fixture',
    projectId: 'PVT_user_fixture',
    kanbanFieldId: 'F_STATUS',
    kanbanOptionBacklog: 'O_0',
    fieldEstimate: 'F_Estimate',
    preferences: { noPushToOrigin: true },
  };
  if (existing) {
    mkdirSync(join(target, '.ai-task-manager'));
    writeFileSync(configFile, JSON.stringify(prior));
  }
  const before = existsSync(configFile) ? readFileSync(configFile, 'utf8') : null;
  const result = spawnSync('bash', [script, '--target', target, '--project', selector], {
    input: '\n'.repeat(50),
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      SELECTOR_MODE: mode,
      SELECTOR_CALLS: callsFile,
      SELECTOR_PROJECT: JSON.stringify(selected),
      SELECTOR_FIELDS: JSON.stringify(fields),
    },
  });
  return {
    result,
    before,
    prior,
    configFile,
    calls: existsSync(callsFile) ? readFileSync(callsFile, 'utf8') : '',
    config: existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : null,
  };
}

// Returning to the combined roots must fail these supported-init success cases.
for (const mode of ['user', 'organization', 'linked']) {
  test(`explicit ${mode} project survives absent other owner type and writes exact identity`, () => {
    const run = runSetup({ mode, existing: mode === 'linked' });
    assert.equal(run.result.status, 0, `${run.result.stderr}\n${run.result.stdout}`);
    assert.equal(run.config.projectId, 'PVT_user_fixture');
    assert.match(run.result.stdout, /Using project #23: Selector fixture/);
    assert.doesNotMatch(run.calls, /project","create|createProjectV2\(/);
    if (mode === 'linked') {
      for (const key of [
        'projectId',
        'kanbanFieldId',
        'kanbanOptionBacklog',
        'fieldEstimate',
        'preferences',
      ])
        assert.deepEqual(run.config[key], run.prior[key]);
    }
  });
}

// These refusals must preserve existing mappings and never enter board mutation.
for (const options of [
  { mode: 'missing-owner' },
  { mode: 'missing-project' },
  { mode: 'auth' },
  { mode: 'auth-partial' },
  { mode: 'transport' },
  { selector: 'not:a:selector' },
  { selected: { id: 'PVT_wrong', title: 'Wrong board', number: 24 } },
  { selected: { id: 'PVT_bad', title: 42, number: 23 } },
  { selected: { id: 42, title: 'Malformed ID', number: 23 } },
  { selected: { id: 'PVT_bad', title: 'Missing number' } },
  { selected: { id: '', title: 'Empty ID', number: 23 } },
  { selected: { id: 'PVT_bad', title: '', number: 23 } },
]) {
  test(`explicit selector refuses ${JSON.stringify(options)} before mutation`, () => {
    const run = runSetup({ ...options, existing: true });
    assert.notEqual(run.result.status, 0, run.result.stdout);
    assert.match(run.result.stderr, /Could not resolve project/);
    assert.equal(readFileSync(run.configFile, 'utf8'), run.before);
    assert.doesNotMatch(
      run.calls,
      /project","create|createProjectV2\(|linkProjectV2ToRepository|createProjectV2Field|updateProjectV2Field|workflows\(first:/
    );
  });
}
