// Optimistic-concurrency write helper for GitHub issue bodies (epic #288).
//
// Every aitm-authored body carries an `<!-- aitm-body-version: N -->` marker
// (see `body-version.mjs`). `versionedWriteBody` fetches the current remote,
// applies the caller's `mutate(baseBody) → newBody` to a version-stripped
// base, stamps `N+1`, pushes, then verifies the marker landed. On race-loss
// (concurrent write bumped the marker), it computes both sides' deltas
// against the previous base, refuses on overlap, or rebases ours onto the
// new remote and retries — bounded by `maxRetries` (default 3).
//
// `deps` injection makes the whole helper testable without GitHub I/O.

import { spawn } from 'node:child_process';
import { BODY_VERSION_MARKER_RE, parseBodyVersion, stampBodyVersion } from './body-version.mjs';

// Stale-input drift detection (#293).
//
// Inspect the caller's `mutate(base) → ourLocal` output for an
// `aitm-body-version` marker BEFORE stripping. A correctly-written `mutate`
// operates on the already-stripped `base` and returns a stripped result, so
// `parseBodyVersion(ourLocal)` will be null — the check is a no-op. The
// failure mode this catches: a `mutate: () => body` that ignores `base` and
// returns a captured snapshot of an OLDER body version. In that case the
// snapshot still carries `aitm-body-version: N` with `N < remoteVersion`,
// and we refuse with `reason: 'stale-input'` instead of silently clobbering
// every marker added between the snapshot capture and now.
function checkStaleInput({ ourLocal, remoteVersion, issueNumber }) {
  // Only fire when the caller's output ACTUALLY carries a marker — a missing
  // marker is the normal happy-path (mutate operated on the stripped base
  // and returned a stripped result), not stale. parseBodyVersion conflates
  // "no marker" with "version 0", so we test for the marker directly.
  const src = String(ourLocal ?? '');
  if (!BODY_VERSION_MARKER_RE.test(src)) return;
  const ourLocalVersion = parseBodyVersion(src);
  if (ourLocalVersion < remoteVersion) {
    throw new BodyWriteRefusalError(
      `versionedWriteBody: refusing — stale input on issue #${issueNumber}: ` +
        `caller's mutate returned a body at aitm-body-version=${ourLocalVersion}, ` +
        `but remote is at version=${remoteVersion}. The caller's mutate appears to ` +
        `have ignored its 'base' argument and returned a captured snapshot. Use ` +
        `mutateIssueBody({ mutate }) from lib/issue-body-mutate.mjs so the closure ` +
        `is forced to derive its result from the fresh remote base.`,
      {
        reason: 'stale-input',
        ourDiff: { ourLocalVersion },
        theirDiff: { remoteVersion },
      }
    );
  }
}

// Mutate-return type guard (#347).
//
// Two issue bodies have been silently destroyed by `mutate(base)` returning a
// non-string value: the runtime coerces the return via `String(obj) →
// "[object Object]"` on the way to `gh issue edit --body-file -`, wiping the
// entire body. The most common shape: `mutate: (b) => buildEvidenceBackfill(b,
// {})` — that helper returns `{body, ...}`, not a bare string.
//
// Detect mechanically here, BEFORE the destructive push runs, so the
// corruption surfaces as a thrown TypeError at the call site instead of a
// silent body wipe.
function assertMutateReturnedString({ ourLocal, issueNumber }) {
  if (typeof ourLocal === 'string') return;
  const actual = ourLocal === null ? 'null' : Array.isArray(ourLocal) ? 'array' : typeof ourLocal;
  throw new TypeError(
    `versionedWriteBody: refusing to write — mutate() for issue #${issueNumber} returned ` +
      `${actual}, expected string. This is the body-corruption shape that produces ` +
      `"[object Object]" issue bodies. Common cause: a helper whose return type is not a ` +
      `bare string (e.g. \`buildEvidenceBackfill\` returns \`{body, ...}\`) was used as the ` +
      `mutate() result directly. Unwrap to the string field before returning, or change the ` +
      `helper to return a bare string.`
  );
}

export const DEFAULT_MAX_RETRIES = 3;

function stripVersion(body) {
  return String(body ?? '')
    .replace(BODY_VERSION_MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n');
}

// Find the smallest edited line-range (between common prefix and suffix) and
// return { startInclusive, endExclusive } as 0-based line indices into `before`.
// Returns null when before === after.
function editRange(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  if (before === after) return null;
  let prefix = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefix < minLen && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < minLen - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) {
    suffix++;
  }
  return {
    startInclusive: prefix,
    endExclusive: a.length - suffix,
    newLines: b.slice(prefix, b.length - suffix),
  };
}

function rangesOverlap(r1, r2) {
  if (!r1 || !r2) return false;
  return r1.startInclusive < r2.endExclusive && r2.startInclusive < r1.endExclusive;
}

// Reapply our edit (computed against `base`) onto `remote`.
// Strategy: take their result, splice in our new lines at the same
// base-relative range (offset-shifted by their pre-region length change).
function rebaseOnto({ ourEdit, theirEdit, remote }) {
  const remoteLines = String(remote ?? '').split('\n');
  // theirEdit may be null if they didn't change anything but version. Then
  // our range maps 1:1.
  let offset = 0;
  if (theirEdit) {
    // If their edit is entirely before ours, shift our range by their delta.
    if (theirEdit.endExclusive <= ourEdit.startInclusive) {
      const theirOldLen = theirEdit.endExclusive - theirEdit.startInclusive;
      const theirNewLen = theirEdit.newLines.length;
      offset = theirNewLen - theirOldLen;
    } else if (theirEdit.startInclusive >= ourEdit.endExclusive) {
      // Theirs is entirely after ours → no shift to ours.
      offset = 0;
    } else {
      // Overlap — caller should have refused before reaching here.
      throw new Error('rebaseOnto: cannot rebase overlapping edits');
    }
  }
  const start = ourEdit.startInclusive + offset;
  const end = ourEdit.endExclusive + offset;
  return [...remoteLines.slice(0, start), ...ourEdit.newLines, ...remoteLines.slice(end)].join(
    '\n'
  );
}

export class BodyWriteRefusalError extends Error {
  constructor(message, { reason, ourDiff, theirDiff, attempts } = {}) {
    super(message);
    this.name = 'BodyWriteRefusalError';
    this.reason = reason;
    this.ourDiff = ourDiff;
    this.theirDiff = theirDiff;
    this.attempts = attempts;
  }
}

function ghFetchBody(_repo, issueNumber) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'gh',
      ['issue', 'view', String(issueNumber), '--json', 'body', '-q', '.body'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let out = '',
      err = '';
    proc.stdout.on('data', (d) => {
      out += d;
    });
    proc.stderr.on('data', (d) => {
      err += d;
    });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gh fetch failed (${code}): ${err}`));
      resolve(out);
    });
  });
}

function ghPushBody(_repo, issueNumber, body) {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', ['issue', 'edit', String(issueNumber), '--body-file', '-'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
    });
    proc.stdin.end(body);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`gh push failed (${code}): ${err}`));
      resolve();
    });
  });
}

export async function versionedWriteBody({
  issueNumber,
  repo,
  mutate,
  deps = {},
  maxRetries = DEFAULT_MAX_RETRIES,
} = {}) {
  if (issueNumber == null) throw new Error('versionedWriteBody: issueNumber is required');
  if (typeof mutate !== 'function') {
    throw new TypeError('versionedWriteBody: mutate must be a function (baseBody) => newBody');
  }
  const fetchBody = deps.fetchBody || ghFetchBody;
  const pushBody = deps.pushBody || ghPushBody;

  let attempts = 0;
  let lastBase = null;
  let lastLocal = null;
  let lastVersion = null;

  while (attempts < maxRetries) {
    attempts++;
    const remote = await fetchBody(repo, issueNumber);
    const remoteVersion = parseBodyVersion(remote);
    const remoteBase = stripVersion(remote);

    let ourBase;
    let ourLocal;
    if (lastBase === null) {
      // First attempt — caller's mutate sees the fresh remote base.
      ourBase = remoteBase;
      ourLocal = await mutate(ourBase);
      assertMutateReturnedString({ ourLocal, issueNumber });
      checkStaleInput({ ourLocal, remoteVersion, issueNumber });
    } else {
      // Retry — rebase our last edit onto the new remote.
      const ourEdit = editRange(lastBase, lastLocal);
      const theirEdit = editRange(lastBase, remoteBase);
      if (ourEdit && theirEdit && rangesOverlap(ourEdit, theirEdit)) {
        throw new BodyWriteRefusalError(
          `versionedWriteBody: refusing — overlapping edit on issue #${issueNumber}`,
          {
            reason: 'overlapping-diff',
            ourDiff: { base: lastBase, ours: lastLocal },
            theirDiff: { base: lastBase, theirs: remoteBase },
            attempts,
          }
        );
      }
      if (!ourEdit) {
        // Nothing to write — caller's previous mutate was a no-op against the
        // last base. Treat as success.
        return { status: 'no-op', attempts, version: remoteVersion };
      }
      ourBase = remoteBase;
      ourLocal = rebaseOnto({ ourEdit, theirEdit, remote: remoteBase });
    }

    const targetVersion = remoteVersion + 1;
    const stamped = stampBodyVersion(stripVersion(ourLocal), targetVersion);

    await pushBody(repo, issueNumber, stamped);

    // Verify our exact body landed. Version alone is insufficient: two
    // concurrent writers may both compute targetVersion=N+1, and a marker
    // match could mask a lost write. Require byte-equality with our push —
    // modulo trailing whitespace, which `gh issue view -q .body` appends.
    const verifyRemote = await fetchBody(repo, issueNumber);
    const norm = (s) => String(s ?? '').replace(/\s+$/, '');
    if (norm(verifyRemote) === norm(stamped)) {
      return { status: 'ok', attempts, version: targetVersion };
    }

    // Race lost — record for next iteration.
    lastBase = ourBase;
    lastLocal = stripVersion(ourLocal);
    lastVersion = targetVersion;
  }

  throw new BodyWriteRefusalError(
    `versionedWriteBody: refusing after ${attempts} attempts on issue #${issueNumber}`,
    { reason: 'max-retries-exceeded', attempts, lastVersion }
  );
}
