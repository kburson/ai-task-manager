#!/usr/bin/env node
// Set the Rank (number) field on an existing GitHub issue's project item.
// Usage: node scripts/gh/set-rank.mjs <issue#> <n>
//
// Rank is the wave-ordering / sequence number read by wave-admission.mjs. It is
// writable at issue-creation time, but there was no dedicated setter for an
// already-open issue — Priority has set-priority.mjs and Status has
// move-state.mjs. This mirrors set-priority.mjs one-for-one, but the write is a
// number field, so it delegates to the shared, already-exercised
// tetherIssueToProject rank branch rather than hand-rolling a mutation.

import { loadConfig } from '../task-tracker/config.mjs';
import { tetherIssueToProject } from './lib/project-tether.mjs';
import { wantsHelp, emitSelfDoc } from '../lib/self-doc.mjs';

// Same precedence writeFields() in project-tether.mjs uses to resolve the Rank
// field id. Detecting it up front lets the CLI warn+exit-0 (instead of throwing)
// on a board that never configured a Rank field — matching project-tether's
// graceful WARN-and-skip behavior.
export function resolveRankFieldId(cfg = {}) {
  return (
    cfg.fieldRank ||
    cfg.rankFieldId ||
    cfg.fieldIds?.rank ||
    cfg.fieldSequence ||
    cfg.sequenceFieldId ||
    cfg.fieldIds?.sequence ||
    ''
  );
}

export async function main(argv, deps = {}) {
  const load = deps.loadConfig || loadConfig;
  const tether = deps.tetherIssueToProject || tetherIssueToProject;
  const log = deps.log || ((s) => console.log(s));
  const err = deps.err || ((s) => process.stderr.write(s));
  const exit = deps.exit || ((c) => process.exit(c));
  const skipNetwork =
    deps.skipNetwork !== undefined ? deps.skipNetwork : process.env.TT_SKIP_NETWORK === '1';

  const cliArgs = argv.slice(2);
  if (wantsHelp(cliArgs)) {
    emitSelfDoc('set-rank');
    return exit(0);
  }
  const issueArg = cliArgs[0];
  const rankArg = cliArgs[1];

  const usage = () => {
    err(
      'Usage: node scripts/gh/set-rank.mjs <issue#> <n>\n' + '  <n>: integer Rank (wave order)\n'
    );
    return exit(1);
  };
  if (!issueArg || !rankArg) return usage();
  if (!/^\d+$/.test(issueArg)) return usage();
  if (!/^\d+$/.test(rankArg)) return usage();

  const rank = Number(rankArg);
  const cfg = load();

  // Unconfigured Rank field: warn and exit 0 without a write, matching
  // project-tether.mjs (which WARNs and skips rather than throwing).
  if (!resolveRankFieldId(cfg)) {
    err(
      `[set-rank] WARN: rank=${rank} supplied but no Rank field id configured ` +
        `(checked cfg.fieldRank, cfg.rankFieldId, cfg.fieldIds.rank). Skipping write.\n`
    );
    return exit(0);
  }

  if (skipNetwork) {
    log(`✓ #${issueArg} → rank ${rank}`);
    return undefined;
  }

  await tether({ cfg, issueNumber: issueArg, rank });
  log(`✓ #${issueArg} → rank ${rank}`);
  return undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((e) => {
    process.stderr.write(`fatal: ${e.message}\n`);
    process.exit(1);
  });
}
