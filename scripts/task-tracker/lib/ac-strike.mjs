// @story #888
// Epic AC strike marker (#888, parent epic #883).
//
// An epic AC is a promise. When a child is closed `not planned`, some promise
// usually goes with it — and nothing on the board records that. The child reads
// as closed, `defaultFetchSiblings` coerces it to state `done`, and the epic
// closes over scope it silently dropped.
//
// A *strike* is the affirmative counter-record: the operator says, on the AC
// line itself, that this promise was withdrawn and which child's cut withdrew
// it.
//
//   - [ ] Derived trail groups commits by child <!-- aitm-ac-struck child="#891" reason="cut — subsumed by #886" ts="2026-07-19T…" -->
//
// It rides its own comment rather than the `aitm-verified` marker on purpose: a
// strike is the OPPOSITE of proof. Folding it into the proof marker would make
// "this was delivered" and "this was abandoned" the same syntactic act, and
// every consumer of `parseProofMarker` would then have to remember to exclude
// it. A separate marker fails safe — code that does not know about strikes
// simply sees an unticked AC with an unrecognized comment, which is what it is.
//
// Unticked is NOT struck. That asymmetry is the whole point: leaving a box
// unchecked is the default state of every AC ever written, so it can never be
// evidence of a decision. Only the marker is.

const AC_HEADING_RE = /^#{1,4}\s+Acceptance Criteria\b[^\n]*$/im;
const AC_SECTION_END_RE = /^(#{1,4}\s|<!--\s*aitm-fields:)/m;
const AC_BOX_RE = /^(\s*- \[)([ x])(\]\s+)(.+)$/;

const STRIKE_RE = /<!--\s*aitm-ac-struck\b([^>]*?)-->/i;

// Parse a checkbox line's strike marker. Returns `{ child, reason, ts }` with
// `child` normalized to a bare number, or null when the line carries no strike.
//
// A strike with no parseable `child` still counts as a strike — it records the
// withdrawal even when the attribution is sloppy — but `child` comes back null
// so the gate can report it as unattributed rather than silently crediting it to
// whichever child happened to be wontfixed.
export function parseAcStrike(text) {
  const m = String(text || '').match(STRIKE_RE);
  if (!m) return null;
  const attrs = m[1] || '';
  const child = attrs.match(/\bchild\s*=\s*"#?(\d+)"/i);
  const reason = attrs.match(/\breason\s*=\s*"([^"]*)"/i);
  const ts = attrs.match(/\bts\s*=\s*"([^"]*)"/i);
  return {
    child: child ? Number(child[1]) : null,
    reason: reason ? reason[1] : null,
    ts: ts ? ts[1] : null,
  };
}

// Every AC checkbox in the body's `## Acceptance Criteria` section, with its
// tick state and strike (if any), in body order.
//
// Section location mirrors `epic-ac-commit-citation.mjs` and
// `body-invariants.mjs` deliberately — same heading grammar, and the same
// `###`-terminates-the-section trap, so all three agree on what "the AC section"
// means. Divergence here would be worse than the duplication.
export function findAcStrikes(body) {
  const src = String(body || '');
  const heading = src.match(AC_HEADING_RE);
  if (!heading) return [];
  const start = heading.index + heading[0].length;
  const rest = src.slice(start);
  const endMatch = rest.match(AC_SECTION_END_RE);
  const endIdx = endMatch ? start + endMatch.index : src.length;

  const lines = src.split('\n');
  const startLine = src.slice(0, start).split('\n').length - 1;
  const endLine = src.slice(0, endIdx).split('\n').length;

  const out = [];
  for (let i = startLine; i < endLine && i < lines.length; i += 1) {
    const box = lines[i].match(AC_BOX_RE);
    if (!box) continue;
    out.push({
      lineIndex: i,
      checked: box[2] === 'x',
      label: String(box[4])
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      strike: parseAcStrike(box[4]),
    });
  }
  return out;
}

// The ACs that are neither satisfied nor withdrawn — the epic's outstanding
// promises. This, not "unchecked", is the set the disposition gate reports.
export function danglingAcs(body) {
  return findAcStrikes(body).filter((ac) => !ac.checked && !ac.strike);
}
