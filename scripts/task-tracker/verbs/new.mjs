import { loadState, saveState, EMPTY_STATE, advanceWordMarker } from '../state.mjs';
import { registerTask, currentBranch } from '../fleet-registry.mjs';
import {
  currentSessionId,
  jsonlPath,
  markerPathFor,
  saveMarker,
  countWords,
} from '../word-counter.mjs';
import { loadPlanFile } from '../lib/plan-file.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// #547 — single-token help-probe guard. `/task new <token>` where <token> is
// the SOLE positional title and one of these (case-insensitive) is a request
// for the verb's usage, not a title. The global `hasHelpFlag` (#394) already
// intercepts `?`, `--help`, `-h` in any argv position, but the bare word
// `help` and `--?` fall through to `verbNew`'s legacy title path and create a
// junk issue (clobbering the active bind). This guard closes that gap.
const HELP_TOKENS = new Set(['help', '?', '--help', '--?', '-h']);

// True only when `rest` is exactly one token and that token is a help token.
// The single-token constraint is deliberate: a multi-word title that merely
// contains "help" (e.g. `"help text is broken"`, or unquoted multi-arg input)
// is a legitimate title and must still create an issue.
export function isHelpProbe(rest) {
  if (!Array.isArray(rest) || rest.length !== 1) return false;
  return HELP_TOKENS.has(String(rest[0]).trim().toLowerCase());
}

// #509 — route `/task new` through the sanctioned `scripts/gh/create-issue.mjs`
// wrapper instead of shelling `gh issue create` directly. The wrapper is the
// single place that stamps the canonical body, `aitm-fields`, Definition of
// Done, the Pickup Directive tail, the Backlog entry marker, project tether,
// and placeholder substitution; a raw `gh issue create` skips all of it and
// leaves the new issue structurally malformed. `--shape stub` is the
// lightweight idea-capture shape that needs only `--title`.
export async function createNewIssue(title, ctx) {
  const { cfg, SKIP_NETWORK, pexec } = ctx;
  if (process.env.TT_FAKE_NEW_ISSUE) return process.env.TT_FAKE_NEW_ISSUE;
  if (SKIP_NETWORK) return '#0';
  const createIssueScript = path.resolve(__dir, '../../gh/create-issue.mjs');
  const labelArgs = cfg.defaultLabels.flatMap((l) => ['--label', l]);
  const { stdout } = await pexec(
    process.execPath,
    [
      createIssueScript,
      '--shape',
      'stub',
      '--title',
      title,
      '--assignee',
      cfg.assignee || '@me',
      ...labelArgs,
    ],
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
          '    `/task save-plan --from-file .tmp/plan/<draft>.md`\n' +
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
  const { title } = resolveTitleAndPlan(rest, s, projectDir);
  const wasDiscover = s.active === 'discover' && s.discoverBucket;
  let previousNote = '';
  const previousActive = s.active;
  if (s.active && s.active !== 'discover' && cfg.autoEndOnSwitch) {
    // Outgoing-side row uses the canonical `switch-out` slug. The target
    // ref is finalized below after `createNewIssue`, so the flush is
    // deferred until we know the new issue number.
  }
  const issue = await createNewIssue(title, ctx);
  if (previousActive && previousActive !== 'discover' && cfg.autoEndOnSwitch) {
    const { deltaMin, deltaWords } = await flushActiveToGH(
      s,
      'switch-out',
      `switch-out → task ${issue}`
    );
    previousNote = ` Previous: ${previousActive} ended (+${deltaMin} min, +${deltaWords} words).`;
  }
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
      wordMarker: s.lastWordMarker ?? 0,
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
    const { startedAt, wordsAtStart } = s.discoverBucket;
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
        wordMarker: advanceWordMarker(s.lastWordMarker, wordsAtStart),
        description: `discovery session reconciled as idle (opened ${startedAt})`,
      })
    );
  }
  const ts = nowIso();
  const sid = currentSessionId();
  let wordsAtStart = 0;
  if (sid) {
    const { totalLines, count } = countWords(jsonlPath(sid), 0);
    saveMarker(markerPathFor(sid), totalLines, count, issue);
    wordsAtStart = count;
  }
  saveState(
    {
      ...EMPTY_STATE,
      active: issue,
      lastActive: issue,
      entryStartTs: ts,
      wordsAtEntryStart: wordsAtStart,
      // #475 AC1 — preserve the durable session-global marker across the new
      // binding (…EMPTY_STATE would otherwise reset it to 0).
      lastWordMarker: advanceWordMarker(s.lastWordMarker, wordsAtStart),
    },
    statePath
  );
  try {
    registerTask(projectDir, issue, projectDir, currentBranch(projectDir));
  } catch {}
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
      wordMarker: advanceWordMarker(s.lastWordMarker, wordsAtStart),
      description: role,
    })
  );
  console.log(`Active: ${issue}.${previousNote} Created with title: "${title}".`);
}
