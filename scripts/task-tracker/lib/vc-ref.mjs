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
// Throws when a citation names a VC position that doesn't exist.
export function resolveVcRefCommands(cmd, vcItems) {
  const indexes = parseVcRefIndexes(cmd);
  if (!indexes) return null;
  const items = Array.isArray(vcItems) ? vcItems : [];
  return indexes.map((idx) => {
    const item = items[idx - 1];
    if (!item) {
      throw new RangeError(
        `vc-ref: cited entry vc:${idx} does not exist (issue declares ${items.length} Verification Commands entries)`
      );
    }
    return item.command;
  });
}

// Resolve a declaration's `cmd` value to a list of literal commands, trying
// the `vc:<n>` citation form first and falling back to the legacy
// backtick-embedded-command form. Never throws for the legacy fallback path;
// a citation naming a missing VC entry still throws (caller-visible bug, not
// a parse ambiguity).
export function resolveCitedOrLiteralCommands(cmd, vcItems) {
  const cited = resolveVcRefCommands(cmd, vcItems);
  if (cited) return cited;
  const out = [];
  for (const m of String(cmd || '').matchAll(/`([^`]+)`/g)) out.push(m[1]);
  return out;
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
