// #721 — `vc:<n>` citation form for AC `aitm-verified cmd="..."` markers.
// A citation names one or more 1-based positions into the issue's own
// `## Verification Commands` list (as returned by `parseVerificationCommands`)
// instead of embedding a raw command string. Purely additive: a `cmd` value
// that isn't a pure space-separated run of `vc:<n>` tokens is not a citation,
// and callers fall back to the legacy embedded-command parse.

const VC_REF_TOKEN_RE = /^vc:(\d+)$/i;

// Returns the cited 1-based indexes, or null when `cmd` is not a pure
// citation (so the caller can fall back to legacy parsing).
export function parseVcRefIndexes(cmd) {
  const tokens = String(cmd || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  const indexes = [];
  for (const token of tokens) {
    const m = VC_REF_TOKEN_RE.exec(token);
    if (!m) return null;
    indexes.push(Number(m[1]));
  }
  return indexes;
}

// Resolve a citation `cmd` value against the issue's parsed VC list. Returns
// the cited commands' literal strings, or null when `cmd` is not a citation.
// Throws when a citation names a VC entry that doesn't exist.
//
// #772 — resolution is BY ID, not by ordinal position. A `vc:5` names the VC
// entry whose stable `<!-- id=5 -->` marker equals 5, wherever that entry sits
// in the list — so reordering or deleting OTHER entries never re-points a
// citation. Legacy bodies whose VC entries carry no id (all `id: null`, the
// pre-#772 corpus) fall back to the original 1-based ordinal lookup so old
// citations keep resolving unchanged.
export function resolveVcRefCommands(cmd, vcItems) {
  const indexes = parseVcRefIndexes(cmd);
  if (!indexes) return null;
  const items = Array.isArray(vcItems) ? vcItems : [];
  // By-id resolution engages only when EVERY live entry is id-stamped. A body
  // still carrying any id-less entry (the legacy corpus, or a mixed body mid-
  // migration where the #762 author appended un-stamped lines) stays on the
  // original ordinal lookup, so those citations keep resolving as before.
  const allIds = items.length > 0 && items.every((it) => it && Number.isInteger(it.id));
  return indexes.map((n) => {
    if (allIds) {
      const item = items.find((it) => it && it.id === n);
      if (!item) {
        throw new RangeError(
          `vc-ref: cited entry vc:${n} does not exist (no live Verification Commands entry carries id=${n}; it may have been deleted)`
        );
      }
      return item.command;
    }
    const item = items[n - 1];
    if (!item) {
      throw new RangeError(
        `vc-ref: cited entry vc:${n} does not exist (issue declares ${items.length} Verification Commands entries)`
      );
    }
    return item.command;
  });
}

// Resolve a declaration's `cmd` value to a list of literal commands. Only the
// legacy backtick-embedded-command form is honored here.
//
// #804 — the ordinal `cmd="vc:N"` citation fallback is RETIRED. The canonical
// by-id citation lives on the `vc-list` attribute (resolved via
// `resolveVcListStrict`), and DoD-Functional literal declarations keep using the
// backtick form below. A `cmd` value that happens to look like a `vc:N` run is
// no longer resolved as a citation — it simply carries no backtick literals and
// yields `[]`. Never throws.
export function resolveCitedOrLiteralCommands(cmd, _vcItems) {
  const out = [];
  for (const m of String(cmd || '').matchAll(/`([^`]+)`/g)) out.push(m[1]);
  return out;
}

// #804 — strict resolver for the canonical `vc-list="vc:N"` AC citation. Unlike
// `resolveVcRefCommands` (which returns null for a non-citation / empty value so
// legacy callers can fall back), this THROWS whenever a verified/stamped AC's
// `vc-list` fails to resolve to at least one command:
//   - missing / empty / malformed value → `parseVcRefIndexes` returns null →
//     `resolveVcRefCommands` returns null → we throw (no silent zero-command
//     green), and
//   - a dangling citation → the RangeError from `resolveVcRefCommands`
//     propagates unchanged.
// This closes the false-green gap where an empty `vc-list=""` resolved to `[]`
// and the code-complete gate read the AC as trivially satisfied.
export function resolveVcListStrict(vcList, vcItems) {
  const resolved = resolveVcRefCommands(vcList, vcItems);
  if (resolved === null || resolved.length === 0) {
    throw new RangeError(
      `vc-list: verified AC cites no resolvable verification command (vc-list=${JSON.stringify(
        String(vcList == null ? '' : vcList)
      )}); a verified AC must cite at least one canonical vc:N entry`
    );
  }
  return resolved;
}

// #762 — write-side counterpart to `resolveVcRefCommands`. Given a list of
// literal command strings and the issue's parsed VC list, return
// `{ cmd, appended }` where:
//   - `cmd` is the space-joined `vc:<n>` citation run to embed in the AC's
//     `aitm-verified cmd="…"` declaration, and
//   - `appended` lists the commands (in append order) that were NOT already in
//     `vcItems`, so the caller can extend `## Verification Commands` and keep
//     the cited 1-based positions stable.
// Position rule: a command matching an existing `vcItems[i].command` exactly
// reuses position `i + 1`; an absent command is assigned the next position
// after the current list length, accounting for earlier appends in the same
// call (a command cited twice appends once and cites one position). Pure
// function — no I/O, no mutation of `vcItems`.
export function citeCommands(commands, vcItems) {
  const existing = (Array.isArray(vcItems) ? vcItems : []).map((it) =>
    it && typeof it.command === 'string' ? it.command : String(it)
  );
  const appended = [];
  const tokens = [];
  for (const raw of Array.isArray(commands) ? commands : []) {
    const command = String(raw);
    const pos = existing.indexOf(command);
    if (pos !== -1) {
      tokens.push(`vc:${pos + 1}`);
      continue;
    }
    let ap = appended.indexOf(command);
    if (ap === -1) {
      appended.push(command);
      ap = appended.length - 1;
    }
    tokens.push(`vc:${existing.length + ap + 1}`);
  }
  return { cmd: tokens.join(' '), appended };
}
