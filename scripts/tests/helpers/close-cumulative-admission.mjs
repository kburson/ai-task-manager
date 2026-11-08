// @story #2165 — native hook admission uses the public Start-created binding.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const owner = fileURLToPath(new URL('../../../', import.meta.url));

// Removing exact binding or singleton ownership checks must fail these cases.
export function qualifyCumulativeAdmission(f, second, sid) {
  const observations = [];
  const hook = (name, cwd, toolName, toolInput) => {
    const result = spawnSync(
      process.execPath,
      [path.join(owner, 'scripts/task-tracker', name + '.mjs')],
      {
        cwd,
        env: f.env,
        input: JSON.stringify({ session_id: sid, cwd, tool_name: toolName, tool_input: toolInput }),
        encoding: 'utf8',
        timeout: 20000,
      }
    );
    assert.equal(result.status, 0, result.stderr);
    const verdict = result.stdout.trim() ? JSON.parse(result.stdout) : null;
    observations.push({ name, cwd, toolName, toolInput, verdict, stderr: result.stderr });
    return verdict;
  };
  const commands = [
    'npx aitm explain 1878 --artifact-commit ' + f.f.head + ' --json',
    'npx aitm close 1878 --explain --json --artifact-commit ' + f.f.head,
    'npm test',
  ];
  for (const name of ['bash-guard', 'activity-guard']) {
    for (const command of commands)
      assert.notEqual(
        hook(name, f.root, 'Bash', { command })?.decision,
        'block',
        name + ' ' + command
      );
  }
  assert.equal(hook('bash-guard', second, 'Bash', { command: 'npm test' })?.decision, 'block');
  const source = { file_path: 'scripts/tests/unit/fixture/source.test.mjs' };
  assert.notEqual(hook('source-edit-gate', f.root, 'Write', source)?.decision, 'block');
  assert.notEqual(hook('activity-guard', f.root, 'Write', source)?.decision, 'block');
  assert.equal(hook('source-edit-gate', second, 'Write', source)?.decision, 'block');
  // Provider-only adversarial ownership observations; preserve all real native
  // binding/evidence bytes and restore the exact synthetic provider snapshot.
  const original = readFileSync(f.stateFile);
  try {
    for (const assignees of [
      [],
      [{ login: 'foreign-owner' }],
      [{ login: 'fixture' }, { login: 'foreign-owner' }],
    ]) {
      const state = JSON.parse(original);
      state.issues[1878].assignees.nodes = assignees;
      state.issues[1878].assignees.totalCount = assignees.length;
      writeFileSync(f.stateFile, JSON.stringify(state));
      const verdict = hook('source-edit-gate', f.root, 'Write', source);
      assert.equal(verdict?.decision, 'block', JSON.stringify({ assignees, verdict }));
      assert.match(JSON.stringify(verdict), /assignee|owner/i);
    }
  } finally {
    writeFileSync(f.stateFile, original);
  }
  writeFileSync(
    path.join(path.dirname(f.stateFile), 'native-admission.json'),
    JSON.stringify(observations, null, 2)
  );
}
