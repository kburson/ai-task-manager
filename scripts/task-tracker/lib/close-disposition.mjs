// @story #761
// Sanctioned close-lane for **duplicate** / **not-planned** dispositions (#761).
//
// The Done pipeline (`verbs/close.mjs`) enforces the DoD + commit-trace gate and
// lands the issue in the Done column — correct for delivered work, wrong for an
// issue being abandoned as a duplicate or a won't-do. `supersede` is the nearest
// precedent but it (a) drives the dead issue to **Done** via `move-state
// --supersede`, and (b) only closes as `not planned`. This lane instead:
//
//   1. flushes/stops timing so the Refine/Plan rows are closed, not orphaned;
//   2. stamps an `aitm-closed-as reason="<reason>" of="#M"` audit marker;
//   3. closes on GitHub with the correct `stateReason`
//      (`DUPLICATE` for duplicate, `not planned` for not-planned);
//   4. **un-tracks** the issue from the project board (it does NOT land in Done);
//   5. posts an audit comment recording the disposition.
//
// All I/O is injected through `deps` so the unit test drives `runDispose` with
// spies and never touches the network. Pure marker construction is exported for
// direct assertion.

import { serializeMarker, parseMarker } from './marker-grammar.mjs';
import { writeTerminalDisposition, writeTerminalStatusDone } from './terminal-disposition.mjs';

const CLOSED_AS_LINE_RE = /^<!--\s*aitm-closed-as(\s|-->).*$/m;

export const DISPOSITIONS = Object.freeze({
  duplicate: { stateReason: 'DUPLICATE' },
  'not-planned': { stateReason: 'not planned' },
});

function normalizeRef(ref) {
  const m = String(ref)
    .trim()
    .match(/^#?(\d+)$/);
  if (!m) throw new Error(`close-disposition: invalid issue ref ${JSON.stringify(ref)}`);
  return `#${m[1]}`;
}

// Build the `aitm-closed-as` marker. `of` is included only when provided
// (required for `duplicate`, absent for `not-planned`). Pure — no I/O.
export function serializeClosedAs({ reason, of, ts }) {
  const props = { reason: String(reason) };
  if (of != null && of !== '') props.of = normalizeRef(of);
  if (ts) props.ts = String(ts);
  return serializeMarker('closed-as', props);
}

// Read the marker from a body. Returns { reason, of, ts } or null.
export function parseClosedAs(body = '') {
  for (const line of String(body).split('\n')) {
    const parsed = parseMarker(line);
    if (parsed && parsed.name === 'closed-as') {
      return {
        reason: parsed.props.reason || '',
        of: parsed.props.of || '',
        ts: parsed.props.ts || '',
      };
    }
  }
  return null;
}

// Insert (or replace) the marker in a body. Appends on first write; replaces the
// existing line in place on a re-write so the marker stays unique.
export function addClosedAs(body = '', { reason, of, ts }) {
  const marker = serializeClosedAs({ reason, of, ts });
  const src = String(body);
  if (CLOSED_AS_LINE_RE.test(src)) {
    return src.replace(CLOSED_AS_LINE_RE, marker);
  }
  const trimmed = src.replace(/\s+$/, '');
  return `${trimmed}\n\n${marker}\n`;
}

// Validate + normalize the disposition arguments. Throws on bad input so the
// caller (close.mjs) can surface a usage error before any side-effect runs.
export function parseDisposition({ reason, of } = {}) {
  const key = String(reason || '').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(DISPOSITIONS, key)) {
    throw new Error(
      `close --as: unknown disposition ${JSON.stringify(reason)} — expected one of ${Object.keys(
        DISPOSITIONS
      ).join(', ')}`
    );
  }
  let ofRef = '';
  if (of != null && of !== '') ofRef = normalizeRef(of);
  if (key === 'duplicate' && !ofRef) {
    throw new Error('close --as duplicate: --of <M> is required (the surviving issue)');
  }
  // `--of` is meaningful only for `duplicate`; a stray `--of` on not-planned is
  // dropped so the marker never carries a spurious cross-reference.
  if (key !== 'duplicate') ofRef = '';
  return { key, stateReason: DISPOSITIONS[key].stateReason, of: ofRef };
}

// Execute the disposition close. `deps`:
//   - mutateIssueBody({ issueNumber, repo, mutate })  — body writer
//   - writeDisposition({ cfg, issueNumber, disposition })
//   - moveToDone({ cfg, issueNumber })
//   - pexec(cmd, args, opts)                           — GitHub CLI runner
//   - postComment({ issueNumber, repo, body })         — audit comment
//   - flushTiming(issueNumber)                          — close timing rows
//   - now()                                             — ISO timestamp source
//   - log(msg)                                          — optional reporter
export async function runDispose({
  issueNumber,
  reason,
  of,
  repo,
  projectId,
  cfg,
  deps = {},
} = {}) {
  if (issueNumber == null) throw new Error('runDispose: issueNumber is required');
  if (!repo) throw new Error('runDispose: repo is required');
  const {
    mutateIssueBody,
    pexec,
    postComment,
    flushTiming,
    now = () => new Date().toISOString(),
  } = deps;

  const { key, stateReason, of: ofRef } = parseDisposition({ reason, of });
  const ts = now();
  const terminalCfg = cfg || { repo, projectId };

  // 1. Flush + stop timing before the body is closed out.
  if (typeof flushTiming === 'function') await flushTiming(issueNumber);

  // 2. Stamp the audit marker on the body.
  if (typeof mutateIssueBody === 'function') {
    await mutateIssueBody({
      issueNumber,
      repo,
      mutate: (base) => addClosedAs(base, { reason: key, of: ofRef, ts }),
    });
  }

  // 3. Retain the item as terminal board data: write the honest disposition
  //    first, then put the item in Done. Both writes are fail-closed so a
  //    missing field/option cannot silently produce an unclassified close.
  const writeDisposition = deps.writeDisposition || writeTerminalDisposition;
  const moveToDone = deps.moveToDone || writeTerminalStatusDone;
  await writeDisposition({
    cfg: terminalCfg,
    issueNumber,
    disposition: key === 'duplicate' ? 'Duplicate' : 'Discarded',
  });
  await moveToDone({ cfg: terminalCfg, issueNumber });

  // 4. Close on GitHub with the correct stateReason. Verb-internal pexec — the
  //    bash-guard only mediates the operator's Bash tool, not tracker code.
  if (typeof pexec === 'function') {
    await pexec('gh', ['issue', 'close', String(issueNumber), '-R', repo, '--reason', stateReason]);
  }

  // 5. Audit comment.
  if (typeof postComment === 'function') {
    const ofLine = ofRef ? ` It duplicates ${ofRef}.` : '';
    await postComment({
      issueNumber,
      repo,
      body:
        `### 🗂 Closed as ${key}\n\n` +
        `This issue was closed via the sanctioned \`/task close --as ${key}\` ` +
        `disposition lane (GitHub stateReason \`${stateReason}\`).${ofLine} ` +
        `It was retained on the project board in **Done** with Disposition ` +
        `**${key === 'duplicate' ? 'Duplicate' : 'Discarded'}**, and its timing was flushed. ` +
        `No delivery is implied.`,
    });
  }

  return {
    status: 'closed-as',
    issueNumber,
    reason: key,
    of: ofRef,
    stateReason,
    ts,
    retained: true,
  };
}
