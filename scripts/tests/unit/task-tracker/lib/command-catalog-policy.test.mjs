// @story #1011 #1023 #1042 #1043
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  COMMAND_CATALOG,
  VERB_CONTRACTS,
  VERB_POSITIONAL_ARGUMENTS,
  VERB_RELATED_COMMANDS,
  buildCommandCatalog,
  commandByName,
} from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { ROUTE_IDENTITIES } from '../../../../task-tracker/lib/command-surface/routing.mjs';
import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';
import {
  REQUIRED_HELP_FIELDS,
  normalizeHelpRecord,
  validateHelpRecord,
} from '../../../../task-tracker/lib/command-surface/schema.mjs';
import { EXECUTABLE_ENTRYPOINTS } from '../../../../task-tracker/lib/command-surface/entrypoints.mjs';

const HELP_REQUIRED = new Set([
  'agent-callable-verb',
  'agent-callable-standalone',
  'package-lifecycle-cli',
  'live-maintenance-or-migration',
]);

test('every catalog record satisfies the normalized public help schema', () => {
  assert.ok(COMMAND_CATALOG.length > 0);
  for (const record of COMMAND_CATALOG) {
    assert.deepEqual(validateHelpRecord(record), [], record.name);
    for (const field of REQUIRED_HELP_FIELDS) {
      assert.ok(Object.hasOwn(record, field), `${record.name}: ${field}`);
    }
    assert.equal(Object.isFrozen(record), true, record.name);
  }
});

test('Story Origin creation contract is consistent across help and sanctioned rules (#892)', () => {
  for (const name of ['create-issue', 'preflight-issue']) {
    const command = commandByName(name);
    assert.match(command.usage, /--story-origin-file <p(?:ath)?>/);
    assert.match(command.usage, /\[--plan-metadata-file <p(?:ath)?>\]/);
    assert.match(command.usage, /\[--verification-commands-file <p(?:ath)?>\]/);
  }

  for (const file of [
    'skill/shared/rules/create-issue.md',
    'skill/shared/rules/plan-mode-backlog.md',
  ]) {
    const body = readFileSync(file, 'utf8');
    assert.match(body, /story-origin\.md/);
    assert.match(body, /--story-origin-file \.\/\.tmp\/plan\/story-origin\.md/);
    assert.match(body, /Plan Metadata.*optional/i);
  }
});

test('normalization never fabricates required command semantics', () => {
  const normalized = normalizeHelpRecord({ examples: ['example'] });
  const errors = validateHelpRecord(normalized);
  for (const field of ['name', 'classification', 'purpose', 'usage', 'path', 'routing', 'group']) {
    assert.ok(
      errors.some((error) => error.startsWith(field)),
      `${field}: ${errors.join('; ')}`
    );
  }
});

test('normalization preserves malformed nested values for validation to reject', () => {
  const malformed = normalizeHelpRecord({
    ...COMMAND_CATALOG[0],
    aliases: [undefined],
    preconditions: [undefined],
    effects: [null],
    output: [''],
    exitCodes: [{}],
    examples: [null],
    relatedCommands: ['tbd'],
  });
  const errors = validateHelpRecord(malformed);
  for (const field of [
    'aliases',
    'preconditions',
    'effects',
    'output',
    'exitCodes',
    'examples',
    'relatedCommands',
  ]) {
    assert.ok(
      errors.some((error) => error.startsWith(field)),
      `${field}: ${errors.join('; ')}`
    );
  }
  assert.equal(malformed.preconditions[0], undefined);
  assert.equal(malformed.effects[0], null);

  const placeholderObjects = normalizeHelpRecord({
    ...COMMAND_CATALOG[0],
    arguments: [
      { name: 'undefined', description: 'null' },
      { name: '--mode', description: 'Mode.', default: 'undefined' },
    ],
    exitCodes: [{ code: 0, meaning: 'undefined' }],
  });
  const placeholderErrors = validateHelpRecord(placeholderObjects);
  assert.ok(placeholderErrors.some((error) => error.startsWith('arguments entries')));
  assert.ok(placeholderErrors.some((error) => error.startsWith('arguments default')));
  assert.ok(placeholderErrors.some((error) => error.startsWith('exitCodes entries')));
});

test('schema rejects misspelled command-surface taxonomy values', () => {
  const malformed = normalizeHelpRecord({
    ...commandByName('start'),
    classification: 'agent-callable-ver',
    routing: String.fromCharCode(115, 116, 97, 110, 100, 108, 111, 110, 101),
    group: String.fromCharCode(108, 105, 102, 101, 99, 121, 108, 101),
  });
  const errors = validateHelpRecord(malformed);
  for (const field of ['classification', 'routing', 'group']) {
    assert.ok(
      errors.some((error) => error.startsWith(field)),
      `${field}: ${errors.join('; ')}`
    );
  }
});

test('duplicate canonical source records fail before catalog construction', () => {
  const record = COMMAND_CATALOG[0];
  assert.throws(
    () => buildCommandCatalog([record], [{ ...record, path: 'duplicate/source.mjs' }]),
    /duplicate canonical command.*source/i
  );
});

test('catalog names and aliases are globally unique and resolve canonically', () => {
  const seen = new Set();
  for (const record of COMMAND_CATALOG) {
    for (const name of [record.name, ...record.aliases]) {
      assert.equal(seen.has(name), false, `duplicate command or alias: ${name}`);
      seen.add(name);
      assert.equal(commandByName(name), record, name);
    }
  }
});

test('every help-required shipped entry point resolves to a catalog record', () => {
  for (const entry of EXECUTABLE_ENTRYPOINTS.filter((row) =>
    HELP_REQUIRED.has(row.classification)
  )) {
    const record = COMMAND_CATALOG.find((row) => row.path === entry.path);
    assert.ok(record, entry.path);
    assert.equal(record.classification, entry.classification, entry.path);
    if (entry.command) assert.equal(commandByName(entry.command), record, entry.command);
  }
});

test('every routed standalone record maps back to a shipped standalone entry point', () => {
  for (const record of COMMAND_CATALOG.filter((row) => row.routing === 'standalone')) {
    const entry = EXECUTABLE_ENTRYPOINTS.find((row) => row.path === record.path);
    assert.ok(entry, `${record.name}: unclassified routed path ${record.path}`);
    assert.equal(entry.classification, 'agent-callable-standalone', record.name);
  }
});

test('every package bin identity resolves to its classified target', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../../../../../package.json', import.meta.url), 'utf8')
  );
  for (const [name, target] of Object.entries(pkg.bin)) {
    const record = commandByName(name);
    assert.ok(record, `missing package bin identity: ${name}`);
    assert.equal(record.path, target, name);
  }
});

test('representative maintenance metadata matches real parser contracts', () => {
  const dispositionBackfill = commandByName('backfill-disposition');
  assert.match(dispositionBackfill.usage, /\[--apply\] \[--issues N,N\]/);
  assert.deepEqual(
    dispositionBackfill.arguments.map((argument) => argument.name),
    ['--apply', '--issues N,N', '--yes']
  );
  assert.match(dispositionBackfill.effects.join(' '), /Read-only by default.*--apply writes/i);
  assert.deepEqual(
    dispositionBackfill.exitCodes.map(({ code }) => code),
    [0, 1, 2]
  );
  assert.match(dispositionBackfill.exitCodes[1].meaning, /per-item apply/i);
  assert.match(dispositionBackfill.exitCodes[2].meaning, /usage.*configuration.*fetch/i);
  assert.match(commandByName('heal-timing-starts').usage, /<issue#>/);
  for (const flag of ['--apply', '--check-only', '--yes']) {
    assert.ok(
      commandByName('heal-timing-starts').arguments.some((argument) => argument.name === flag),
      `heal-timing-starts: ${flag}`
    );
  }
  assert.match(commandByName('heal-timing-starts-sweep').usage, /--state closed\|open\|all/);
  assert.match(commandByName('value-report').usage, /--from/);
  assert.doesNotMatch(commandByName('value-report').usage, /--since|--format/);
});

test('high-risk routed metadata enumerates parser arguments and special exits', () => {
  const createIssue = commandByName('create-issue');
  for (const flag of [
    '--title <text>',
    '--body-file <path>',
    '--shape epic|sub-issue|solo|defect|stub',
    '--scope-file <path>',
    '--ac-file <path>',
    '--story-origin-file <path>',
    '--plan-metadata-file <path>',
    '--verification-commands-file <path>',
    '--reproduction-file <path>',
    '--root-cause-file <path>',
    '--fix-direction-file <path>',
    '--out-of-scope-file <path>',
    '--sub-issue-list-file <path>',
    '--idea-file <path>',
    '--label <name>',
    '--priority p0|p1|p2',
    '--size XS|S|M|L|XL',
    '--estimate <hours>',
    '--rank <n>',
    '--start-time <iso>',
    '--kind <kind>',
    '--parent <N>',
    '--assignee <login>',
    '--allow-duplicate-child',
    '--dry-run',
    '--no-tether',
    '--no-placeholder-substitution',
    '--internal',
  ]) {
    assert.ok(
      createIssue.arguments.some((argument) => argument.name === flag),
      flag
    );
  }
  for (const code of [0, 1, 2, 4, 6, 7]) {
    assert.ok(
      createIssue.exitCodes.some((entry) => entry.code === code),
      `create-issue: ${code}`
    );
  }

  const preflight = commandByName('preflight-issue');
  for (const flag of [
    '--priority <P>',
    '--size <S>',
    '--estimate <hours>',
    '--rank <n>',
    '--start-time <iso>',
  ]) {
    assert.ok(
      preflight.arguments.some((argument) => argument.name === flag),
      flag
    );
  }

  const tether = commandByName('project-tether');
  assert.match(tether.usage, /--issue <N>/);
  assert.doesNotMatch(tether.usage, /project-tether <issue#>/);
  for (const flag of [
    '--issue <N>',
    '--parent <N>',
    '--status <state>',
    '--priority P0|P1|P2',
    '--size XS|S|M|L|XL',
    '--estimate <hours>',
    '--rank <N>',
  ]) {
    assert.ok(
      tether.arguments.some((argument) => argument.name === flag),
      flag
    );
  }

  const runTests = commandByName('run-tests');
  assert.ok(runTests.arguments.some((argument) => argument.name === '--timing-report'));
  assert.doesNotMatch(runTests.usage, /--timing-report <path>/);

  assert.ok(commandByName('heal-backlog').exitCodes.some((entry) => entry.code === 3));
  for (const code of [5, 7]) {
    assert.ok(commandByName('dispatch-prep').exitCodes.some((entry) => entry.code === code));
  }
});

test('co-review package catalog matches every settled subcommand, flag, and durable exit', () => {
  const coReview = commandByName('co-review');
  for (const command of [
    'init',
    'status',
    'claim',
    'wait',
    'handoff',
    'set-max-turns',
    'supplement',
    'continue',
    'finalize',
  ]) {
    assert.match(coReview.usage, new RegExp(`(?:<|\\|)${command}(?:\\||>)`), command);
  }
  for (const flag of [
    '--dir <path>',
    '--artifact <path>',
    '--owner <identity>',
    '--reviewer <identity>',
    '--max-turns <N>',
    '--import-review <file>',
    '--review-of <sha>',
    '--archive-dir <path>',
    '--actor <identity>',
    '--timeout <seconds>',
    '--response <file>',
    '--commit <sha>',
    '--answers <review>',
    '--review <file>',
    '--decision accepted|changes-requested',
    '--summary <file>',
    '--message <text>',
    '--file <path>',
    '--additional-turns <N>',
    '--approved-by <identity>',
    '--focus <file>',
    '--good-enough',
    '--json',
  ]) {
    assert.ok(
      coReview.arguments.some((argument) => argument.name === flag),
      `co-review: ${flag}`
    );
  }
  assert.match(
    coReview.exitCodes.find(({ code }) => code === 4)?.meaning ?? '',
    /acceptance.*durable.*archive publication.*pending/i
  );
});

test('every task verb has an explicit positional contract', () => {
  assert.deepEqual(
    Object.keys(VERB_POSITIONAL_ARGUMENTS).sort(),
    Object.keys(VERB_REFERENCE).sort()
  );
  for (const [name, positionals] of Object.entries(VERB_POSITIONAL_ARGUMENTS)) {
    const record = commandByName(name);
    assert.ok(record, name);
    for (const positional of positionals) {
      assert.ok(
        record.arguments.some((argument) => argument.name === positional.name),
        `${name}: ${positional.name}`
      );
    }
  }
  for (const [name, expected] of Object.entries({
    start: ['<N>'],
    log: ['#N'],
    reconcile: ['#N', '<accept-live|revert-to-recorded|revert-to-sentinel|backfill>'],
    plan: ['#N'],
    config: ['[<key> <value> | init]'],
    help: ['[<verb>]'],
  })) {
    const names = commandByName(name).arguments.map((argument) => argument.name);
    for (const positional of expected)
      assert.ok(names.includes(positional), `${name}: ${positional}`);
  }
});

test('every task verb has explicit parser-accurate semantics and exit metadata', () => {
  assert.deepEqual(Object.keys(VERB_CONTRACTS).sort(), Object.keys(VERB_REFERENCE).sort());
  assert.deepEqual(Object.keys(VERB_RELATED_COMMANDS).sort(), Object.keys(VERB_REFERENCE).sort());

  for (const name of Object.keys(VERB_REFERENCE)) {
    const record = commandByName(name);
    const contract = VERB_CONTRACTS[name];
    assert.deepEqual(record.preconditions, contract.preconditions, `${name}: preconditions`);
    assert.deepEqual(record.effects, contract.effects, `${name}: effects`);
    assert.deepEqual(record.output, contract.output, `${name}: output`);
    assert.deepEqual(record.relatedCommands, VERB_RELATED_COMMANDS[name], `${name}: related`);
    for (const exitCode of contract.exitCodes) {
      assert.ok(
        record.exitCodes.some((entry) => entry.code === exitCode.code),
        `${name}: exit ${exitCode.code}`
      );
    }
    for (const exitCode of VERB_REFERENCE[name].exitCodes || []) {
      assert.deepEqual(
        record.exitCodes.find((entry) => entry.code === exitCode.code),
        exitCode,
        `${name}: command-specific exit ${exitCode.code}`
      );
    }
  }

  assert.match(commandByName('status').preconditions.join(' '), /tracker state/i);
  assert.doesNotMatch(commandByName('status').preconditions.join(' '), /active.session/i);
  assert.match(commandByName('start').preconditions.join(' '), /issue.*exist/i);
  assert.match(commandByName('new').preconditions.join(' '), /GitHub|repository/i);
  for (const code of [4, 7, 9, 10]) {
    assert.ok(
      commandByName('refine').exitCodes.some((entry) => entry.code === code),
      `refine: ${code}`
    );
  }
  assert.equal(
    commandByName('refine').exitCodes.some((entry) => entry.code === 8),
    false
  );
});

test('every routed verb is represented in the aggregate agent catalog', () => {
  for (const entry of ROUTE_IDENTITIES) {
    const record = commandByName(entry.verb);
    assert.ok(record, entry.verb);
    assert.equal(record.agentCallable, true, entry.verb);
    for (const alias of record.aliases) assert.equal(commandByName(alias), record, alias);
  }
});

test('every agent-callable task record has a real router identity', () => {
  const routed = new Set(ROUTE_IDENTITIES.map((entry) => entry.verb));
  const routerSpecialForms = new Set(['#N', 'help']);
  for (const record of COMMAND_CATALOG.filter(
    (entry) => entry.classification === 'agent-callable-verb'
  )) {
    assert.ok(
      routed.has(record.name) || routerSpecialForms.has(record.name),
      `${record.name}: no task router identity`
    );
  }
  assert.equal(commandByName('switch'), null);
  assert.equal(commandByName('move'), null);
});
