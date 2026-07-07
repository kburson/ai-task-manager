import { loadState } from '../state.mjs';
import { gitInfo as defaultGitInfo, postCommitTrail } from '../commit-trail-handler.mjs';
import { getProjectDir } from '../paths.mjs';
import { hasAttributingCommit as defaultHasAttributingCommit } from '../lib/commit-attribution.mjs';

export async function runCommitTrace({ issueNumber, cfg, projectDir, deps = {} } = {}) {
  if (!issueNumber) throw new Error('commit-trace: issueNumber is required');
  if (!cfg?.repo) throw new Error('commit-trace: cfg.repo is required');
  const cwd = projectDir || getProjectDir();
  const id = String(issueNumber).replace(/^#/, '');
  const getInfo = deps.gitInfo || defaultGitInfo;
  const post = deps.postCommitTrail || postCommitTrail;
  const hasAttribution = deps.hasAttributingCommit || defaultHasAttributingCommit;
  const info = await getInfo(cwd);
  const result = await post({ issueNumber: id, repo: cfg.repo, info, cwd });

  // #733 — assert MESSAGE-based attribution (a `[#N]` token in some commit
  // subject), not SHA reachability. This is the AC1 invariant: commit-trace must
  // surface whether ≥1 commit actually references this issue via its message,
  // which survives rebase/squash/amend where SHA reachability deadlocks.
  //
  // Non-fatal by design: mirrors #730's subject lint. A drive must never crash
  // or deadlock on this check — we surface `attributed` (and, on error,
  // `attributionError`) in the result so callers/tests can assert it, but we
  // never throw out of commit-trace on the attribution path.
  let attributed = null;
  let attributionError = null;
  try {
    attributed = await hasAttribution(id, { cwd });
  } catch (err) {
    attributionError = err?.message || String(err);
  }
  return { ...result, attributed, attributionError };
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
    const id = String(target).replace(/^#/, '');
    process.stdout.write(`✓ Commit trace ${result.action} for #${id}.\n`);
    // #733 — non-fatal attribution advisory. Never exits non-zero on this path.
    if (result.attributed === false) {
      process.stderr.write(
        `⚠ No commit references \`[#${id}]\` in any message yet — attribution is message-based (#727). ` +
          `Prefix a commit subject with \`[#${id}] \` so this issue's work is attributable across history rewrites.\n`
      );
    }
  } catch (err) {
    process.stderr.write(`commit-trace: ${err.message}\n`);
    process.exit(1);
  }
}
