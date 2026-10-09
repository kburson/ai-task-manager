import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { normalizeStateId } from '../lifecycle-policy/index.mjs';
// INTERNAL — library module for the state-movement boundary (#559).
//
// GitHub-mutation concern extracted from `scripts/gh/move-state.mjs`: the two
// writes that actually change GitHub state for a transition —
//   1. `runStatusWrite`  — resolve the project item id, edit the kanban
//      single-select field, print the success line.
//   2. `stampEntryMarkers` — stamp `aitm-entered-<stage>` + `last-known-state`
//      body markers in a single body update (#170), and post the visit-numbered
//      re-entry audit comment when a stage is re-entered (#184).
//
// `runStatusWrite` returns `{ itemId, exit }`. A non-null `exit` means the host
// must `process.exit(exit)` (the "issue not found in project" path keeps exit
// code 1 in the host). The resolved `itemId` is threaded back into `ctx` so the
// later event-field sync can reuse it.
//
// Runtime values, `cfg`, and the I/O primitives arrive via the shared `ctx`;
// stateless helpers + node builtins are imported directly here.

import {
  deriveEntryMarkerChange,
  postReentryAuditComment,
  STAGES,
} from '../stage-entry-markers.mjs';
import { serializeEntryMarker } from '../stage-entry-grammar.mjs';
import { getProjectDir, projectTmpDir } from '../../paths.mjs';
import { GH_API_TIMEOUT_MS } from '../process-timeouts.mjs';
import { computeScopeIdentity } from '../workflow-policy/scope-identity.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import {
  assertRevisionStageHostEffect,
  isMemoryStageEffectScope,
} from '../criteria-revision/transport-quarantine.mjs';

// #711 — how many times the write+read-back cycle is attempted before
// runStatusWrite gives up and fails loudly, and the base backoff between them.
export const STATUS_WRITE_MAX_ATTEMPTS = 3;
export const STATUS_WRITE_BACKOFF_MS = 400;
// Exit code returned to the host when the board field never confirms. Distinct
// from the "issue absent from project" exit 1 so the failure mode is greppable.
export const STATUS_WRITE_READBACK_EXIT = 7;
// #741 — exit code when the success-path post-condition (authoritative
// `aitm-last-known-state` marker == the just-confirmed board stage) does NOT
// hold. Distinct from 7 so a re-opened board/marker gap is greppable.
export const STATUS_MARKER_CONSISTENCY_EXIT = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Original CLI name-read DATA, distinct from the option-ID query below.
export const STATUS_NAME_QUERY = `
        query($owner: String!, $repo: String!, $issue: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issue) {
              projectItems(first: 10) {
                nodes {
                  project { id }
                  fieldValueByName(name: "Status") {
                    ... on ProjectV2ItemFieldSingleSelectValue { name }
                  }
                }
              }
            }
          }
        }`;
export function statusNameFromData(data, cfg) {
  const nodes = data?.repository?.issue?.projectItems?.nodes || [];
  const node = nodes.find((n) => n?.project?.id === cfg.projectId);
  return normalizeStateId(node?.fieldValueByName?.name) || '';
}

// #711 — default read-back: query the item's live Status single-select
// `optionId` for the configured project. Mirrors `resolveLiveStateName` in the
// host (`scripts/gh/move-state.mjs`) but returns the raw option id so the
// comparison in `runStatusWrite` is exact (option id, not display name).
// Returns '' when the value is absent/unreadable; never throws.
export const STATUS_OPTION_QUERY = `
      query($owner: String!, $repo: String!, $issue: Int!) {
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
      }`;

async function defaultReadBackStatusOptionId(input) {
  if (isMemoryStageEffectScope()) {
    const core = await import('./move-state-core.mjs');
    const data = await core.readNativeStageBoardStatus(input);
    const source = core.readNativeStageStatusSourceResponse(input, data);
    if (source === null) return statusOptionFromData(data, input.cfg.projectId);
    const { parseNativeStageStatusResponse } = await import('../../../gh/lib/github-projects.mjs');
    const response = core.readNativeStageStatusSourceResponse(input, data);
    const captured = evaluateStatusResponse(
      parseNativeStageStatusResponse,
      response,
      input.cfg.projectId
    );
    const original = nativeBoardRequests.get(input);
    assertOriginalNativeBoardRequest(input, original?.invocation, 'status');
    nativeBoardStatuses.set(input, { invocation: original.invocation, response, captured });
    try {
      await core.recordNativeStageBoardStatusSource(input);
      assertOriginalNativeBoardRequest(input, original.invocation, 'status');
      return captured.value;
    } finally {
      nativeBoardStatuses.delete(input);
    }
  }
  const { cfg, issueNumber } = input;
  try {
    const { gql, splitRepo } = await import('../../../gh/lib/github-projects.mjs');
    const { owner, repoName } = splitRepo(cfg.repo);
    const data = await gql(STATUS_OPTION_QUERY, {
      owner,
      repo: repoName,
      issue: Number(issueNumber),
    });
    return statusOptionFromData(data, cfg.projectId);
  } catch {
    return '';
  }
}

// Native request/parse DATA shared by the ordinary loop and exact stage replay.
// These functions do not execute a request or qualify its source.
export function statusWriteArgs({ projectId, itemId, fieldId, optionId }) {
  return [
    'project',
    'item-edit',
    '--project-id',
    projectId,
    '--id',
    itemId,
    '--field-id',
    fieldId,
    '--single-select-option-id',
    optionId,
  ];
}
export function statusOptionFromData(data, projectId) {
  const nodes = data?.repository?.issue?.projectItems?.nodes || [];
  const node = nodes.find((n) => n?.project?.id === projectId);
  return String(node?.fieldValueByName?.optionId || '');
}

// Historical response projection DATA only; projectId is an exact comparison
// value, never query selection or execution authority. No current maps touched.
export async function deriveRecordedStageStatusResponse(input) {
  try {
    canonicalRecordJson(input);
    if (
      Object.keys(input).sort().join(',') !== 'projectId,response' ||
      typeof input.projectId !== 'string' ||
      !input.projectId
    )
      throw new TypeError();
  } catch {
    throw new TypeError('native-stage-status-response');
  }
  input = structuredClone(input);
  const { parseNativeStageStatusResponse } = await import('../../../gh/lib/github-projects.mjs');
  return evaluateStatusResponse(parseNativeStageStatusResponse, input.response, input.projectId)
    .facts;
}
// Only native synchronous parsers are caught here. Current scope, imports and
// recording remain outside this private parser boundary.
function evaluateStatusResponse(parser, response, projectId) {
  let data;
  try {
    data = parser({ response });
  } catch (error) {
    if (error instanceof TypeError && error.message === 'native-stage-status-response') throw error;
    const facts = freezeStatusData({
      kind: 'threw',
      error:
        response.exitCode !== 0
          ? {
              kind: 'close',
              name: error.name,
              message: error.message,
              code: error.code,
              stdout: error.stdout,
              stderr: error.stderr,
            }
          : { kind: 'graphql', name: error.name, message: error.message },
    });
    return { facts, error, value: '' };
  }
  let status,
    statusError = null;
  try {
    status = { kind: 'returned', value: statusOptionFromData(data, projectId) };
  } catch (error) {
    statusError = error;
    status = { kind: 'threw', name: error.name, message: error.message };
  }
  const facts = freezeStatusData({
    kind: 'returned',
    result: data === undefined ? { kind: 'undefined' } : { kind: 'json', value: data },
    status,
  });
  return { facts, data, statusError, value: status.kind === 'returned' ? status.value : '' };
}

function freezeStatusData(value) {
  try {
    canonicalRecordJson(value);
  } catch {
    throw new TypeError('native-stage-status-record');
  }
  const freeze = (member) => {
    if (member && typeof member === 'object') {
      for (const child of Object.values(member)) freeze(child);
      Object.freeze(member);
    }
    return member;
  };
  return freeze(value);
}

// Resolve the project item id, write the kanban Status field, and print the
// success line. Returns `{ itemId, exit }`; `exit` is a number only when the
// host must terminate — the issue is absent from the project (exit 1), or the
// board field never confirmed the write after read-back + retries (exit 7,
// #711). A non-null `exit` gates the host BEFORE `stampEntryMarkers`, so the
// entry marker never advances on a silently-dropped board-field write.
const nativeBoardInvocations = new WeakMap();
const nativeBoardRequests = new WeakMap();
const nativeBoardResults = new WeakMap();
const nativeBoardFailures = new WeakMap();
const nativeBoardStatuses = new WeakMap();
function sameOwnBoardData(value, original) {
  if (!value || ![Object.prototype, Array.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError('native-board-request');
  const current = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(current).length !== Reflect.ownKeys(original).length ||
    Reflect.ownKeys(current).some((key) => {
      const a = current[key],
        b = original[key];
      return (
        !b ||
        !Object.hasOwn(a, 'value') ||
        a.value !== b.value ||
        a.enumerable !== b.enumerable ||
        a.configurable !== b.configurable ||
        a.writable !== b.writable
      );
    })
  )
    throw new TypeError('native-board-request');
}
// No-return comparisons only. Registration is lexical to the one native loop.
export function assertOriginalNativeBoardInvocation(invocation, ctx) {
  const original = nativeBoardInvocations.get(invocation);
  if (!original || original.ctx !== ctx) throw new TypeError('native-board-invocation');
  sameOwnBoardData(ctx, original.descriptors);
}
export function assertOriginalNativeBoardRequest(input, invocation, kind) {
  const original = nativeBoardRequests.get(input);
  const owner = nativeBoardInvocations.get(invocation);
  if (!original || !owner || original.invocation !== invocation || original.kind !== kind)
    throw new TypeError('native-board-request');
  assertOriginalNativeBoardInvocation(invocation, owner.ctx);
  sameOwnBoardData(input, original.descriptors);
}
export function assertOriginalNativeBoardResult(result, ctx) {
  const original = nativeBoardResults.get(result);
  if (!original || original.ctx !== ctx) throw new TypeError('native-board-result');
  sameOwnBoardData(result, original.descriptors);
}
function nativeBoardErrorData(error) {
  if (!error || Object.getPrototypeOf(error) !== Error.prototype)
    throw new TypeError('native-board-error');
  const descriptors = Object.getOwnPropertyDescriptors(error);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key !== 'string' || !['stack', 'message', 'name', 'code'].includes(key)
    )
  )
    throw new TypeError('native-board-error');
  for (const key of ['message', 'name', 'code'])
    if (descriptors[key] && !Object.hasOwn(descriptors[key], 'value'))
      throw new TypeError('native-board-error');
  const name = descriptors.name?.value ?? 'Error',
    message = descriptors.message?.value,
    code = descriptors.code?.value ?? null;
  if (
    typeof name !== 'string' ||
    typeof message !== 'string' ||
    !(code === null || typeof code === 'string' || Number.isSafeInteger(code))
  )
    throw new TypeError('native-board-error');
  return { descriptors, facts: { kind: 'threw', name, message, code } };
}
// Exact original thrown value, never a caller error-data registration surface.
export function readOriginalNativeBoardFailure(input, invocation, error) {
  const original = nativeBoardFailures.get(invocation);
  if (!original || original.input !== input || original.error !== error)
    throw new TypeError('native-board-failure');
  assertOriginalNativeBoardRequest(input, invocation, 'write');
  const current = nativeBoardErrorData(error);
  if (
    Reflect.ownKeys(current.descriptors).length !== Reflect.ownKeys(original.descriptors).length ||
    Reflect.ownKeys(current.descriptors).some((key) => {
      const a = current.descriptors[key],
        b = original.descriptors[key];
      return (
        !b ||
        a.value !== b.value ||
        a.get !== b.get ||
        a.set !== b.set ||
        a.writable !== b.writable ||
        a.enumerable !== b.enumerable ||
        a.configurable !== b.configurable
      );
    })
  )
    throw new TypeError('native-board-failure');
  return Object.freeze({ ...current.facts });
}
// Detached facts from the actual original parser invocation; no supplied
// result/error can register here, and absent/copy/getter inputs fail first.
export function readOriginalNativeBoardStatus(input, invocation) {
  const original = nativeBoardStatuses.get(input);
  if (!original || original.invocation !== invocation)
    throw new TypeError('native-board-status-custody');
  assertOriginalNativeBoardRequest(input, invocation, 'status');
  return freezeStatusData(
    structuredClone({ transport: original.response, ...original.captured.facts })
  );
}
function registerBoardRequest(input, invocation, kind) {
  nativeBoardRequests.set(input, {
    invocation,
    kind,
    descriptors: Object.getOwnPropertyDescriptors(input),
  });
  return input;
}
export async function runStatusWrite(ctx) {
  if (!isMemoryStageEffectScope()) {
    assertRevisionStageHostEffect();
    return runStatusWriteAdmitted(ctx, null);
  }
  const core = await import('./move-state-core.mjs');
  core.assertNativeStageBoardContext(ctx);
  const invocation = Object.freeze({});
  nativeBoardInvocations.set(invocation, {
    ctx,
    core,
    descriptors: Object.getOwnPropertyDescriptors(ctx),
  });
  let begun = false;
  try {
    await core.beginNativeStageBoard(ctx, invocation);
    begun = true;
    assertOriginalNativeBoardInvocation(invocation, ctx);
    const result = await runStatusWriteAdmitted(ctx, invocation);
    assertOriginalNativeBoardInvocation(invocation, ctx);
    nativeBoardResults.set(result, { ctx, descriptors: Object.getOwnPropertyDescriptors(result) });
    await core.completeNativeStageBoard(ctx, invocation, result);
    assertOriginalNativeBoardInvocation(invocation, ctx);
    return result;
  } finally {
    if (begun) core.endNativeStageBoard(ctx, invocation);
    nativeBoardInvocations.delete(invocation);
  }
}
async function runStatusWriteAdmitted(ctx, invocation) {
  const { issueArg, stateArg, optionId, cfg, SKIP_NETWORK, gh, projectItemForIssue } = ctx;
  const readBackStatusOptionId = ctx.readBackStatusOptionId || defaultReadBackStatusOptionId;

  // Resolve project item ID
  let itemId = ctx.itemIdOverride;
  if (!itemId && !SKIP_NETWORK) {
    const request = { repo: cfg.repo, projectId: cfg.projectId, issueNumber: issueArg };
    if (invocation) registerBoardRequest(request, invocation, 'item');
    let result;
    try {
      result = await projectItemForIssue(request);
    } finally {
      if (invocation) nativeBoardRequests.delete(request);
    }
    itemId = result.itemId;
    if (!itemId) {
      process.stderr.write(
        `Issue #${issueArg} not found in project (repo: ${cfg.repo}, projectId: ${cfg.projectId})\n`
      );
      return { itemId: '', exit: 1 };
    }
  }

  // #711 — write the kanban board field, then READ IT BACK and confirm it
  // reached the target option. A dropped/failed GraphQL field write that does
  // not surface as a non-zero `gh` exit would otherwise leave the board behind
  // while the marker advances.
  //
  // Two distinct read-back outcomes, deliberately handled differently:
  //   • NON-EMPTY mismatch — the board holds a concrete DIFFERENT option than we
  //     wrote. That is positive evidence of a dropped/stale write (the exact
  //     #711 signature: board lagged at a prior stage while the marker moved on).
  //     Retry with bounded backoff to absorb eventual-consistency lag; if it
  //     still mismatches after the final attempt, FAIL LOUDLY (non-null exit) so
  //     the host halts before the marker is stamped.
  //   • EMPTY / unreadable — the read path itself is unavailable (offline, a
  //     shimmed `gh` in tests, or an item with no Status set yet). An unreadable
  //     read is NOT proof the write landed, so we do NOT soft-proceed (#747):
  //     an optimistic proceed here was the plausible cause of the #737
  //     split-brain that recurred after #711 shipped. Instead we RETRY across
  //     the whole budget so a transiently-degraded read path can still recover
  //     and confirm, and only if it never confirms do we fail closed — never
  //     stamping the marker or the timing row on an unverified move. The
  //     absolute invariant ("on verification failure the marker/timing are NOT
  //     stamped") holds for the empty case exactly as for a concrete mismatch.
  if (!SKIP_NETWORK) {
    let confirmed = false;
    let lastSeen = '';
    for (let attempt = 1; attempt <= STATUS_WRITE_MAX_ATTEMPTS; attempt++) {
      const writeRequest = statusWriteArgs({
        projectId: cfg.projectId,
        itemId,
        fieldId: cfg.kanbanFieldId,
        optionId,
      });
      if (invocation) registerBoardRequest(writeRequest, invocation, 'write');
      try {
        await gh(writeRequest);
      } catch (error) {
        if (invocation) {
          try {
            const captured = nativeBoardErrorData(error);
            nativeBoardFailures.set(invocation, {
              input: writeRequest,
              error,
              descriptors: captured.descriptors,
            });
            await nativeBoardInvocations
              .get(invocation)
              .core.recordNativeStageBoardFailure(writeRequest, error);
          } catch {
            // Recording uncertainty retains pending. Preserve the original
            // native thrown value; it never becomes exit7 or compensation.
          } finally {
            nativeBoardFailures.delete(invocation);
          }
        }
        throw error;
      } finally {
        if (invocation) nativeBoardRequests.delete(writeRequest);
      }
      const readRequest = { cfg, issueNumber: issueArg };
      if (invocation) registerBoardRequest(readRequest, invocation, 'status');
      try {
        lastSeen = await readBackStatusOptionId(readRequest);
      } finally {
        if (invocation) nativeBoardRequests.delete(readRequest);
      }
      if (lastSeen === optionId) {
        confirmed = true;
        break;
      }
      if (attempt < STATUS_WRITE_MAX_ATTEMPTS) await sleep(STATUS_WRITE_BACKOFF_MS * attempt);
    }
    if (!confirmed) {
      // Distinguish the two unconfirmed shapes in the message only — both fail
      // closed. A concrete DIFFERENT option is positive evidence of a
      // dropped/stale write; an empty read means the read path stayed
      // unavailable across every attempt and we could not verify the write.
      const readState = lastSeen
        ? `read-back Status optionId is "${lastSeen}", expected "${optionId}"`
        : `read-back returned no Status value across every attempt (read path unavailable) — the write could not be verified`;
      process.stderr.write(
        `⛔ Board field write for #${issueArg} → ${stateArg} did NOT confirm after ` +
          `${STATUS_WRITE_MAX_ATTEMPTS} attempts: ${readState}. Refusing to stamp the ` +
          `entry marker so the board and the marker cannot diverge. The move did NOT ` +
          `complete — retry, or reconcile the board before retrying.\n`
      );
      return { itemId, exit: STATUS_WRITE_READBACK_EXIT };
    }
  }

  console.log(`✓ Issue #${issueArg} moved to: ${stateArg}`);

  return { itemId, exit: null };
}

// Centralized stage-entry + recorded-state marker stamping. Every successful
// Status write stamps `<!-- aitm-entered-<stage>: <ts> -->` AND updates
// `<!-- aitm-last-known-state -->` in the issue body. Both markers are
// written in a single fresh-base body mutation so drift detection cannot fire
// phantom `external-mutation` rows on legitimate non-promote transitions
// (#170). This is the single source of truth for the audit-trail chain —
// verbs must NOT stamp these markers themselves. Any failure is surfaced and
// re-thrown so the later Status write remains unreachable.
const nativeEntryRequests = new WeakMap();
// Comparison-only original lexical request facts. No input constructor or
// context/function/transport reference leaves this module.
export function readNativeEntryRequest(input, ctx) {
  const original = nativeEntryRequests.get(input);
  if (!original || original.ctx !== ctx) throw new TypeError('native-entry-request');
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (
    Reflect.ownKeys(descriptors).length !== Reflect.ownKeys(original.descriptors).length ||
    Reflect.ownKeys(descriptors).some((key) => {
      const a = descriptors[key],
        b = original.descriptors[key];
      return (
        !b ||
        !Object.hasOwn(a, 'value') ||
        a.value !== b.value ||
        a.enumerable !== b.enumerable ||
        a.configurable !== b.configurable ||
        a.writable !== b.writable
      );
    })
  )
    throw new TypeError('native-entry-request');
  return structuredClone(original.facts);
}
export async function stampEntryMarkers(ctx) {
  if (isMemoryStageEffectScope()) {
    const core = await import('./move-state-core.mjs');
    core.assertNativeStageEntryContext(ctx);
  } else assertRevisionStageHostEffect();
  const { issueArg, stateArg, transitionId, cfg, SKIP_NETWORK, gh } = ctx;
  if (!(!SKIP_NETWORK && STAGES.includes(stateArg))) return { priorState: undefined };
  try {
    const { writeLastKnownState, readLastKnownState } = await import('../../gh-timing-comment.mjs');
    const mutateBody =
      ctx._mutateBody ||
      (async (args) => {
        const { mutateIssueBody } = await import('../issue-body-mutate.mjs');
        return mutateIssueBody(args);
      });
    let priorState = null;
    let priorVisitCount = 0;
    let nextVisitCount = 0;
    const stampTs = new Date().toISOString();
    const validateAuthorityScope = (beforeBody) => {
      if (
        ctx.resolvedFromState !== 'plan' ||
        stateArg !== 'develop' ||
        !ctx.planTransitionAuthority?.record
      ) {
        return;
      }
      const freshScopeIdentity = computeScopeIdentity({
        repository: cfg.repo,
        issue: Number(issueArg),
        body: beforeBody,
      });
      if (freshScopeIdentity !== ctx.planTransitionAuthority.record.scopeIdentity) {
        throw new Error('plan-transition-authority:scope-drift-before-entry');
      }
    };
    const request = {
      issueNumber: issueArg,
      repo: cfg.repo,
      maxRetries: 2,
      validateFreshBase: validateAuthorityScope,
      mutate: (beforeBody) => {
        priorState = readLastKnownState(beforeBody).state;
        const entry = deriveEntryMarkerChange(beforeBody, stateArg, stampTs, transitionId);
        priorVisitCount = entry.priorVisitCount;
        const nextBody = writeLastKnownState(entry.body, stateArg);
        nextVisitCount = entry.nextVisitCount;
        const original = nativeEntryRequests.get(request);
        if (original)
          original.facts = {
            entryTs: stampTs,
            stateTs: readLastKnownState(nextBody).ts,
            visit: nextVisitCount,
          };
        return nextBody;
      },
    };
    if (isMemoryStageEffectScope())
      nativeEntryRequests.set(request, {
        ctx,
        descriptors: Object.getOwnPropertyDescriptors(request),
        facts: { entryTs: stampTs, stateTs: null, visit: null },
      });
    try {
      await mutateBody(request);
    } finally {
      nativeEntryRequests.delete(request);
    }
    // #741 — the stage the authoritative `aitm-last-known-state` marker points at
    // BEFORE this stamp advances it. Returned to the saga so a subsequent failed
    // board write can compensate by rolling the marker back to this value,
    // keeping marker == board instead of leaving marker-ahead-of-board drift.
    // Visit number this stamp produced. If stampEntryMarker treated the call
    // as a no-op (same transition identity), the count is unchanged and we
    // should not post an audit comment.
    // #184 — When the body stamp produced a visit-numbered re-entry marker
    // (visit >= 2), post a backfill audit comment so the body change is
    // observable in the issue timeline. Idempotent on the (stage, visit)
    // tuple; failure does not undo the body stamp (degrades to stderr).
    if (nextVisitCount >= 2 && nextVisitCount > priorVisitCount) {
      await postReentryAuditComment({
        issueNumber: issueArg,
        repo: cfg.repo,
        stage: stateArg,
        visit: nextVisitCount,
        ts: stampTs,
      });
    }
    const visitMarker = serializeEntryMarker({
      state: stateArg,
      visit: nextVisitCount,
      ts: stampTs,
      move: transitionId,
    });
    return {
      priorState,
      visitMarker,
      visit: nextVisitCount,
      ts: stampTs,
      transitionId: transitionId ?? null,
    };
  } catch (err) {
    assertRevisionStageHostEffect();
    if (String(err?.message || '').startsWith('plan-transition-authority:')) throw err;
    // Entry evidence is written before Status. Surface a durable diagnostic,
    // then re-throw so the board cannot advance without its entry marker.
    process.stderr.write(`[move-state] #${issueArg}: marker stamp failed: ${err.message}\n`);
    await postStampFailureAudit({
      issueNumber: issueArg,
      repo: cfg.repo,
      stage: stateArg,
      error: err.message,
      postComment:
        ctx.postComment ||
        (async ({ issueNumber, repo, body }) => {
          await gh(['issue', 'comment', String(issueNumber), '-R', repo, '--body', body]);
        }),
    });
    throw err;
  }
}

// #544 — body for the durable stamp-failure audit comment. Pure + exported so
// the failure path is unit-testable without a live gh round-trip.
export function buildStampFailureCommentBody({ issueNumber, stage, error }) {
  return [
    `### ⚠ Entry-marker stamp FAILED — \`${stage}\``,
    '',
    `The board move for #${issueNumber} into \`${stage}\` was refused before Status because writing the ` +
      `\`aitm-entered-${stage}\` body marker FAILED:`,
    '',
    '```',
    String(error || 'unknown error'),
    '```',
    '',
    'The board remains at the prior stage. Resolve the write failure, then retry the governed transition:',
    '',
    '```',
    `npx aitm promote #${issueNumber}`,
    '```',
    '',
    `<!-- aitm-stamp-failure stage="${stage}" -->`,
  ].join('\n');
}

// #544 — post the stamp-failure audit comment. Never throws: a failed audit
// post degrades to stderr, mirroring the rest of the best-effort stamp path.
export async function postStampFailureAudit(input = {}) {
  assertRevisionStageHostEffect();
  const { issueNumber, repo, stage, error, postComment } = input;
  const body = buildStampFailureCommentBody({ issueNumber, stage, error });
  try {
    assertRevisionStageHostEffect();
    await postComment({ issueNumber, repo, body });
    return { mode: 'posted' };
  } catch (postErr) {
    process.stderr.write(
      `[move-state] #${issueNumber}: stamp-failure audit comment post FAILED: ${postErr.message}\n`
    );
    return { mode: 'error', error: postErr.message };
  }
}

// #741 — compensating rollback of the authoritative `aitm-last-known-state`
// marker. `stampEntryMarkers` advances the marker to the target stage BEFORE the
// board Status write; when that board write fails/does-not-confirm (#711 returns
// a non-null exit), the marker would be left ahead of the board. This restores
// the marker to `priorState` (the stage the board is still confirmed at) so the
// failure leaves marker == board — loud (the non-zero exit is preserved by the
// caller) AND consistent. Idempotent: a no-op when the marker already reads
// `priorState`. The additive `aitm-entered-<stage>` contiguity marker is left
// untouched (it is not the authoritative pointer and a re-run reconciles it).
export async function rollbackRecordedState(ctx, priorState) {
  assertRevisionStageHostEffect();
  const { issueArg, cfg, gh, pexec } = ctx;
  if (priorState == null) return { rolledBack: false, reason: 'no-prior-state' };
  const [{ writeIssueBodyWithRetry }, { writeLastKnownState, readLastKnownState }] =
    await Promise.all([import('../state-recording.mjs'), import('../../gh-timing-comment.mjs')]);
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  const beforeBody = JSON.parse(stdout).body ?? '';
  if (readLastKnownState(beforeBody).state === priorState) {
    return { rolledBack: false, reason: 'already-consistent', priorState };
  }
  const nextBody = writeLastKnownState(beforeBody, priorState);
  const tmp = path.join(
    projectTmpDir(getProjectDir()),
    `aitm-rollback-${issueArg}-${Date.now()}.md`
  );
  const recording = await writeIssueBodyWithRetry({
    issueNumber: issueArg,
    repo: cfg.repo,
    body: nextBody,
    bodyBefore: beforeBody,
    target: priorState,
    writeIssueBody: async ({ body }) => {
      try {
        writeFileSync(tmp, body, 'utf8');
        await gh(['issue', 'edit', issueArg, '-R', cfg.repo, '--body-file', tmp]);
      } finally {
        try {
          unlinkSync(tmp);
        } catch {
          /* best-effort */
        }
      }
    },
  });
  if (recording.status === 'failed')
    return { rolledBack: false, priorState, reason: 'state-recording-failed', recording };
  return { rolledBack: recording.status === 'ok', priorState };
}

// #741 — success-path post-condition: after the board write is confirmed at
// `expectedStage` (#711 read-back) and the sentinel verifies, the authoritative
// `aitm-last-known-state` marker MUST also read `expectedStage`. On the happy
// path this always holds (stampEntryMarkers set it); a mismatch means a
// regression re-opened the board/marker gap and is surfaced (non-zero exit),
// never swallowed. Returns `{ consistent, recorded, expected, exit }`.
export async function assertBoardMarkerConsistent(ctx, expectedStage, nativeInput) {
  let native;
  if (isMemoryStageEffectScope()) {
    native = await import('./move-state-core.mjs');
    native.assertNativeStageConsistencyInput(nativeInput, ctx, expectedStage);
  } else assertRevisionStageHostEffect();
  const { issueArg, cfg, pexec } = ctx;
  const { readLastKnownState } = await import('../../gh-timing-comment.mjs');
  if (native) native.assertNativeStageConsistencyInput(nativeInput, ctx, expectedStage);
  const request = {
    file: 'gh',
    args: ['issue', 'view', issueArg, '-R', cfg.repo, '--json', 'body'],
    options: { timeout: GH_API_TIMEOUT_MS },
  };
  const response = native
    ? await native.readNativeStageConsistencyBody(nativeInput, request)
    : await pexec(request.file, request.args, request.options);
  if (native) native.assertNativeStageConsistencyResponse(nativeInput, request, response);
  const { stdout } = response;
  const body = JSON.parse(stdout).body ?? '';
  const recorded = readLastKnownState(body).state;
  const consistent = recorded === expectedStage;
  return {
    consistent,
    recorded,
    expected: expectedStage,
    exit: consistent ? null : STATUS_MARKER_CONSISTENCY_EXIT,
  };
}
