// #494, #500 — `/task kind [<N>] <kind>` sets (or clears) the no-commit-lane
// issue-kind marker on an existing issue. With one positional argument the kind
// is applied to the active (bound) issue; with two, the first is the target
// issue number.
//
// Valid kinds: `code` (default — REMOVES the marker, since code needs none),
// `audit`, `research`, `spike`, `epic`. No-commit-lane kinds re-route the
// develop→test gate onto the deliverable-evidence path (see lib/issue-kind.mjs +
// code-complete-gate).
//
// Body write flows through `mutateIssueBody` so the live body is fetched in the
// same transaction; the marker upsert is idempotent.
//
// #899 — the kind-marker write and the Functional DoD block's kind filtering
// happen in the SAME `mutateIssueBody` transaction: `filterDodForKind` only
// ran at issue-creation render time, so a kind changed after creation (e.g. a
// PBI promoted to `epic`) used to leave the DoD block frozen at whatever it was
// born with (see #899's deep-dive, reproduced live on #860/#859).
// `reconcileDodForKind` re-derives the block for the new kind, preserving every
// already-stamped evidence marker on an item whose kind-membership didn't
// change.

import { readFileSync } from 'node:fs';
import { loadState } from '../state.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { setIssueKindMarker, normalizeKind, VALID_KINDS } from '../lib/issue-kind.mjs';
import { reconcileDodForKind } from '../lib/dod-kind-filter.mjs';
import { locateFunctionalSection } from '../lib/lifecycle-dod.mjs';
import { dodPath } from '../paths.mjs';

export async function verbKind(ctx) {
  const { cfg, statePath, rest, pexec } = ctx;
  const args = (rest || []).map((a) => String(a).trim()).filter(Boolean);

  let target;
  let kindArg;
  if (args.length >= 2) {
    target = args[0].replace(/^#/, '');
    kindArg = args[1];
  } else if (args.length === 1) {
    const s = loadState(statePath);
    if (!s.active || s.active === 'discover') {
      console.error(
        '[task-tracker] kind: no active task — pass an issue number: /task kind <N> <kind>'
      );
      process.exit(1);
    }
    target = String(s.active).replace(/^#/, '');
    kindArg = args[0];
  } else {
    console.error(`Usage: /task kind [<N>] <kind>\n  kind ∈ { ${[...VALID_KINDS].join(', ')} }`);
    process.exit(1);
  }

  let kind;
  try {
    kind = normalizeKind(kindArg);
  } catch (err) {
    console.error(`[task-tracker] kind: ${err.message}`);
    process.exit(1);
  }

  if (!/^\d+$/.test(target)) {
    console.error(`[task-tracker] kind: invalid issue number "${target}"`);
    process.exit(1);
  }

  await mutateIssueBody({
    issueNumber: target,
    repo: cfg.repo,
    deps: { pexec },
    mutate: (base) => {
      const marked = setIssueKindMarker(base, kind);
      const loc = locateFunctionalSection(marked);
      if (!loc) return marked;
      const templateDodText = readFileSync(dodPath(), 'utf8');
      const reconciled = reconcileDodForKind(loc.section, templateDodText, kind);
      if (reconciled === loc.section) return marked;
      return loc.before + reconciled + loc.after;
    },
  });

  const verb = kind === 'code' ? 'cleared (code is the default lane)' : `set to "${kind}"`;
  console.log(`[task-tracker] ✓ kind on #${target}: ${verb}.`);
}
