// @story #888
// Review→Done child-disposition gate (#888, parent epic #883).
//
// `reviewEpicDoneChildrenGate` asks one question: is every child in state
// `done`? A child closed **not planned** answers yes — `defaultFetchSiblings`
// even hard-codes the coercion (`if (!state && sub.state === 'CLOSED')
// state = 'done'`). So the board shows a complete tree while the epic closes
// over scope it dropped. That is the #521 failure mode at epic scale: a tick
// that is not a lie about execution, but is a lie about coverage.
//
// This gate refuses on the CONJUNCTION of two facts it can actually see:
//
//   1. at least one child closed with disposition `not_planned`, and
//   2. at least one AC that is neither ticked nor struck.
//
// Both halves matter. If every AC is ticked, the wontfixed child dropped
// nothing — the epic delivered its promises by other means — and refusing would
// be a nuisance gate that trains operators to route around it. If nothing was
// wontfixed, the gate is inert. The refusal fires exactly where scope went
// missing.
//
// WHY NOT MAP AC→CHILD DIRECTLY. The obvious design is to find the ACs the
// wontfixed child was carrying and check just those. It cannot be done: a child
// closed `not planned` produced no commits, so #886's `findAcCommitCitations`
// (AC → cited shas → child `[#N]`) is structurally blind to precisely the
// children this gate is about. The alternative — scanning AC labels for `#N`
// tokens — would be blind too: epic #883's own ACs carry none. So the gate does
// not guess the mapping; it requires the operator to record it, once, in the
// strike marker.

import { fetchEpicChildren } from './epic-children-gate.mjs';
import { parseIssueKind } from './issue-kind.mjs';
import { danglingAcs } from './ac-strike.mjs';

export async function reviewEpicChildDispositionGate({ cfg, issueNumber, body, deps = {} } = {}) {
  if (!cfg) throw new Error('reviewEpicChildDispositionGate: cfg is required');
  if (!issueNumber) throw new Error('reviewEpicChildDispositionGate: issueNumber is required');

  // Epics only. A leaf issue has no children whose disposition could differ
  // from its own, and `parseIssueKind` defaults to 'code'.
  if (parseIssueKind(body) !== 'epic') return { ok: true, wontfixed: [], dangling: [] };

  let children;
  try {
    children = await fetchEpicChildren({ cfg, parentEpicNumber: issueNumber, deps });
  } catch (err) {
    return {
      ok: false,
      blockers: [`epic-child-disposition-fetch-failed: ${err.message}`],
    };
  }

  const wontfixed = (children || []).filter((c) => c && c.closeReason === 'not_planned');
  if (!wontfixed.length) return { ok: true, wontfixed: [], dangling: [] };

  const dangling = danglingAcs(body);
  if (!dangling.length) return { ok: true, wontfixed, dangling: [] };

  const childList = wontfixed.map((c) => `#${c.number}`).join(', ');
  const acList = dangling.map((ac) => `"${ac.label}"`).join('; ');
  return {
    ok: false,
    wontfixed,
    dangling,
    blockers: [
      `epic-child-disposition-unstruck: epic #${issueNumber} has children closed \`not planned\` (${childList}) ` +
        `while these ACs are neither satisfied nor struck: ${acList}. ` +
        `Either deliver the AC, or record the drop on the AC line with ` +
        `\`<!-- aitm-ac-struck child="#N" reason="…" ts="…" -->\`. ` +
        `Leaving the box unchecked is not a decision — only the marker is.`,
    ],
  };
}
