#!/usr/bin/env node
// @story #1831
// The submitted shell commands are guard policy inputs; this suite never executes them.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const GUARD = fileURLToPath(new URL('../../../../task-tracker/bash-guard.mjs', import.meta.url));
const HOME = homedir();
const SKILLS = join(HOME, '.codex', 'skills');
const CLAUDE = join(HOME, '.claude');

function runGuard(command) {
  const result = spawnSync(process.execPath, [GUARD], {
    cwd: process.cwd(),
    env: { ...process.env, AI_TASK_MANAGER_SESSION_ID: 'bash-guard-codex-skills-unbound' },
    input: JSON.stringify({ tool_input: { command } }),
    encoding: 'utf8',
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  return result;
}

function allow(command) {
  const result = runGuard(command);
  assert.equal(result.status, 0, command);
  assert.equal(result.stdout, '', command);
}

function block(command, reason) {
  const result = runGuard(command);
  assert.equal(result.status, 0, command);
  assert.notEqual(result.stdout, '', command);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'block', command);
  assert.equal(typeof decision.reason, 'string', command);
  assert.match(decision.reason, reason, command);
}

test('allows extracted absolute Codex skill-file reads', () => {
  allow(`cat ${SKILLS}/using-superpowers/SKILL.md`);
  allow(`sed -n '1,80p' ${SKILLS}/using-superpowers/SKILL.md`);
  allow(`cat ${SKILLS}/nested/../using-superpowers/SKILL.md`);
});

test('does not extend skill reads to sibling or escaped Codex home paths', () => {
  block(`cat ${HOME}/.codex/config.toml`, /outside allowed scope/);
  block(`cat ${HOME}/.codex/skills-other/SKILL.md`, /outside allowed scope/);
  block(`cat ${SKILLS}/../auth.json`, /outside allowed scope/);
  block(`cat ${SKILLS}`, /outside allowed scope/);
});

test('keeps recognized provider-home writes blocked', () => {
  block(`touch ${SKILLS}/using-superpowers/SKILL.md`, /Write operation.*outside allowed scope/);
  block(
    `echo data | tee ${SKILLS}/using-superpowers/SKILL.md`,
    /Write operation.*outside allowed scope/
  );
  block(
    `echo data > ${SKILLS}/using-superpowers/SKILL.md`,
    /Write operation.*outside allowed scope/
  );
  block(`touch ${CLAUDE}/skills/other.md`, /Write operation.*outside allowed scope/);
});

test('read refusal names the Codex skills scope', () => {
  block(`cat ${HOME}/.codex/config.toml`, new RegExp('~[/][.]codex[/]skills[/]'));
});

test('preserves existing project, Claude, system, and temporary path decisions', () => {
  allow('cat ./.scratch/gh/example.md');
  allow(`cat ${CLAUDE}/skills/example.md`);
  allow('/usr/bin/env');
  block('cat /tmp/example.md', /outside allowed scope/);
  block('cat /private/tmp/example.md', /outside allowed scope/);
  block('touch /tmp/example.md', /Write operation.*outside allowed scope/);
});
