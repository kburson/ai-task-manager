// #331 — CLI surface for `mirrorDeepDiveFromComment`.
//
// Usage:
//   /task mirror-deep-dive --from-comment <id|url|#issuecomment-<id>> [#N]
//
// Defaults to the active bound issue when `#N` is omitted. Refuses (exit 2)
// when `--from-comment` is missing or when no `#N` and no active binding.

import { mirrorDeepDiveFromComment } from '../lib/deep-dive.mjs';
import { loadState } from '../state.mjs';

function parseRepoFromCfg(cfg) {
  const repo = cfg?.repo;
  if (!repo) {
    throw new Error('mirror-deep-dive: cfg.repo is not configured');
  }
  return repo;
}

export async function verbMirrorDeepDive(ctx) {
  const { cfg, rest, statePath } = ctx;
  let fromComment = null;
  let target = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--from-comment') {
      fromComment = rest[++i];
    } else if (a.startsWith('--from-comment=')) {
      fromComment = a.slice('--from-comment='.length);
    } else if (/^#?\d+$/.test(a)) {
      target = a.replace(/^#/, '');
    }
  }

  if (!fromComment) {
    process.stderr.write(
      'mirror-deep-dive: --from-comment <id|url|#issuecomment-<id>> is required\n'
    );
    process.exit(2);
  }

  if (!target) {
    const state = statePath ? loadState(statePath) : null;
    const active = state?.active || '';
    target = active.replace(/^#/, '');
  }
  if (!target) {
    process.stderr.write(
      'mirror-deep-dive: no issue specified and no active binding — pass #N or /task start #N first\n'
    );
    process.exit(2);
  }

  const repo = parseRepoFromCfg(cfg);
  const result = await mirrorDeepDiveFromComment({
    issueNumber: Number(target),
    repo,
    fromComment,
    deps: {
      ...ctx.deps,
      projectDir: ctx.projectDir,
      withGovernedEffect: ctx.withGovernedEffect ?? ctx.deps?.withGovernedEffect,
    },
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
