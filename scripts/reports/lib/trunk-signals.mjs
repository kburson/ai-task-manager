// #782 — git-facing loader for the trunk attribution signal maps consumed by
// the resolver in `attribution-resolver.mjs`. Kept separate from the resolver so
// the resolver stays pure/fixture-testable; the git I/O is injectable via
// `deps.run` for tests.

import { execFileSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../../task-tracker/lib/process-timeouts.mjs';
import { buildTrunkTokenMap, buildTrunkShaSet, LOG_FIELD_SEP } from './attribution-resolver.mjs';

// One `git log <trunk> --format='%H<US>%s'` call yields both maps:
//   trunkTokens — Map<issueNumber, sha[]> from `[#N]` subject tokens
//   trunkShas   — Set of every full trunk SHA
export function loadTrunkSignals({ trunk = 'trunk', deps = {} } = {}) {
  const run =
    deps.run ??
    ((args) =>
      execFileSync('git', args, {
        encoding: 'utf8',
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
      }));

  const logText = run(['log', trunk, `--format=%H${LOG_FIELD_SEP}%s`]);
  const trunkTokens = buildTrunkTokenMap(logText);
  const shaText = logText
    .split('\n')
    .map((l) => {
      const sep = l.indexOf(LOG_FIELD_SEP);
      return sep === -1 ? '' : l.slice(0, sep);
    })
    .join('\n');
  const trunkShas = buildTrunkShaSet(shaText);
  return { trunkTokens, trunkShas };
}
