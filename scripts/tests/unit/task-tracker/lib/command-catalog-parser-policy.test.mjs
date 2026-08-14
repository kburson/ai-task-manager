// @story #1011 #1023
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { commandByName } from '../../../../task-tracker/lib/command-surface/catalog.mjs';
import { VERB_REFERENCE } from '../../../../task-tracker/verbs/help-data.mjs';
import { VALID_KINDS } from '../../../../task-tracker/lib/issue-kind.mjs';

const argumentNames = (name) => commandByName(name).arguments.map((argument) => argument.name);

test('task metadata matches high-risk verb parser surfaces', () => {
  assert.deepEqual(argumentNames('test'), ['#N']);
  assert.deepEqual(argumentNames('new'), [
    '[title|docs/plans/<file>.md]',
    '--kind <code|docs-only|audit|research|spike|epic>',
  ]);

  for (const expected of [
    '<N>',
    '--size <S>',
    '--estimate <H>',
    '--reason "<text>"',
    '--item "<work (~effort)>"',
  ]) {
    assert.ok(
      argumentNames('inflate-estimate').includes(expected),
      `inflate-estimate: ${expected}`
    );
  }

  assert.ok(argumentNames('reconcile').some((name) => name.includes('backfill')));
  for (const expected of ['--as <duplicate|not-planned>', '--of <N>']) {
    assert.ok(argumentNames('close').includes(expected), `close: ${expected}`);
  }
  assert.ok(argumentNames('fleet').includes('[prune]'));
  assert.ok(argumentNames('fleet').includes('--dry-run'));
  assert.ok(argumentNames('approve').includes('--human'));
  assert.ok(argumentNames('demote').includes('--rework "<reason>"'));
  for (const verb of ['promote', 'demote', 'plan-approve', 'approve']) {
    assert.ok(argumentNames(verb).includes('#N'), `${verb}: required #N`);
    assert.equal(argumentNames(verb).includes('[#N]'), false, `${verb}: must not claim fallback`);
  }
  for (const verb of ['check', 'ensureChecked', 'ensureUnchecked']) {
    for (const flag of ['--label "<label>"', '--labels-file <path>']) {
      assert.ok(argumentNames(verb).includes(flag), `${verb}: ${flag}`);
    }
  }
  assert.ok(argumentNames('kind').includes('<code|docs-only|audit|research|spike|epic>'));
  for (const flag of ['--skip-init', '--closed', '--all', '--keep-retired']) {
    assert.ok(argumentNames('migrate').includes(flag), `migrate: ${flag}`);
  }
  for (const flag of ['--as-a "<role>"', '--i-want "<goal>"', '--so "<benefit>"']) {
    assert.ok(argumentNames('user-story').includes(flag), `user-story: ${flag}`);
  }
  assert.ok(argumentNames('chore-mode').includes('<on ["reason"]|off|status>'));

  assert.ok(argumentNames('refine').includes('--labels <name[,name...]>'));
  assert.equal(
    argumentNames('refine').some((name) => name.includes('--add-label')),
    false
  );
});

test('documented examples use parser-valid aliases and enumerated issue kinds', () => {
  for (const alias of VERB_REFERENCE.promote.aliases) {
    assert.ok(
      VERB_REFERENCE.promote.examples.some((example) =>
        new RegExp(`^/task ${alias} #?\\d+$`).test(example)
      ),
      `${alias}: example must include the required issue`
    );
  }

  const kinds = [...VALID_KINDS];
  const newKindFlag = VERB_REFERENCE.new.flags.find((entry) => entry.flag.startsWith('--kind'));
  assert.equal(newKindFlag.flag, `--kind <${kinds.join('|')}>`);
  for (const example of VERB_REFERENCE.new.examples) {
    const kind = example.match(/--kind\s+(\S+)/)?.[1];
    if (kind) assert.ok(VALID_KINDS.has(kind), `new: invalid example kind ${kind}`);
  }
});

test('pull-next documents every reachable R4P-to-Plan delegated refusal', () => {
  const exits = new Map(
    commandByName('pull-next').exitCodes.map((entry) => [entry.code, entry.meaning])
  );
  assert.match(exits.get(4), /Ready-for-Planning-to-Plan gate/);
  assert.match(exits.get(5), /legal R4P-to-Plan edge/);
  assert.match(exits.get(6), /entry-marker history/);
  assert.match(exits.get(7), /mutation lock.*verified/);
});

test('task metadata exposes parser-accurate exit statuses', () => {
  const testExits = new Map(
    commandByName('test').exitCodes.map((entry) => [entry.code, entry.meaning])
  );
  assert.match(testExits.get(3), /verification command/i);
  assert.match(testExits.get(7), /mutation lock/i);
  assert.equal(testExits.has(8), false);
  assert.equal(testExits.has(9), false);
  assert.equal(testExits.has(10), false);

  const reconcileExits = new Map(
    commandByName('reconcile').exitCodes.map((entry) => [entry.code, entry.meaning])
  );
  assert.match(reconcileExits.get(7), /mutation lock/i);
  assert.match(reconcileExits.get(8), /could not be recorded/i);
  assert.equal(reconcileExits.has(9), false);
  assert.equal(reconcileExits.has(10), false);

  for (const verb of ['start', 'pause', 'resume', 'stop', 'update']) {
    const codes = new Set(commandByName(verb).exitCodes.map((entry) => entry.code));
    assert.equal(codes.has(7), false, `${verb}: unreachable bind mismatch`);
    assert.equal(codes.has(8), false, `${verb}: retired preflight exit`);
    assert.equal(codes.has(9), true, `${verb}: drift refusal`);
    assert.equal(codes.has(10), true, `${verb}: assignee refusal`);
  }
  assert.match(
    commandByName('promote').exitCodes.find((entry) => entry.code === 7).meaning,
    /binding.*lock/i
  );
  assert.equal(
    commandByName('promote').exitCodes.some((entry) => entry.code === 8),
    false
  );
  assert.match(
    commandByName('plan-approve').exitCodes.find((entry) => entry.code === 3).meaning,
    /not in Plan/
  );
  assert.match(
    commandByName('approve').exitCodes.find((entry) => entry.code === 3).meaning,
    /not in Review/
  );
  assert.match(
    commandByName('approve').exitCodes.find((entry) => entry.code === 6).meaning,
    /agent review/
  );
  assert.match(
    commandByName('park').exitCodes.find((entry) => entry.code === 2).meaning,
    /missing reason/
  );
  assert.match(
    commandByName('close').exitCodes.find((entry) => entry.code === 8).meaning,
    /human-review approval/
  );
});

test('maintenance and package metadata reject retired routes and expose parser defaults', () => {
  assert.match(commandByName('run-tests').usage, /\[--lane .+\]/);
  const swap = commandByName('options-co-pilot-status-swap');
  assert.equal(
    swap.arguments.some((argument) => argument.name.includes('finalize')),
    false
  );
  const source = readFileSync(
    new URL('../../../../migrate/options-co-pilot-status-swap.mjs', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(source, /--finalize|finalizeSwap/);
});
