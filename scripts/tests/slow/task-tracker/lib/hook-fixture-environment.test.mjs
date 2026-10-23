// @story #2088
// Offline real-hook regression; this is not native worker attestation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { fixtureEnvironment } from '../../../helpers/hook-fixture-environment.mjs';
import {
  nativeHookAuthority,
  installHookProvider,
  runNativeHookFixture,
} from '../../../helpers/native-decomposition-hook-fixture.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';

const authority = await nativeHookAuthority(65);
const BASH_GUARD = fileURLToPath(
  new URL('../../../../task-tracker/bash-guard.mjs', import.meta.url)
);
function runGuard({ cwd, payload, env = fixtureEnvironment(), guardPath }) {
  return runNativeHookFixture({
    cwd,
    payload,
    guardPath,
    env: installHookProvider(cwd, authority, 'develop', env),
  });
}

// Synthetic hook repositories must not borrow their verifier's outer root.
test('fixture environment isolates outer root aliases while explicit foreign authority refuses', () => {
  const before = PROJECT_ROOT_ALIASES.map((key) => process.env[key]);
  const dir = createRuntimeRootFixture('hook-environment-');
  try {
    for (const key of PROJECT_ROOT_ALIASES) process.env[key] = process.cwd();
    const outer = PROJECT_ROOT_ALIASES.map((key) => process.env[key]);
    const payload = {
      tool_name: 'Bash',
      tool_input: { command: "cat > docs/draft.md <<'EOF'\ngh issue create --title example\nEOF" },
    };
    const allowed = runGuard({ cwd: dir, payload, guardPath: BASH_GUARD });
    assert.equal(allowed.code, 0, allowed.stderr);
    assert.equal(allowed.decision, null);
    assert.equal(allowed.stdout, '');
    assert.deepEqual(
      PROJECT_ROOT_ALIASES.map((key) => process.env[key]),
      outer
    );
    const explicit = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !PROJECT_ROOT_ALIASES.includes(key))
    );
    explicit.AI_TASK_MANAGER_PROJECT_DIR = process.cwd();
    const refused = runGuard({ cwd: dir, payload, env: explicit, guardPath: BASH_GUARD });
    assert.equal(refused.decision?.decision, 'block');
    assert.ok(refused.decision.reason.includes('Foreign project root'));
  } finally {
    PROJECT_ROOT_ALIASES.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
