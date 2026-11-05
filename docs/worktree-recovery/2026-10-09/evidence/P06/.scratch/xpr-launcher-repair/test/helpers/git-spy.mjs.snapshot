import { execFileSync as nodeExecFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const FORBIDDEN = new Set(['add', 'commit', 'reset', 'restore', 'checkout']);

export function createGitSpy() {
  const calls = [];
  const execFileSync = (file, args, options) => {
    const call = Object.freeze({ file, args: Object.freeze([...args]) });
    calls.push(call);
    if (file === 'git' && FORBIDDEN.has(args[0])) {
      throw new Error(`forbidden no-commit Git mutation: git ${args.join(' ')}`);
    }
    return nodeExecFileSync(file, args, options);
  };
  return Object.freeze({
    execFileSync,
    calls,
    assertReadOnly() {
      assert.deepEqual(
        calls.filter(({ file, args }) => file === 'git' && FORBIDDEN.has(args[0])),
        []
      );
    },
  });
}
