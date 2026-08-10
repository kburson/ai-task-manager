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
  'not-planned': { stateReason: 'NOT_PLANNED', cliReason: 'not planned' },
});

const DUPLICATE_NODE_IDS_QUERY = `query($owner:String!,$name:String!,$issue:Int!,$duplicate:Int!){
  repository(owner:$owner,name:$name){
    issue(number:$issue){id}
    duplicate:issue(number:$duplicate){id}
  }
}`;

const CLOSE_DUPLICATE_MUTATION = `mutation($issue:ID!,$duplicate:ID!){
  closeIssue(input:{issueId:$issue,stateReason:DUPLICATE,duplicateIssueId:$duplicate}){
    issue{state stateReason}
  }
}`;

function splitRepository(repo) {
  const parts = String(repo || '').split('/');
  if (parts.length !== 2 || parts.some((part) => part.trim() === '')) {
    throw new Error(`close-disposition: invalid repository ${JSON.stringify(repo)}`);
  }
  return { owner: parts[0], name: parts[1] };
}

function parseGitHubJson(result, operation) {
  const stdout = typeof result === 'string' ? result : result?.stdout;
  try {
    return JSON.parse(String(stdout || ''));
  } catch {
    throw new Error(`close-disposition: ${operation} returned malformed JSON`);
  }
}

async function closeDuplicate({ pexec, issueNumber, ofRef, repo }) {
  const { owner, name } = splitRepository(repo);
  const duplicateNumber = ofRef.replace(/^#/, '');
  const resolved = parseGitHubJson(
    await pexec('gh', [
      'api',
      'graphql',
      '-f',
      `query=${DUPLICATE_NODE_IDS_QUERY}`,
      '-F',
      `owner=${owner}`,
      '-F',
      `name=${name}`,
      '-F',
      `issue=${issueNumber}`,
      '-F',
      `duplicate=${duplicateNumber}`,
    ]),
    'duplicate node-id query'
  );
  const issueId = resolved?.data?.repository?.issue?.id;
  const duplicateIssueId = resolved?.data?.repository?.duplicate?.id;
  if (!issueId || !duplicateIssueId) {
    throw new Error(
      `close-disposition: duplicate node-id query did not resolve #${issueNumber} and ${ofRef}`
    );
  }
  await pexec('gh', [
    'api',
    'graphql',
    '-f',
    `query=${CLOSE_DUPLICATE_MUTATION}`,
    '-F',
    `issue=${issueId}`,
    '-F',
    `duplicate=${duplicateIssueId}`,
  ]);
}

async function readCloseState({ pexec, issueNumber, repo }) {
  const value = parseGitHubJson(
    await pexec('gh', [
      'issue',
      'view',
      String(issueNumber),
      '-R',
      repo,
      '--json',
      'state,stateReason',
    ]),
    'close read-back'
  );
  return {
    state: String(value?.state || '').toUpperCase(),
    stateReason: String(value?.stateReason || '').toUpperCase(),
  };
}

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
    warn = () => {},
  } = deps;

  const { key, stateReason, of: ofRef } = parseDisposition({ reason, of });
  const ts = now();
  const terminalCfg = cfg || { repo, projectId };

  // 1. Flush + stop timing before the body is closed out.
  if (typeof flushTiming === 'function') {
    const flushResult = await flushTiming(issueNumber);
    if (flushResult?.retained > 0) {
      warn(
        `retained ${flushResult.retained} sequence-significant timing row(s) for #${issueNumber}; ` +
          'retry queue remains non-empty'
      );
    }
  }

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

  // 4. Close on GitHub, then read the native state back. Duplicate needs the
  //    surviving issue id in the same GraphQL mutation; the CLI cannot express
  //    that input. Not-planned remains on the supported CLI path.
  if (typeof pexec !== 'function') {
    throw new Error('close-disposition: pexec is required to close and verify the issue');
  }
  if (key === 'duplicate') {
    await closeDuplicate({ pexec, issueNumber, ofRef, repo });
  } else {
    await pexec('gh', [
      'issue',
      'close',
      String(issueNumber),
      '-R',
      repo,
      '--reason',
      DISPOSITIONS[key].cliReason,
    ]);
  }
  const stored = await readCloseState({ pexec, issueNumber, repo });
  if (stored.state !== 'CLOSED') {
    throw new Error(
      `close-disposition: requested state CLOSED but GitHub stored ${stored.state || 'UNKNOWN'}`
    );
  }
  if (stored.stateReason !== stateReason) {
    throw new Error(
      `close-disposition: requested stateReason ${stateReason} but GitHub stored ${
        stored.stateReason || 'UNKNOWN'
      }`
    );
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
        `disposition lane (GitHub stateReason \`${stored.stateReason}\`).${ofLine} ` +
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
    stateReason: stored.stateReason,
    ts,
    retained: true,
  };
}
