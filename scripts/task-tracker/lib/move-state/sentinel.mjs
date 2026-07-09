// @story #756
// The move-complete sentinel: the last write of a completed state move.
// Its presence — together with a matching Status, entry markers, and both
// timing rows — is the single definition of "this move is done" (see
// `isMoveComplete`). Owned here so the reader and the completion predicate
// have exactly one source of truth, shared by the idempotent short-circuit
// and the promote/demote gates.

export const MOVE_COMPLETE_RE = /<!-- aitm-move-complete state=(\S+) ts=(\S+) -->/;
const GLOBAL_RE = /<!-- aitm-move-complete state=\S+ ts=\S+ -->\n?/g;

/**
 * Upsert the single move-complete sentinel: strip any prior sentinel, then
 * append the new one so it is the final line of the body.
 * @param {string} body
 * @param {string} state target state the move landed in
 * @param {string} ts ISO timestamp
 * @returns {string}
 */
export function writeMoveCompleteMarker(body, state, ts) {
  const stripped = body.replace(GLOBAL_RE, '').replace(/\s+$/, '');
  return `${stripped}\n<!-- aitm-move-complete state=${state} ts=${ts} -->\n`;
}

/**
 * @param {string} body
 * @returns {string} the state the sentinel records, or '' when absent.
 */
export function readMoveCompleteState(body) {
  const m = MOVE_COMPLETE_RE.exec(body || '');
  return m ? m[1] : '';
}

/**
 * The completion predicate. A move is complete iff every authoritative
 * element agrees on the target: the sentinel, the board Status, the entry
 * markers, and both the exit and entry timing rows.
 * @param {{sentinelState:string, statusState:string, entryMarkerPresent:boolean,
 *   exitRowPresent:boolean, entryRowPresent:boolean, target:string}} s
 * @returns {boolean}
 */
export function isMoveComplete(s) {
  return (
    s.sentinelState === s.target &&
    s.statusState === s.target &&
    Boolean(s.entryMarkerPresent) &&
    Boolean(s.exitRowPresent) &&
    Boolean(s.entryRowPresent)
  );
}
