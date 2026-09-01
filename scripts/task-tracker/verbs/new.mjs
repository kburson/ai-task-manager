import {
  loadState,
  saveState,
  EMPTY_STATE,
  advanceWordMarker,
  stateFullWordMarker,
} from '../state.mjs';
import { registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
  aiAppName,
} from '../word-counter.mjs';
import { loadPlanFile } from '../lib/plan-file.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// #547 — single-token help-probe guard. `/task new <token>` where <token> is
// the SOLE positional title and one of these (case-insensitive) is a request
// for the verb's usage, not a title. The global `hasHelpFlag` (#394/#1023)
// intercepts `?`, `--help`, and `-h` only in the command-help position, while
// the bare word `help` and legacy `--?` still reach this verb-local guard.
// It never reinterprets later option values as a help request.
const HELP_TOKENS = new Set(['help', '?', '--help', '--?', '-h']);

// True only when `rest` is exactly one token and that token is a help token.
// The single-token constraint is deliberate: a multi-word title that merely
// contains "help" (e.g. `"help text is broken"`, or unquoted multi-arg input)
// is a legitimate title and must still create an issue.
export function isHelpProbe(rest) {
  if (!Array.isArray(rest) || rest.length !== 1) return false;
  return HELP_TOKENS.has(String(rest[0]).trim().toLowerCase());
}

// #687 — pull an optional `--kind <k>` pair out of the raw `rest` tokens so the
// remaining tokens still form the title (buildContext hands `new` its argv
// unparsed). Returns `{ kind, rest }` where `kind` is the value string (or null
// when absent) and `rest` is `rest` minus the single flag/value pair. Only the
// first `--kind` occurrence is consumed; everything else — including legitimate
// title words — is preserved by index. A trailing `--kind` with no following
// value is dropped as a malformed flag rather than swallowing the (absent) next
// token. When no `--kind` is present, `rest` is returned unchanged so the
// no-kind path stays byte-identical to prior behavior (AC3).
export function extractKind(rest) {
  if (!Array.isArray(rest)) return { kind: null, rest: [] };
  const i = rest.indexOf('--kind');
  if (i === -1) return { kind: null, rest };
  const value = i + 1 < rest.length ? String(rest[i + 1]) : null;
  const remaining =
    value === null ? [...rest.slice(0, i)] : [...rest.slice(0, i), ...rest.slice(i + 2)];
  return { kind: value, rest: remaining };
}

// #748 Defect B — after `extractKind` strips `--kind <v>`, any remaining
// flag-shaped token in the title remainder is an unrecognized flag, NOT a title
// word. The legacy title path used to `rest.join(' ')` these straight into the
// issue title (so `/task new Foo --shape solo` created an issue titled
// "Foo --shape solo") and silently dropped body-seed flags like `--from-file`.
// `findUnknownFlags` surfaces every such token so `verbNew` can refuse with a
// usage error before any issue is created. Help tokens (`--help`, `-h`, `--?`)
// never reach here: the global `hasHelpFlag` guard (#394) and `isHelpProbe`
// intercept them upstream. A "flag-shaped" token is `--word` or `-x` (a single
// dash + a letter); a bare `-` or a negative number like `-3` is left as title.
export function findUnknownFlags(rest) {
  if (!Array.isArray(rest)) return [];
  return rest.map((t) => String(t)).filter((t) => /^--[^\s]/.test(t) || /^-[A-Za-z]/.test(t));
}

// #509 — route `/task new` through the sanctioned `scripts/gh/create-issue.mjs`
// wrapper instead of shelling `gh issue create` directly. The wrapper is the
// single place that stamps the canonical body, `aitm-fields`, Definition of
// Done, the Pickup Directive tail, the Backlog entry marker, project tether,
// and placeholder substitution; a raw `gh issue create` skips all of it and
// leaves the new issue structurally malformed. `--shape stub` is the
// lightweight idea-capture shape that needs only `--title`.
// #687 — `kind` (optional) forwards `--kind <k>` to the wrapper so investigation
// stubs (spike/research/audit) are stamped with the correct issue kind. When
// null/empty the argv omits `--kind` entirely, keeping the wrapper on its
// default `code` path with the body left unmarked (AC3).
// #748 Defect A — `/task new` mints lightweight idea-capture stubs; forwarding
// `cfg.defaultLabels` blanket-labelled every capture with content-unrelated
// labels (this is how #747 was born tagged epic/bug/cleanup/refactor). The
// blanket forward is removed: `/task new` never applies default labels. Labels
// belong to the content, added deliberately later — not to every stub.
export async function createNewIssue(title, ctx, kind = null) {
  const { cfg, SKIP_NETWORK, pexec } = ctx;
  if (process.env.TT_FAKE_NEW_ISSUE) return process.env.TT_FAKE_NEW_ISSUE;
  if (SKIP_NETWORK) return '#0';
  const createIssueScript = path.resolve(__dir, '../../gh/create-issue.mjs');
  const kindArgs = typeof kind === 'string' && kind ? ['--kind', kind] : [];
  // #793 — `/task new` lands issues UNASSIGNED in Backlog. Do not force
  // `--assignee`; assignment is opt-in (explicit `--assignee`, or the
  // defect-spawn `[Y|n]` self-assign prompt).
  const { stdout } = await pexec(
    process.execPath,
    [createIssueScript, '--shape', 'stub', '--title', title, ...kindArgs],
    { timeout: cfg.hookNetworkTimeoutMs * 3 }
  );
  const m = stdout.trim().match(/\/issues\/(\d+)/);
  if (!m) throw new Error(`could not parse issue number from: ${stdout}`);
  return `#${m[1]}`;
}

// Resolve title + plan file path from args and current state.
// Returns { title, planFile } where planFile may be null.
function resolveTitleAndPlan(rest, s, projectDir) {
  const firstArg = (rest[0] || '').trim();
  const inDiscover = s.active === 'discover' && s.discoverBucket;

  // Branch 1: in discover state
  if (inDiscover) {
    const savedPlanFile = s.discoverBucket.savedPlanFile || null;
    if (!savedPlanFile) {
      process.stderr.write(
        'new: no saved plan in the active discover bucket.\n' +
          '  Compose your plan to a file, then run:\n' +
          '    `/task save-plan --from-file .scratch/plan/<draft>.md`\n' +
          '  Then retry `/task new`.\n'
      );
      process.exit(1);
    }
    const { title } = loadPlanFile(savedPlanFile);
    return { title, planFile: savedPlanFile };
  }

  // Branch 2: plan file path given (ends in .md and resolves to a file)
  if (firstArg.endsWith('.md')) {
    const resolved = path.resolve(projectDir, firstArg);
    if (!existsSync(resolved)) {
      process.stderr.write(`new: plan file not found: ${resolved}\n`);
      process.exit(1);
    }
    const { title } = loadPlanFile(resolved);
    return { title, planFile: resolved };
  }

  // Branch 3: not in discover state, no plan file — print guidance
  if (!firstArg) {
    process.stderr.write(
      'new: no active discovery plan and no plan file given.\n' +
        '  Start a discovery session:    `/task discover`\n' +
        '  Or provide a saved plan file: `/task new docs/plans/<file>.md`\n'
    );
    process.exit(1);
  }

  // Legacy: plain title passed directly (backwards compat for callers that pass a title string)
  return { title: rest.join(' ').trim(), planFile: null };
}

export async function verbNew(ctx) {
  // #547 — short-circuit a single-token help probe before any side effect
  // (queue drain, state load, issue creation, or bind switch). Printing help
  // and returning leaves the active bind and the board untouched.
  if (isHelpProbe(ctx.rest)) {
    const { verbHelp } = await import('./help.mjs');
    verbHelp();
    return;
  }
  const {
    cfg,
    statePath,
    projectDir,
    rest,
    role,
    SKIP_NETWORK,
    drainQueueIfAny,
    safePostTiming,
    flushActiveToGH,
    nowIso,
  } = ctx;
  await drainQueueIfAny();
  const s = loadState(statePath);
  // #687 — strip `--kind <k>` out of the raw argv before the remaining tokens
  // are joined into a title (legacy branch does `rest.join(' ')`); a bare
  // `--kind spike` token would otherwise leak into the issue title.
  const { kind, rest: titleRest } = extractKind(rest);
  // #748 Defect B — reject unrecognized flags before creating anything. A
  // flag-shaped remainder token (`--shape`, `--from-file`, `-x`) is not a title
  // word; the legacy path used to join it into the title and silently drop
  // body-seed flags. Error with a clear usage message and exit non-zero so no
  // malformed issue is minted and no intended body is lost without notice.
  const unknownFlags = findUnknownFlags(titleRest);
  if (unknownFlags.length > 0) {
    process.stderr.write(
      `new: unrecognized ${unknownFlags.length > 1 ? 'flags' : 'flag'}: ${unknownFlags.join(', ')}\n` +
        '  `/task new` takes a plain title or a plan-file path, plus optional `--kind <k>`.\n' +
        '  It has no body-seed flag; compose a plan file and pass its path instead:\n' +
        '    `/task new docs/plans/<file>.md`\n'
    );
    process.exit(1);
  }
  const { title } = resolveTitleAndPlan(titleRest, s, projectDir);
  const wasDiscover = s.active === 'discover' && s.discoverBucket;
  let previousNote = '';
  const previousActive = s.active;
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    // #534 — the outgoing-side row uses the paired `switch-out:#<issue>` slug
    // naming the new issue it hands off to. The target ref is finalized below
    // after `createNewIssue`, so the flush is deferred until we know the number.
  }
  const issue = await createNewIssue(title, ctx, kind);
  if (previousActive && previousActive !== 'discover' && cfg.autoEndOnSwitch) {
    // #1142 — the outgoing flush owns the transcript tail and must advance the
    // old issue's cursor before the new issue reseeds that cursor. Seeding first
    // made the flush start at EOF and rewrote marker ownership back to the old
    // issue, dropping both primary and full-expansion tail words.
    const { deltaMin, deltaWords } = await flushActiveToGH(
      s,
      `switch-out:${issue}`,
      `Switching out to task ${issue}`
    );
    previousNote = ` Previous: ${previousActive} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
  const sid = currentSessionId();
  let wordsAtStart = 0;
  let fullWordsAtStart = null;
  if (sid) {
    const existingMarker = loadMarker(markerPathFor(sid));
    const counted = countWords(jsonlPath(sid), 0, { provider: aiAppName(), sid });
    if (counted.status === 'ok') {
      wordsAtStart = advanceWordMarker(
        advanceWordMarker(s.lastWordMarker, existingMarker.words),
        counted.count
      );
      fullWordsAtStart = advanceWordMarker(
        stateFullWordMarker(s, existingMarker),
        counted.fullExpansion
      );
      saveMarker(markerPathFor(sid), counted.totalLines, wordsAtStart, issue, fullWordsAtStart);
    } else {
      wordsAtStart = existingMarker.words;
    }
  }
  const bindWordMarker = advanceWordMarker(s.lastWordMarker, wordsAtStart);
  const createdTs = nowIso();
  const { buildRow } = await import('../gh-timing-comment.mjs');
  const { PHASE_EVENTS } = await import('../phase-events.mjs');
  await safePostTiming(
    issue,
    buildRow({
      ts: createdTs,
      event: PHASE_EVENTS.backlog.enter.event,
      // First row of a fresh issue's timing log — no prior reference point.
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      // #475 AC1 — carry the durable session-global marker forward; never 0
      wordMarker: bindWordMarker,
      fullWordMarker: fullWordsAtStart,
      description: PHASE_EVENTS.backlog.enter.description,
    })
  );
  if (wasDiscover && !SKIP_NETWORK) {
    // The discovery bucket's only entry is stamped with the moment the bucket
    // opened (`startedAt`). Replaying that stale ts into a timing row trips
    // the 60s freshness guard in `buildRow` (which no flag defeats), deadlocking
    // promotion for any real (> 60s) discovery session (#234). The guard is a
    // deliberate anti-backdating invariant, so rather than weaken it we
    // reconcile the elapsed bucket time honestly: ONE fresh-stamped row that
    // records the whole window as idle. No active work is fabricated.
    const { startedAt, wordsAtStart: bucketWordsAtStart } = s.discoverBucket;
    const startedMs = Date.parse(startedAt);
    const idleMin = Number.isFinite(startedMs)
      ? Math.max(0, Math.round((Date.parse(createdTs) - startedMs) / 60000))
      : 0;
    await safePostTiming(
      issue,
      buildRow({
        ts: createdTs,
        event: 'discovery: idle-reconciled',
        // activeSec:0 honest — discovery has no active session; the entire
        // bucket window is recorded as idle below, nothing is fabricated.
        activeSec: 0,
        idleSec: idleMin * 60,
        deltaWords: 0,
        // #475 AC1 — monotonic carry-forward, never below the durable marker
        wordMarker: advanceWordMarker(bindWordMarker, bucketWordsAtStart),
        fullWordMarker: fullWordsAtStart,
        description: `discovery session reconciled as idle (opened ${startedAt})`,
      })
    );
  }
  const ts = nowIso();
  saveState(
    {
      ...EMPTY_STATE,
      active: issue,
      lastActive: issue,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      // #475 AC1 — preserve the durable session-global marker across the new
      // binding (…EMPTY_STATE would otherwise reset it to 0).
      lastWordMarker: bindWordMarker,
      lastFullWordMarker: fullWordsAtStart ?? stateFullWordMarker(s),
    },
    statePath
  );
  try {
    registerTask(projectDir, issue, projectDir, currentBranch(projectDir));
  } catch {
    /* best-effort: failure must not abort the primary operation */
  }
  await safePostTiming(
    issue,
    buildRow({
      ts,
      event: 'start',
      // First start row of a fresh issue's timing log — no prior reference.
      activeSec: 0,
      idleSec: 0,
      deltaWords: 0,
      // #475 AC1 — monotonic carry-forward of the durable marker
      wordMarker: bindWordMarker,
      fullWordMarker: fullWordsAtStart,
      description: role,
    })
  );
  console.log(`Active: ${issue}.${previousNote} Created with title: "${title}".`);
}
