// Runtime context shared by the dispatcher and all lifecycle verb modules.
//
// `buildContext()` parses argv, loads config, and bundles the cross-verb helpers
// (timing flush, queue drain, board moves, GraphQL sub-issue lookups) into a
// single object passed to each verb. Extracted from task-tracker.mjs as part of
// issue #10 so each lifecycle verb can live in its own file under verbs/.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from './config.mjs';
import { selfCheckFieldConfig } from './lib/field-config-warn.mjs';
import { postTimingEvent, buildRow, readTimingCommentBody, bodyOf } from './gh-timing-comment.mjs';
import { lastRowTsFromBody } from './lib/timing-rows.mjs';
import { PHASE_EVENTS, resolvePhaseEvent } from './phase-events.mjs';

// Re-exported so downstream verbs (promote/demote/review/new/close/switch —
// sub-issues #128, #129 of epic #126) can pull the canonical table without
// importing the sibling module directly.
export { PHASE_EVENTS };
import { enqueue, drain, drainAndDiscard } from './queue.mjs';
import {
  currentSessionId,
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
import { getProjectDir } from './paths.mjs';
import { GH_API_TIMEOUT_MS, MOVE_STATE_TIMEOUT_MS } from './lib/process-timeouts.mjs';
import { assembleCapabilities } from './lib/runtime-capabilities.mjs';

const pexec = promisify(execFile);

export function nowIso() {
  return new Date().toISOString();
}

export function minutesBetween(aIso, bIso) {
  return Math.round((new Date(bIso) - new Date(aIso)) / 60000);
}

// #385 / #444 — classify a non-zero `move-state.mjs` outcome as benign or
// genuine. Two benign non-zero cases, both exit-5 illegal self-loops:
//   1. `done → done` (#385): GitHub Projects' auto-close workflow moves the
//      board item to Done on `gh issue close`, so a subsequent manual move to
//      `done` is an illegal self-transition. No-op re-entry.
//   2. `test → test` (#444): once an issue is already in `test`, re-running the
//      `test` verb to re-exercise newly-added `## Verification Commands` issues
//      a `test → test` move. This is the supported in-place re-verify path — the
//      sandbox run already happened on the green path; the board column simply
//      stays put. Same shape/intent as the done self-loop.
// Every other non-zero (a real gate refusal, a spawn `ENOENT`, an unknown
// state) is genuine and must be surfaced. Pure + exported for tests.
export function classifyMoveStateBenign({ state, status, stderr } = {}) {
  const text = String(stderr || '');
  return (
    (state === 'done' && status === 5 && /illegal transition:\s*done\s*→\s*done/i.test(text)) ||
    (state === 'test' && status === 5 && /illegal transition:\s*test\s*→\s*test/i.test(text))
  );
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

import { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes } from './close-gate.mjs';
export { CLOSE_OWNED_CHECKBOXES, uncheckedPreCloseCheckboxes };

export function handleMigrateResult(result, { stderr = process.stderr, exit = process.exit } = {}) {
  if (result.status === 0) return;
  if (result.error) stderr.write(`[task-tracker] migrate spawn error: ${result.error.message}\n`);
  if (result.signal) stderr.write(`[task-tracker] migrate killed by signal: ${result.signal}\n`);
  exit(result.status || 1);
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

  ctx.drainQueueIfAny = async () => {
    if (SKIP_NETWORK) return;
    await drain(async (evt) => {
      if (evt.kind === 'timing') {
        await postTimingEvent({
          issueNumber: evt.issue,
          repo: cfg.repo,
          row: evt.row,
          timeoutMs: cfg.hookNetworkTimeoutMs,
        });
      }
    }, queuePath);
  };

  ctx.flushAndForgetQueueFor = async (issueRef) => {
    if (SKIP_NETWORK) return { delivered: 0, discarded: 0 };
    const ref = String(issueRef).replace(/^#/, '');
    return drainAndDiscard(
      async (evt) => {
        if (evt.kind === 'timing') {
          await postTimingEvent({
            issueNumber: evt.issue,
            repo: cfg.repo,
            row: evt.row,
            timeoutMs: cfg.hookNetworkTimeoutMs,
          });
        }
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
      // #483 — advance and persist the per-sid cursor so the next flush counts
      // only words added after this row's segment (no re-count, no frozen cursor).
      if (!opts.computeOnly && sid && markerLineToPersist != null) {
        saveMarker(markerPathFor(sid), markerLineToPersist, wordMarker, state.active);
      }
      const { buildFlushRow } = await import('./gh-timing-comment.mjs');
      const row = buildFlushRow({
        ts,
        event: effectiveEvent,
        activeMin: 0,
        idleMin: 0,
        deltaWords,
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
    // row (computeOnly/SKIP_NETWORK/unreadable body → null), it falls back to
    // `entryStartTs`, preserving the pre-fix window exactly.
    const entryStartMs = new Date(state.entryStartTs).getTime();
    const lastRowMs = opts.computeOnly ? null : await ctx.safeReadLastRowTs(state.active);
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
    // #483 — advance and persist the per-sid cursor so the next flush counts
    // only words added after this row's segment (no re-count, no frozen cursor).
    if (!opts.computeOnly && sid && markerLineToPersist != null) {
      saveMarker(markerPathFor(sid), markerLineToPersist, wordMarker, state.active);
    }
    // #720 — build through `buildRow` with second precision (not `buildFlushRow`,
    // which minute-quantizes via `toSec = round(min)*60`). Pause/flush rows now
    // render `Xh Ym Zs` + the canonical `row-sec` marker, matching System A rows.
    const row = buildRow({
      ts,
      event: effectiveEvent,
      activeSec,
      idleSec,
      deltaWords,
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
  // instead of warn-and-return-undefined. Callers (notably close.mjs) can now
  // distinguish three outcomes:
  //   - ok:true                      → board reached the target state.
  //   - ok:false, benign:true        → the only non-failure non-zero: a
  //                                    `done → done` self-loop, which happens
  //                                    when GitHub Projects' auto-close workflow
  //                                    already moved the item to Done before the
  //                                    manual move ran. move-state.mjs exits 5
  //                                    with an `illegal transition` reason. This
  //                                    must NOT be surfaced as a failure, and we
  //                                    suppress the spurious warning for it.
  //   - ok:false, benign:false       → a genuine failure. We surface the
  //                                    captured stderr (the real refusal reason)
  //                                    so the caller can report it instead of
  //                                    falsely claiming success.
  // `extraArgs` forwards additional CLI flags to move-state.mjs (e.g.
  // `--supersede`, `--from <state>`). The base `[scriptPath, issueNum, state]`
  // shape is preserved; callers append flags the chokepoint understands.
  ctx.runMoveState = async (
    issue,
    state,
    { env: envOverride, silent = false, extraArgs = [] } = {}
  ) => {
    if (SKIP_NETWORK) {
      return { ok: true, status: 0, benign: false, skipped: true, stdout: '', stderr: '' };
    }
    const scriptPath = fileURLToPath(new URL('../gh/move-state.mjs', import.meta.url));
    const issueNum = String(issue).replace(/^#/, '');
    const moveArgs = [scriptPath, issueNum, state, ...extraArgs];
    try {
      const mergedEnv = {
        ...process.env,
        ...(envOverride || {}),
        AITM_INTERNAL: '1',
        AITM_VERB_CONTEXT: 'runtime',
      };
      const { stdout } = await pexec(process.execPath, moveArgs, {
        // #752 — the move-state child runs a verified Status write PLUS a
        // multi-step best-effort tail; bounding it with the single-`gh`-call
        // budget SIGTERM-killed it mid-tail after the board committed. Give it a
        // budget matched to the whole saga (inner calls keep their own timeouts).
        timeout: MOVE_STATE_TIMEOUT_MS,
        env: mergedEnv,
      });
      if (!silent && stdout.trim()) console.log(stdout.trim());
      return { ok: true, status: 0, benign: false, stdout: String(stdout || ''), stderr: '' };
    } catch (err) {
      const result = buildMoveStateErrorResult({ state, err });
      if (!result.benign) {
        console.warn(`[task-tracker] Could not move ${issue} to ${state}: ${err.message}`);
        if (result.stderr.trim()) console.warn(result.stderr.trim());
        console.warn(`[task-tracker] Run manually: node ${scriptPath} ${issueNum} ${state}`);
      }
      return result;
    }
  };

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

  ctx.fetchSubIssues = async (issueNum) => {
    if (SKIP_NETWORK) return [];
    try {
      const { owner, repoName } = splitRepo(cfg.repo);
      const data = await gql(
        `query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              subIssues(first: 100) { nodes { number } }
            }
          }
        }`,
        { owner, repo: repoName, issue: Number(issueNum) },
        { timeout: GH_API_TIMEOUT_MS }
      );
      return data?.repository?.issue?.subIssues?.nodes?.map((n) => n.number) ?? [];
    } catch {
      return [];
    }
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

  // #425 — actual GitHub open/closed state of the primary issue, independent of
  // the board Status field. true = CLOSED, false = OPEN, null = unknown
  // (SKIP_NETWORK or any error). Lets close.mjs distinguish a genuinely-closed
  // issue from a board=Done + issue-OPEN drift the auto-close workflow missed.
  ctx.getIssueClosedState = async (issueNum) => {
    if (SKIP_NETWORK) return null;
    try {
      const { stdout } = await pexec(
        'gh',
        ['issue', 'view', String(issueNum), '-R', cfg.repo, '--json', 'state', '--jq', '.state'],
        { timeout: GH_API_TIMEOUT_MS }
      );
      const state = String(stdout || '')
        .trim()
        .toUpperCase();
      if (state === 'CLOSED') return true;
      if (state === 'OPEN') return false;
      return null;
    } catch {
      return null;
    }
  };

  // #561 — group the flat members into named capability objects. The flat
  // members above remain for back-compat (existing verbs + characterization
  // tests destructure them directly); migrated verbs read the narrow grouped
  // surface (`ctx.projectConfig`, `ctx.timingRecorder`, `ctx.stateRunner`,
  // `ctx.githubClient`, `ctx.issueBodyMutator`) and can be fixture-tested.
  Object.assign(ctx, assembleCapabilities(ctx));

  return ctx;
}
