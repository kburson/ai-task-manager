// Runtime context shared by the dispatcher and all lifecycle verb modules.
//
// `buildContext()` parses argv, loads config, and bundles the cross-verb helpers
// (timing flush, queue drain, board moves, GraphQL sub-issue lookups) into a
// single object passed to each verb. Extracted from task-tracker.mjs as part of
// issue #10 so each lifecycle verb can live in its own file under verbs/.

import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from './config.mjs';
import { selfCheckFieldConfig } from './lib/field-config-warn.mjs';
import { postTimingEvent, buildRow, readTimingCommentBody, bodyOf } from './gh-timing-comment.mjs';
import { lastRowTsFromBody, lastRowFromBody } from './lib/timing-rows.mjs';
import { isDepartureEvent } from './lib/timing-events/index.mjs';
import { PHASE_EVENTS, resolvePhaseEvent } from './phase-events.mjs';

// Re-exported so downstream verbs (promote/demote/review/new/close/switch —
// sub-issues #128, #129 of epic #126) can pull the canonical table without
// importing the sibling module directly.
export { PHASE_EVENTS };
import { enqueue, drain, drainAndDiscard } from './queue.mjs';
import {
  currentSessionId,
  aiAppName,
  jsonlPath,
  markerPathFor,
  loadMarker,
  saveMarker,
  countWords,
} from './word-counter.mjs';
import {
  collectEventTimestamps,
  computeActiveAndIdleSeconds,
  resolveFlushStartMs,
} from './active-time.mjs';
import { recordSessionRefOnChange } from './lib/session-ref.mjs';
import { mutateIssueBody } from './lib/issue-body-mutate.mjs';
import { advanceWordMarker } from './state.mjs';
import { findMainWorktreePath, currentBranch } from './fleet-registry.mjs';
import { gql, splitRepo } from '../gh/lib/github-projects.mjs';
import { runMoveStateHost } from '../gh/move-state.mjs';
import { getProjectDir } from './paths.mjs';
import { GH_API_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { assembleCapabilities } from './lib/runtime-capabilities.mjs';
import { verifyGovernedEffect } from './lib/work-lease/guard.mjs';
import { createWorkLeaseProvider } from './lib/work-lease/provider.mjs';
import { normalizeIssueCloseSnapshot } from './lib/closed-issue-convergence.mjs';
import { normalizeSubIssueBoardSnapshot } from './lib/sub-issue-board-snapshot.mjs';

const pexec = promisify(execFile);

export function nowIso() {
  return new Date().toISOString();
}

export function minutesBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

export function createLazyWorkLeaseStore(factory) {
  if (typeof factory !== 'function') {
    throw new TypeError('work-lease provider factory must be a function');
  }
  let initialized = false;
  let store;
  return () => {
    if (!initialized) {
      store = factory();
      initialized = true;
    }
    return store;
  };
}

// #385 / #444 / #882 — classify a non-zero `move-state.mjs` outcome as benign or
// genuine. The one benign class is an exit-5 illegal SELF-loop (`X → X`): the
// issue is already in the requested state, so the request was already satisfied.
//
// #882 made self-transitions a legal no-op in `validateTransition`, so the host
// now exits 0 on this path and the branch is unreachable in normal operation. It
// is kept as a backstop for a stale `--from` override, and — critically —
// de-enumerated: it was previously a hardcoded list patched once per self-loop
// encountered (`done → done`, then `test → test`), which is what let
// `review → review` fail. The regex backreference covers every state, so it can
// never again need a per-state patch.
//
// Every other non-zero (a real gate refusal, a spawn `ENOENT`, an unknown
// state) is genuine and must be surfaced. Pure + exported for tests.
const SELF_LOOP_REFUSAL = /illegal transition:\s*([\w-]+)\s*→\s*\1\b/i;

export function classifyMoveStateBenign({ state, status, stderr } = {}) {
  if (status !== 5) return false;
  const m = SELF_LOOP_REFUSAL.exec(String(stderr || ''));
  return Boolean(m) && String(state || '').toLowerCase() === m[1].toLowerCase();
}

// #882 — the machine token `scripts/gh/move-state.mjs` writes to stdout when it
// short-circuits a self-transition. Pure + exported so the token contract is
// pinned by a test rather than duplicated as a bare literal at each read site.
export function isMoveStateNoop(stdout) {
  return /^aitm-move-noop\b/m.test(String(stdout || ''));
}

// #385 — map a rejected `move-state.mjs` subprocess (promisify(execFile) error
// shape: numeric `.code` for a non-zero exit, string e.g. 'ENOENT' for a spawn
// failure, plus `.stderr`/`.stdout`) to the structured result callers consume.
// Pure + exported for regression tests so the swallow-vs-surface decision can
// be exercised without spawning a real process.
export function buildMoveStateErrorResult({ state, err } = {}) {
  const e = err || {};
  const status = typeof e.code === 'number' ? e.code : null;
  const stderr = String(e.stderr || '');
  const stdout = String(e.stdout || '');
  const benign = classifyMoveStateBenign({ state, status, stderr });
  return { ok: false, status, benign, stdout, stderr, error: e };
}

// #764 — the migrated generic mover. Drives a state move through the in-process
// `runMoveStateHost` seam instead of spawning `node scripts/gh/move-state.mjs`,
// preserving the exact `{ ok, status, benign, stdout, stderr }` contract that
// close.mjs (and every other ctx-based caller) consumes.
//
// The host returns a numeric exit code and writes its readout/refusal text to
// the REAL `process.stdout`/`process.stderr` — it does not accept injectable
// streams. So we tee-capture those streams around the call and feed the captured
// stderr into the UNCHANGED `buildMoveStateErrorResult`/`classifyMoveStateBenign`,
// which keeps exact parity with the pre-migration subprocess: the exit-5
// `done → done` / `test → test` self-loops (whose BLOCKED line the host writes to
// stderr) are still classified benign, every other non-zero still surfaces.
//
// `deps` is a test seam: inject a spy `host` (and optionally the stream/log
// sinks) to exercise classification without a real board write. `extraArgs`
// forwards flags (`--supersede`, `--from <state>`, `--force`) into the synthetic
// argv the same way the old spawn appended them.
export async function runMoveStateInProcess(
  issue,
  state,
  {
    env: envOverride,
    silent = false,
    extraArgs = [],
    skipNetwork = false,
    tailProfile = 'task-owner',
    reviewAuthority = null,
  } = {},
  {
    host = runMoveStateHost,
    stdout = process.stdout,
    stderr = process.stderr,
    log = console.log,
    warn = console.warn,
  } = {}
) {
  if (skipNetwork) {
    return { ok: true, status: 0, benign: false, skipped: true, stdout: '', stderr: '' };
  }
  const issueNum = String(issue).replace(/^#/, '');
  // argv[0..1] are placeholders; parseMoveStateArgs reads from index 2.
  const argv = [process.execPath, 'move-state.mjs', issueNum, state, ...extraArgs];
  const mergedEnv = {
    ...process.env,
    ...(envOverride || {}),
    AITM_INTERNAL: '1',
    AITM_VERB_CONTEXT: 'runtime',
  };

  let outBuf = '';
  let errBuf = '';
  const realOut = stdout.write;
  const realErr = stderr.write;
  const capture =
    (bufRef) =>
    (chunk, ...rest) => {
      const cb = typeof rest[rest.length - 1] === 'function' ? rest[rest.length - 1] : undefined;
      bufRef.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      if (cb) cb();
      return true;
    };
  const outParts = [];
  const errParts = [];
  stdout.write = capture(outParts);
  stderr.write = capture(errParts);
  let code;
  try {
    code = await host({ argv, env: mergedEnv, tailProfile, reviewAuthority });
  } finally {
    stdout.write = realOut;
    stderr.write = realErr;
  }
  outBuf = outParts.join('');
  errBuf = errParts.join('');

  if (code === 0) {
    if (!silent && outBuf.trim()) log(outBuf.trim());
    return {
      ok: true,
      status: 0,
      benign: false,
      // #882 — the host emits this token when the requested state IS the current
      // state and it short-circuited without side-effects. Callers that need to
      // distinguish "moved" from "already there" (e.g. the `reverified` banner in
      // verbs/test.mjs) read this instead of the old exit-5 `benign` signal.
      noop: isMoveStateNoop(outBuf),
      stdout: String(outBuf || ''),
      stderr: String(errBuf || ''),
    };
  }
  const result = buildMoveStateErrorResult({
    state,
    err: { code, stdout: outBuf, stderr: errBuf },
  });
  if (!result.benign) {
    warn(`[task-tracker] Could not move ${issue} to ${state}: move-state exited ${code}`);
    if (result.stderr.trim()) warn(result.stderr.trim());
    warn(`[task-tracker] Run manually: node scripts/gh/move-state.mjs ${issueNum} ${state}`);
  }
  return result;
}

import { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes } from './close-gate.mjs';
export { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes };

export function handleMigrateResult(result, { stderr = process.stderr, exit = process.exit } = {}) {
  if (result.status === 0) return;
  if (result.error) stderr.write(`[task-tracker] migrate spawn error: ${result.error.message}\n`);
  if (result.signal) stderr.write(`[task-tracker] migrate killed by signal: ${result.signal}\n`);
  exit(result.status || 1);
}

export async function postRuntimeQueuedTimingEvent(
  event,
  { repo, timeoutMs, post = postTimingEvent } = {}
) {
  if (event?.kind !== 'timing') return undefined;
  return post({
    issueNumber: event.issue,
    repo,
    row: event.row,
    ...(event.projectionId === undefined ? {} : { projectionId: event.projectionId }),
    ...(event.subOperationId === undefined ? {} : { subOperationId: event.subOperationId }),
    timeoutMs,
  });
}

// Legacy per-event description fallbacks. Used only when a caller does not
// supply a description AND does not supply a phase descriptor that resolves
// against PHASE_EVENTS. Retained for back-compat with callers that emit
// ad-hoc event slugs ('paused', 'switch-end', etc.) outside the lifecycle
// table. PHASE_EVENTS is the canonical source for the lifecycle slugs (#516).
const LEGACY_DESCRIPTION_FALLBACKS = {
  pause: 'task paused',
  paused: 'task paused',
  close: 'task closed',
  end: 'task closed',
  'switch-end': 'switched to next task',
};

export function buildContext(rawArgv = process.argv.slice(2)) {
  const _roleIdx = rawArgv.indexOf('--role');
  const role = _roleIdx >= 0 && _roleIdx + 1 < rawArgv.length ? rawArgv[_roleIdx + 1] : 'solo';
  const _argvClean =
    _roleIdx >= 0 ? rawArgv.filter((_, i) => i !== _roleIdx && i !== _roleIdx + 1) : rawArgv;
  const rawVerb = _argvClean[0] || 'status';
  const verb = /^\d+$/.test(rawVerb) ? `#${rawVerb}` : rawVerb;
  const ISSUE_ARG_VERBS = new Set([
    'log',
    'resume',
    'start',
    'board',
    'check',
    'ensureChecked',
    'ensureUnchecked',
    'commit-trace',
    'close',
    'review',
    'approve',
    'plan-approve',
    'promote',
    'demote',
    'next',
    'reconcile',
  ]);
  const rest = _argvClean
    .slice(1)
    .map((a) => (ISSUE_ARG_VERBS.has(verb) && /^\d+$/.test(a) ? `#${a}` : a));

  const projectDir = getProjectDir();
  const cfg = loadConfig();
  // #314 — surface configuration drift once per process so operators see
  // missing project-field ids before silent skips bury them.
  if (process.env.TT_SKIP_FIELD_SELF_CHECK !== '1') {
    selfCheckFieldConfig({ cfg });
  }
  const statePath = path.join(projectDir, cfg.statePath);
  const queuePath = path.join(projectDir, cfg.queuePath);
  const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

  const ctx = {
    cfg,
    projectDir,
    statePath,
    queuePath,
    SKIP_NETWORK,
    role,
    rest,
    verb,
    pexec,
    nowIso,
    minutesBetween,
    CLOSE_OWNED_CHECKBOXES,
    uncheckedPreCloseCheckboxes,
    verifyGovernedEffect,
  };
  // Opening the local authority may initialize SQLite and project identity.
  // Keep it behind a memoized accessor so status/help and all other read-only
  // commands build the runtime without opening any work-lease authority.
  ctx.getWorkLeaseStore = createLazyWorkLeaseStore(() =>
    createWorkLeaseProvider({ config: cfg, projectDir })
  );
  ctx.getWorkLeaseIdentity = () => {
    const sessionId = currentSessionId();
    return Object.freeze({
      hostId: os.hostname(),
      provider: aiAppName(),
      agentRunId: sessionId,
      sessionId,
      pid: process.pid,
      branch: currentBranch(projectDir),
    });
  };

  ctx.safePostTiming = async (issue, row) => {
    if (SKIP_NETWORK) return { ok: true, skipped: true };
    try {
      await postTimingEvent({
        issueNumber: issue,
        repo: cfg.repo,
        row,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      });
      return { ok: true };
    } catch (err) {
      enqueue({ kind: 'timing', issue, row }, queuePath);
      return { ok: false, queued: true, err: err.message };
    }
  };

  // #476 — append-only session-ref recorder. Routed through `mutateIssueBody`
  // so the diff/version guards apply; the mutate only ever ADDS a marker, so it
  // cannot trip `MarkerLossError`. Failures are swallowed: a session-ref write
  // problem must never break the timing flush (parity with `safePostTiming`).
  ctx.safeRecordSessionRef = async (issue, { sid, jsonlPath: jp, ts }) => {
    if (SKIP_NETWORK) return { ok: true, skipped: true };
    try {
      const res = await mutateIssueBody({
        issueNumber: String(issue).replace(/^#/, ''),
        repo: cfg.repo,
        mutate: (base) => recordSessionRefOnChange(base, { sid, jsonlPath: jp, ts }).body,
        deps: { pexec },
      });
      return { ok: true, status: res?.status };
    } catch (err) {
      return { ok: false, err: err.message };
    }
  };

  // #720 — read the timestamp (ms) of the most recent existing timing-log row,
  // used to anchor the flush Active-duration window. Mirrors the swallow-on-
  // failure contract of `safePostTiming`/`safeRecordSessionRef`: SKIP_NETWORK
  // and any read/parse failure return `null`, which `resolveFlushStartMs` treats
  // as "no prior row" and falls back to `entryStartTs`. Never throws.
  ctx.safeReadLastRowTs = async (issue) => {
    if (SKIP_NETWORK) return null;
    try {
      const result = await readTimingCommentBody({
        issueNumber: String(issue).replace(/^#/, ''),
        repo: cfg.repo,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      });
      const tsStr = lastRowTsFromBody(bodyOf(result));
      if (!tsStr) return null;
      const ms = Date.parse(tsStr);
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  };

  // #822 — read the last timing-log row's `{ ts, event }` (event lower-cased).
  // Same swallow-on-failure contract as `safeReadLastRowTs`: SKIP_NETWORK and any
  // read/parse failure return null. Used by `flushActiveToGH` to detect an
  // unclosed finalize/orphan `idle` tail before appending a departure row.
  ctx.safeReadLastRow = async (issue) => {
    if (SKIP_NETWORK) return null;
    try {
      const result = await readTimingCommentBody({
        issueNumber: String(issue).replace(/^#/, ''),
        repo: cfg.repo,
        timeoutMs: cfg.hookNetworkTimeoutMs,
      });
      return lastRowFromBody(bodyOf(result));
    } catch {
      return null;
    }
  };

  ctx.drainQueueIfAny = async () => {
    if (SKIP_NETWORK) return;
    await drain(
      (evt) =>
        postRuntimeQueuedTimingEvent(evt, {
          repo: cfg.repo,
          timeoutMs: cfg.hookNetworkTimeoutMs,
        }),
      queuePath
    );
  };

  ctx.flushAndForgetQueueFor = async (issueRef) => {
    if (SKIP_NETWORK) return { delivered: 0, discarded: 0 };
    const ref = String(issueRef).replace(/^#/, '');
    return drainAndDiscard(
      async (evt) => {
        await postRuntimeQueuedTimingEvent(evt, {
          repo: cfg.repo,
          timeoutMs: cfg.hookNetworkTimeoutMs,
        });
      },
      queuePath,
      (evt) => String(evt.issue).replace(/^#/, '') === ref
    );
  };

  ctx.flushActiveToGH = async (state, event, description, phase, opts = {}) => {
    // Phase descriptor (optional): `{state, phase}` where state is a lifecycle
    // state slug (backlog/refine/plan/develop/test/review/done) and phase is
    // `enter` or `complete`. When supplied and resolvable against
    // PHASE_EVENTS, it provides defaults for `event` and `description` that
    // the caller can still override by passing them explicitly. Wiring only
    // in this issue (#127) — no call-sites yet supply a descriptor.
    const resolved = resolvePhaseEvent(phase);
    const effectiveEvent = event ?? resolved?.event;
    const effectiveDescription =
      description ??
      resolved?.description ??
      LEGACY_DESCRIPTION_FALLBACKS[effectiveEvent] ??
      effectiveEvent;
    const ts = nowIso();
    const sid = currentSessionId();
    let deltaWords = 0;
    // #795 — full-expansion per-row delta (stay-abreast + full tool inputs +
    // full tool outputs) and the prior cumulative full snapshot, used to render
    // the trailing `Δ Words (full)` column and persist the full cursor.
    let deltaWordsFull = 0;
    let priorWordsFull = 0;
    // #483 — capture the live transcript line count so the cursor can be
    // advanced after this flush. Without persisting the cursor, every flush
    // re-counts from the same (bind-time) offset, so `Δ Words` is never a
    // true per-segment delta and the cumulative `Word Marker` is computed off
    // a frozen base — the symptom seen in #481 (every row identical, Δ=0).
    let markerLineToPersist = null;
    if (sid) {
      const marker = loadMarker(markerPathFor(sid));
      const counted = countWords(jsonlPath(sid), marker.line);
      deltaWords = counted.count;
      deltaWordsFull = counted.fullExpansion ?? counted.count;
      priorWordsFull = marker.wordsFull ?? marker.words ?? 0;
      markerLineToPersist = counted.totalLines;
    }
    // #476 — append-only session-reference chain. On every timing-emitting verb
    // (incl. first bind via `start`), compare the live { sid, jsonlPath } against
    // the most-recent recorded entry and append a new timestamped entry only on
    // change. `mutateIssueBody` returns `no-op` and skips the wire write when the
    // body is unchanged, so the steady-state event is a cheap fetch-and-compare.
    // Read-only (`computeOnly`) and no-sid (remote/iOS) paths skip cleanly.
    if (!opts.computeOnly && sid) {
      await ctx.safeRecordSessionRef(state.active, { sid, jsonlPath: jsonlPath(sid), ts });
    }
    // #407 — bound-but-paused state (no open timing session): a non-terminal
    // verb (test/review) now leaves `active` set while nulling `entryStartTs`.
    // Without an open session there is no wall-time to flush, so emit a
    // zero-duration row rather than dereferencing a null timestamp (which
    // `new Date(null)` would resolve to epoch 0 → garbage delta).
    if (!state.entryStartTs) {
      // #475 AC1 — carry the durable marker forward. With no open session the
      // raw delta can be 0; the monotonic durable value keeps the row from
      // collapsing the cumulative total.
      // #483 — base the candidate on the durable cumulative (`lastWordMarker`),
      // not the frozen `wordsAtEntryStart`, so the marker grows by this
      // segment's words rather than being recomputed off the bind snapshot.
      const wordMarker = advanceWordMarker(state.lastWordMarker, state.lastWordMarker + deltaWords);
      state.lastWordMarker = wordMarker;
      // #795 — cumulative full-expansion snapshot, advanced monotonically off
      // the prior persisted `wordsFull` (falls back to stay-abreast for legacy
      // markers). Rendered per-row as a delta; persisted for cursor continuity.
      const wordMarkerFull = advanceWordMarker(priorWordsFull, priorWordsFull + deltaWordsFull);
      // #483 — advance and persist the per-sid cursor so the next flush counts
      // only words added after this row's segment (no re-count, no frozen cursor).
      if (!opts.computeOnly && sid && markerLineToPersist != null) {
        saveMarker(
          markerPathFor(sid),
          markerLineToPersist,
          wordMarker,
          state.active,
          wordMarkerFull
        );
      }
      const { buildFlushRow } = await import('./gh-timing-comment.mjs');
      // #832 (D4) — an interruption flush (`pause` / `switch-out` / `review`)
      // banks its words onto the durable marker + cursor above but renders the
      // row's Δ Words cell as 0, so the accrued words are attributed to the
      // phase's `<phase>:completed` row, not to the interruption row. The Word
      // Marker cell still advances (the close walker reads it), so no words are
      // lost — only their display moves off the interruption row (AC1/AC3).
      const rowDeltaWords = opts.suppressRowWords ? 0 : deltaWords;
      const rowDeltaWordsFull = opts.suppressRowWords ? 0 : deltaWordsFull;
      const row = buildFlushRow({
        ts,
        event: effectiveEvent,
        activeMin: 0,
        idleMin: 0,
        deltaWords: rowDeltaWords,
        deltaWordsFull: rowDeltaWordsFull,
        wordMarker,
        description: effectiveDescription,
      });
      if (!opts.computeOnly) await ctx.safePostTiming(state.active, row);
      return {
        row,
        ts,
        deltaMin: 0,
        idleMin: 0,
        deltaWallMin: 0,
        deltaWords,
        wordMarker,
        lastWordMarker: wordMarker,
      };
    }
    // #720 — anchor the Active-duration window on `max(entryStartTs, lastRowTs)`
    // rather than `entryStartTs` alone. Forward move-state promotions do NOT
    // advance `entryStartTs`, so a flush (e.g. `pause`) after intervening
    // move-state rows previously re-counted wall time those rows already logged.
    // `resolveFlushStartMs` picks the later mark; when there is no readable prior
    // row (SKIP_NETWORK/unreadable body → null), it falls back to
    // `entryStartTs`, preserving the pre-fix window exactly. A compute-only
    // caller may supply a read-only precomputed tail so durable planning keeps
    // the same anchor without performing effects inside the flush helper.
    const entryStartMs = new Date(state.entryStartTs).getTime();
    // #822 — read the whole tail row (ts + Event slug) in one fetch. The ts
    // still anchors the Active-duration window (#720); the Event slug lets the
    // Fault Z guard below detect an unclosed finalize/orphan `idle` tail.
    const lastRow = opts.computeOnly
      ? (opts.precomputedLastRow ?? null)
      : await ctx.safeReadLastRow(state.active);
    const lastRowMs =
      lastRow?.ts && Number.isFinite(Date.parse(lastRow.ts)) ? Date.parse(lastRow.ts) : null;
    const startMs = resolveFlushStartMs(entryStartMs, lastRowMs);
    const endMs = new Date(ts).getTime();
    const wallMs = Math.max(0, endMs - startMs);
    const deltaWallMin = Math.round(wallMs / 60000);
    // Default (no session id): the whole resolved window counts as active. The
    // row now renders at second precision so sub-minute flushes are no longer
    // quantized to a whole minute (the #720 widen-to-second-precision decision).
    let activeSec = Math.max(0, Math.round(wallMs / 1000));
    let idleSec = 0;
    if (sid) {
      const events = collectEventTimestamps(jsonlPath(sid), startMs, endMs);
      ({ activeSec, idleSec } = computeActiveAndIdleSeconds({
        startMs,
        endMs,
        events,
        idleThresholdMs: cfg.idleThresholdMinutes * 60_000,
      }));
    }
    const activeMin = Math.max(0, Math.round(activeSec / 60));
    const idleMin = Math.max(0, Math.round(idleSec / 60));
    // #475 AC1 — advance the durable monotonic marker and stamp it (not the
    // raw per-session sum) so the cumulative total never regresses.
    // #483 — candidate base is the durable cumulative (`lastWordMarker`) plus
    // this segment's words; combined with the cursor advance below this makes
    // `Δ Words` a true per-row delta and `Word Marker` a growing cumulative.
    const wordMarker = advanceWordMarker(state.lastWordMarker, state.lastWordMarker + deltaWords);
    state.lastWordMarker = wordMarker;
    // #795 — cumulative full-expansion snapshot (see zero-duration branch above).
    const wordMarkerFull = advanceWordMarker(priorWordsFull, priorWordsFull + deltaWordsFull);
    // #483 — advance and persist the per-sid cursor so the next flush counts
    // only words added after this row's segment (no re-count, no frozen cursor).
    if (!opts.computeOnly && sid && markerLineToPersist != null) {
      saveMarker(markerPathFor(sid), markerLineToPersist, wordMarker, state.active, wordMarkerFull);
    }
    // #822 (Fault Z) — a live departure must not stack on an unclosed
    // finalize/orphan `idle` tail. The orphan/pause-finalize path (#802) ends its
    // window with a trailing `idle` departure that opens an idle span it cannot
    // close (the dead session has no reengagement to record). When the live
    // session then accrues real active work (`activeSec > 0`) and emits its own
    // departure (`pause:*` / `switch-out:#N`), appending it directly yields
    // `idle → pause:*` — departure-on-departure — which V3 (correctly) reports as
    // a doubled step. Interpose the canonical `resumed` reengagement (#568, the
    // sole closer) at the window start, closing the finalize idle span and
    // opening active, so the walk becomes `idle → resumed → pause:*` — legal, one
    // interruption. Gated on `activeSec > 0` so a genuine re-departure with no
    // intervening work (a real doubled step to surface) is never papered over,
    // and on the tail being a departure so normal `reengagement → departure`
    // flows are untouched. The interposed row credits zero duration; the active
    // seconds stay on the departure row's `A=` cell (no double-count). It is
    // stamped at `ts` (now, the recording moment) — NOT retroactively at the
    // window start: `buildRow`'s anti-fabrication guard (#521) forbids backdated
    // rows, and every row is timestamped when written, carrying elapsed work in
    // its duration cells, not in timestamp deltas. The reengagement thus sits
    // immediately before the departure at the same instant, closing the idle.
    const precedingRows = [];
    if (
      activeSec > 0 &&
      isDepartureEvent(effectiveEvent) &&
      lastRow &&
      isDepartureEvent(lastRow.event)
    ) {
      const reengageRow = buildRow({
        ts,
        event: 'resumed',
        activeSec: 0,
        idleSec: 0,
        deltaWords: 0,
        deltaWordsFull: 0,
        wordMarker,
        description: 'resumed',
      });
      if (opts.computeOnly) precedingRows.push(reengageRow);
      else await ctx.safePostTiming(state.active, reengageRow);
    }
    // #720 — build through `buildRow` with second precision (not `buildFlushRow`,
    // which minute-quantizes via `toSec = round(min)*60`). Pause/flush rows now
    // render `Xh Ym Zs` + the canonical `row-sec` marker, matching System A rows.
    // #832 (D4) — see the zero-duration branch: an interruption flush banks its
    // words onto the durable marker but renders the row's Δ Words cell as 0 so
    // they attribute to the `<phase>:completed` row, not the interruption row.
    const rowDeltaWords = opts.suppressRowWords ? 0 : deltaWords;
    const rowDeltaWordsFull = opts.suppressRowWords ? 0 : deltaWordsFull;
    const row = buildRow({
      ts,
      event: effectiveEvent,
      activeSec,
      idleSec,
      deltaWords: rowDeltaWords,
      deltaWordsFull: rowDeltaWordsFull,
      wordMarker,
      description: effectiveDescription,
    });
    if (!opts.computeOnly) await ctx.safePostTiming(state.active, row);
    return {
      row,
      ts,
      deltaMin: activeMin,
      idleMin,
      deltaWallMin,
      deltaWords,
      wordMarker,
      lastWordMarker: wordMarker,
      precedingRows,
    };
  };

  ctx.runLogIssueTime = async (issue) => {
    if (SKIP_NETWORK) return;
    const scriptPath = new URL('../gh/log-issue-time.mjs', import.meta.url).pathname;
    try {
      const { stdout } = await pexec(process.execPath, [scriptPath, issue], {
        timeout: GH_API_TIMEOUT_MS,
      });
      if (stdout.trim()) console.log(stdout.trim());
    } catch (err) {
      // Fail-loud: silent swallow here is the root cause of #180 (board fields
      // never written, body cache stays null, close completes anyway). No env
      // override exists. For a genuine GitHub outage, re-run when service is
      // restored.
      throw new Error(
        `runLogIssueTime: failed to update board fields for ${issue}: ${err.message}. ` +
          `Retry when GitHub is reachable.`
      );
    }
  };

  ctx.runMigrate = async (args) => {
    if (SKIP_NETWORK) return;
    const scriptPath = new URL('../gh/migrate-project.mjs', import.meta.url).pathname;
    // No `timeout:` here: migrate-project.mjs proxies an interactive bash
    // setup wizard via inherited stdio. A fixed budget would kill a slow human
    // mid-prompt. Child gh calls inside the wizard each carry their own
    // GH_API_TIMEOUT_MS budgets.
    // execFileSync throws on non-zero exit; reconstruct the {status,error,signal}
    // shape handleMigrateResult expects so error reporting stays consistent.
    let result;
    try {
      execFileSync(process.execPath, [scriptPath, ...args], {
        cwd: projectDir,
        stdio: 'inherit',
        env: process.env,
      });
      result = { status: 0 };
    } catch (err) {
      result = {
        status: typeof err.status === 'number' ? err.status : 1,
        error: err.code && err.code !== 'ENOENT' ? null : err,
        signal: err.signal || null,
      };
    }
    handleMigrateResult(result);
  };

  // #385 — returns a STRUCTURED result `{ ok, status, stdout, stderr, benign }`
  // instead of warn-and-return-undefined, so callers (notably close.mjs) can
  // distinguish board-reached (ok:true), the benign `done → done` / `test → test`
  // self-loop (ok:false, benign:true), and a genuine refusal (ok:false,
  // benign:false, surfaced stderr).
  //
  // #764 — delegate to the in-process host seam. The behavior (benign
  // classification, silent suppression, manual-recovery warning, `extraArgs`
  // flag forwarding) lives in the exported `runMoveStateInProcess`; here we only
  // bind the SKIP_NETWORK short-circuit for offline/test runs.
  ctx.runMoveState = (issue, state, opts = {}) =>
    runMoveStateInProcess(issue, state, { ...opts, skipNetwork: SKIP_NETWORK });

  ctx.runMoveStateDone = (issue, opts) => ctx.runMoveState(issue, 'done', opts);

  ctx.worktreeLabel = () => {
    try {
      const main = findMainWorktreePath(projectDir);
      if (path.resolve(main) === path.resolve(projectDir)) return 'main';
      return `${currentBranch(projectDir)}@${projectDir}`;
    } catch {
      return 'unknown';
    }
  };

  ctx.buildStateOptionMap = () =>
    Object.fromEntries(
      [
        [cfg.kanbanOptionBacklog, 'backlog'],
        [cfg.kanbanOptionOnDeck, 'on-deck'],
        [cfg.kanbanOptionRefine, 'refine'],
        [cfg.kanbanOptionPlan, 'plan'],
        [cfg.kanbanOptionDevelop, 'develop'],
        [cfg.kanbanOptionTest, 'test'],
        [cfg.kanbanOptionReview, 'review'],
        [cfg.kanbanOptionDone, 'done'],
      ].filter(([k]) => k)
    );

  ctx.fetchSubIssueBoardSnapshot = async (issueNum) => {
    if (SKIP_NETWORK) return { status: 'unknown', error: 'network unavailable' };
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              subIssues(first: 100) {
                nodes {
                  number
                  projectItems(first: 20) {
                    nodes {
                      project { id }
                      fieldValueByName(name: "Status") {
                        ... on ProjectV2ItemFieldSingleSelectValue { name }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      return normalizeSubIssueBoardSnapshot(data, cfg.projectId);
    } catch (err) {
      return { status: 'unknown', error: err?.message || String(err) };
    }
  };

  ctx.fetchSubIssues = async (issueNum) => {
    const snapshot = await ctx.fetchSubIssueBoardSnapshot(issueNum);
    return snapshot.status === 'ok' ? snapshot.children.map((child) => child.number) : [];
  };

  ctx.fetchParentIssue = async (issueNum) => {
    if (SKIP_NETWORK) return null;
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) { parent { number } }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      return data?.repository?.issue?.parent?.number ?? null;
    } catch {
      return null;
    }
  };

  ctx.getIssueBoardState = async (issueNum) => {
    if (SKIP_NETWORK) return null;
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              projectItems(first: 10) {
                nodes {
                  project { id }
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { optionId }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      const nodes = data?.repository?.issue?.projectItems?.nodes ?? [];
      const node = nodes.find((n) => n.project?.id === cfg.projectId);
      const optionId = node?.fieldValueByName?.optionId;
      return optionId ? (ctx.buildStateOptionMap()[optionId] ?? null) : null;
    } catch {
      return null;
    }
  };

  // #925 — additive close snapshot. `stateReason` distinguishes a delivered
  // closing-keyword close from a dead disposition; the legacy boolean reader
  // below delegates to this capability so existing callers remain unchanged.
  ctx.getIssueCloseSnapshot = async (issueNum) => {
    if (SKIP_NETWORK) return { issueClosed: null, stateReason: null };
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', String(issueNum), '-R', cfg.repo, '--json', 'state,stateReason'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      return normalizeIssueCloseSnapshot(JSON.parse(stdout || '{}'));
    } catch {
      return { issueClosed: null, stateReason: null };
    }
  };

  // #425 — actual GitHub open/closed state of the primary issue, independent of
  // the board Status field. true = CLOSED, false = OPEN, null = unknown.
  ctx.getIssueClosedState = async (issueNum) =>
    (await ctx.getIssueCloseSnapshot(issueNum)).issueClosed;

  // #561 — group the flat members into named capability objects. The flat
  // members above remain for back-compat (existing verbs + characterization
  // tests destructure them directly); migrated verbs read the narrow grouped
  // surface (`ctx.projectConfig`, `ctx.timingRecorder`, `ctx.stateRunner`,
  // `ctx.githubClient`, `ctx.issueBodyMutator`) and can be fixture-tested.
  Object.assign(ctx, assembleCapabilities(ctx));

  return ctx;
}
