import { loadState } from '../state.mjs';
import { gitInfo as defaultGitInfo, postCommitTrail } from '../commit-trail-handler.mjs';
import { getProjectDir } from '../paths.mjs';

export async function runCommitTrace({ issueNumber, cfg, projectDir, deps = {} } = {}) {
  if (!issueNumber) throw new Error('commit-trace: issueNumber is required');
  if (!cfg?.repo) throw new Error('commit-trace: cfg.repo is required');
  const cwd = projectDir || getProjectDir();
  const getInfo = deps.gitInfo || defaultGitInfo;
  const post = deps.postCommitTrail || postCommitTrail;
  const info = await getInfo(cwd);
  return post({ issueNumber: String(issueNumber).replace(/^#/, ''), repo: cfg.repo, info });
}

export async function verbCommitTrace(ctx) {
  const { cfg, statePath, projectDir, rest } = ctx;
  const s = loadState(statePath);
  const target =
    rest.find((a) => /^#?\d+$/.test(a)) || (s.active && s.active !== 'discover' ? s.active : null);
  if (!target) {
    process.stderr.write('Usage: /task commit-trace #N\n');
    process.exit(1);
  }
  try {
    const result = await runCommitTrace({ issueNumber: target, cfg, projectDir });
    process.stdout.write(
      `✓ Commit trace ${result.action} for #${String(target).replace(/^#/, '')}.\n`
    );
  } catch (err) {
    process.stderr.write(`commit-trace: ${err.message}\n`);
    process.exit(1);
  }
}
