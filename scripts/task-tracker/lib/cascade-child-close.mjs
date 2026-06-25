// Cascade-child-close fail-closed decision (#512).
//
// `verbs/close.mjs` cascade-closes every Review child of an epic: it first moves
// the child's board card to Done (`runMoveState(child, 'done')`), then calls
// `gh issue close` for that child. Before #512 a genuine non-benign board-move
// failure only emitted a `console.warn` and the code STILL ran `gh issue close`,
// leaving the child issue CLOSED while its board card was not Done — the exact
// split-brain state the primary close path avoids.
//
// The benign `done → done` no-op (a child already on Done) is NOT a failure: it
// must stay silent and still close. Only a genuine non-benign move failure blocks
// the child close.
//
// Map a `runMoveState` result to a close decision.
//
//   childMove — the structured result from `runMoveState(child, 'done', …)`:
//               `{ ok, benign, stderr, status }` (or undefined if not run).
//
//   → { shouldClose: false, detail }  the move genuinely failed (ok===false and
//                                     not benign): DO NOT close the child; surface
//                                     `detail` with recovery guidance and skip to
//                                     the next child.
//   → { shouldClose: true }           the move succeeded, was a benign no-op, or
//                                     no result was produced: close as before.
//
// Pure + total over its input so it can be exercised without spawning a process
// or hitting the network.
export function decideCascadeChildClose({ childMove } = {}) {
  if (childMove && childMove.ok === false && !childMove.benign) {
    const detail =
      (childMove.stderr || '').trim() || `move-state.mjs exited ${childMove.status ?? 'non-zero'}`;
    return { shouldClose: false, detail };
  }
  return { shouldClose: true };
}
