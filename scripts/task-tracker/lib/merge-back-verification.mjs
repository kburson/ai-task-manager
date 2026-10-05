// @story #1882
// Reuse the validated project Test plan; default Node projects retain their sections.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { resolveVerificationProvider } from './verification-provider-registry.mjs';
import { parseVerificationCommands } from './verification-commands.mjs';

const NODE_SECTIONS = ['test:unit', 'test:integration', 'test:slow'];

export function createMergeBackTestRunner({ cfg, projectDir, issueBody = '', deps = {} }) {
  if (!cfg || !projectDir)
    throw new TypeError('merge-back: verification config and projectDir required');
  const execute = deps.execFileSync || execFileSync;
  let setup = null;
  let steps;
  if (cfg.verificationProvider == null) {
    steps = NODE_SECTIONS.map((section) => ({ command: 'npm', args: ['run', section] }));
  } else {
    const provider = resolveVerificationProvider({ config: cfg.verificationProvider, projectDir });
    const plan = provider.planTest({ declaredCommands: parseVerificationCommands(issueBody) });
    if (plan.steps.some((step) => step.rejected)) {
      throw new Error('merge-back: verification plan contains rejected issue commands');
    }
    setup = plan.setup === 'npm-ci' ? ['ci', '--no-audit', '--no-fund', ...plan.setupArgs] : null;
    steps = plan.steps;
  }
  return ({ path: worktreePath } = {}) => {
    const cwd = worktreePath || projectDir;
    if (path.resolve(cwd) !== path.resolve(projectDir)) return false;
    const git = (...args) => String(execute('git', args, { cwd, encoding: 'utf8' })).trim();
    try {
      const head = git('rev-parse', 'HEAD');
      const unchanged = () =>
        git('rev-parse', 'HEAD') === head && git('status', '--porcelain') === '';
      if (!unchanged()) return false;
      const run = (command, args) => {
        execute(command, args, { cwd, stdio: 'inherit', timeout: 600000 });
        if (!unchanged()) throw new Error('merge-back: verifier changed source or HEAD');
      };
      if (setup) run('npm', setup);
      for (const step of steps) run(step.command, [...step.args]);
      return true;
    } catch (error) {
      process.stderr.write(`merge-back: verification refused: ${error.message}\n`);
      return false;
    }
  };
}
