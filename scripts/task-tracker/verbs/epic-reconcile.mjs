// #887 — `/task epic-reconcile [<N>]` records that an epic's Acceptance Criteria
// have been reconciled against what its children actually delivered.
//
// An epic's ACs are written at decomposition time, when its children are still
// proposals. By the time the last child lands, delivery has usually drifted from
// description — so the epic's own acceptance is staler than anything else on the
// board precisely when it is about to be relied on. `gateCodeComplete` refuses
// develop-exit for an epic without this marker.
//
// The stamp is DELIBERATELY not wired into any promote path. Epic #883's
// decision 1 makes reconciliation a distinct act the operator performs; a verb
// that some transition called automatically would reintroduce exactly the
// never-revisited state the marker exists to detect.
//
// Refusing a non-epic target is not decoration either: it stops the marker
// decaying into a generic "I looked at this" stamp and losing its epic-only
// meaning.

import { loadState } from '../state.mjs';
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { setEpicAcReconciled, parseIssueKind } from '../lib/issue-kind.mjs';

export async function verbEpicReconcile(ctx) {
  const { cfg, statePath, rest, pexec } = ctx;
  const args = (rest || []).map((a) => String(a).trim()).filter(Boolean);

  let target;
  if (args.length >= 1) {
    target = args[0].replace(/^#/, '');
  } else {
    const s = loadState(statePath);
    if (!s.active || s.active === 'discover') {
      console.error(
        '[task-tracker] epic-reconcile: no active task — pass an issue number: /task epic-reconcile <N>'
      );
      process.exit(1);
    }
    target = String(s.active).replace(/^#/, '');
  }

  if (!/^\d+$/.test(target)) {
    console.error(`[task-tracker] epic-reconcile: invalid issue number "${target}"`);
    process.exit(1);
  }

  let refused = null;
  await mutateIssueBody({
    issueNumber: target,
    repo: cfg.repo,
    deps: { pexec },
    mutate: (base) => {
      const kind = parseIssueKind(base);
      if (kind !== 'epic') {
        // Refuse by returning the body unchanged — `mutateIssueBody` owns the
        // write, so the guard belongs inside the same transaction that read the
        // live body rather than in a separate fetch that could race it.
        refused = kind;
        return base;
      }
      return setEpicAcReconciled(base);
    },
  });

  if (refused) {
    console.error(
      `[task-tracker] epic-reconcile: #${target} is kind "${refused}", not "epic" — AC reconciliation is epic-only. Run \`/task kind ${target} epic\` first if this really is a container epic.`
    );
    process.exit(1);
  }

  console.log(
    `[task-tracker] ✓ #${target} AC-reconciled: epic goals re-read against delivered children.`
  );
}
