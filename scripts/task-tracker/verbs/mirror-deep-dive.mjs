// #331 — CLI surface for `mirrorDeepDiveFromComment`.
//
// Usage:
//   /task mirror-deep-dive --from-comment <id|url|#issuecomment-<id>> [#N]
//
// Defaults to the active bound issue when `#N` is omitted. Refuses (exit 2)
// when `--from-comment` is missing or when no `#N` and no active binding.

import { mirrorDeepDiveFromComment, repairDeepDivePlacement } from '../lib/deep-dive.mjs';
import { loadState } from '../state.mjs';

function parseRepoFromCfg(cfg) {
  const repo = cfg?.repo;
  if (!repo) {
    throw new Error('mirror-deep-dive: cfg.repo is not configured');
  }
  return repo;
}

export async function verbMirrorDeepDive(ctx) {
  const { cfg, rest, statePath, deps = {} } = ctx;
  let fromComment = null;
  let repairPlacement = false;
  let target = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--from-comment') {
      if (fromComment !== null || rest[i + 1] == null || rest[i + 1].startsWith('--')) {
        process.stderr.write('mirror-deep-dive: invalid --from-comment value\n');
        process.exit(2);
      }
      fromComment = rest[++i];
    } else if (a.startsWith('--from-comment=')) {
      if (fromComment !== null || a.slice('--from-comment='.length) === '') {
        process.stderr.write('mirror-deep-dive: invalid --from-comment value\n');
        process.exit(2);
      }
      fromComment = a.slice('--from-comment='.length);
    } else if (a === '--repair-placement') {
      if (repairPlacement) {
        process.stderr.write('mirror-deep-dive: duplicate --repair-placement\n');
        process.exit(2);
      }
      repairPlacement = true;
    } else if (/^#?\d+$/.test(a)) {
      if (target !== null) {
        process.stderr.write('mirror-deep-dive: duplicate issue target\n');
        process.exit(2);
      }
      target = a.replace(/^#/, '');
    } else {
      process.stderr.write(`mirror-deep-dive: unknown argument "${a}"\n`);
      process.exit(2);
    }
  }

  if (repairPlacement && fromComment) {
    process.stderr.write(
      'mirror-deep-dive: --repair-placement and --from-comment are mutually exclusive\n'
    );
    process.exit(2);
  }
  if (!repairPlacement && !fromComment) {
    process.stderr.write(
      'mirror-deep-dive: --from-comment <id|url|#issuecomment-<id>> or --repair-placement is required\n'
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
  const result = repairPlacement
    ? await (deps.repairDeepDivePlacement || repairDeepDivePlacement)({
        issueNumber: Number(target),
        repo,
      })
    : await (deps.mirrorDeepDiveFromComment || mirrorDeepDiveFromComment)({
        issueNumber: Number(target),
        repo,
        fromComment,
      });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
