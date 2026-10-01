// @story #1859
import { isDeepStrictEqual } from 'node:util';
import { loadState } from '../../state.mjs';
import { pexec } from '../../../gh/lib/gh-client.mjs';
import { mutateIssueBody } from '../issue-body-mutate.mjs';
import { stripBodyVersion } from '../versioned-issue-write.mjs';
import { stampBodyVersion, parseBodyVersion } from '../body-version.mjs';
import { parseIssueDirectory } from '../github-records/issue-directory.mjs';
import {
  LIMITS,
  parseManifest,
  requestDigest,
  lineageDigest,
  makeRecord,
  serializePointer,
  stripReviewedPointer,
  sha256,
  refuse,
  ReviewedScopeError,
} from './model.mjs';
import { resolveScopeTarget, liveLines } from './targets.mjs';
import { readRecordingAuthority, readBoundManifest, validateLocalEvidence } from './runtime.mjs';
import { readCurrentRecord, ensureRecordComment } from './comments.mjs';

const capabilities = new WeakMap();
const protectedFamily = /<!--\s*aitm-(?:reviewed-scope-evidence|scope-evidence-policy)/;
const policyFamily = /<!--\s*aitm-scope-evidence-policy/;
const pointerFamily = /<!--\s*aitm-reviewed-scope-evidence/;

export function parseReviewedCheckArgs(rest, desired) {
  if (!rest.some((x) => x === '--reviewed-evidence' || x.startsWith('--reviewed-evidence=')))
    return null;
  if (desired !== 'checked') refuse('reviewed-scope-options');
  let manifestPath;
  const labels = [];
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (token === '--reviewed-evidence') {
      if (manifestPath !== undefined || !rest[index + 1] || rest[index + 1].startsWith('--'))
        refuse('reviewed-scope-options');
      manifestPath = rest[++index];
    } else if (token.startsWith('--')) refuse('reviewed-scope-options');
    else labels.push(token);
  }
  if (
    !manifestPath ||
    labels.length !== 1 ||
    !labels[0].trim() ||
    /^deep[- ]?dive complete$|^discussion complete$/i.test(labels[0].trim())
  )
    refuse('reviewed-scope-options');
  return { label: labels[0].trim(), manifestPath };
}
function samePointer(left, right) {
  return isDeepStrictEqual(left, right);
}
function targetOnBase(base, descriptor) {
  if (parseIssueDirectory({ issueBody: base }) !== null) refuse('reviewed-scope-directory');
  const target = resolveScopeTarget(base, descriptor.label);
  if (
    target.verifierBearing ||
    target.contentDigest !== descriptor.targetDigest ||
    target.checked !== descriptor.expectedGlyph ||
    !samePointer(target.pointer, descriptor.expectedPointer)
  )
    refuse('reviewed-scope-target-changed');
  return target;
}
function permittedBody(base, descriptor) {
  const target = targetOnBase(base, descriptor);
  const lines = base.split('\n');
  // Retain all original content bytes, removing only the pointer and its one
  // separator. Rechecks reuse the original line so pointer position is stable.
  if (samePointer(target.pointer, descriptor.nextPointer))
    lines[target.lineIndex] = target.raw.replace(/^- \[[ x]\]/, '- [x]');
  else
    lines[target.lineIndex] =
      stripReviewedPointer(target.raw).replace(/^- \[[ x]\]/, '- [x]') +
      ' ' +
      serializePointer(descriptor.nextPointer);
  return { body: lines.join('\n'), lineIndex: target.lineIndex };
}
function protectedLocations(body, family) {
  let section = '',
    ordinal = 0,
    scopeLine = 0;
  const found = [];
  for (const { raw } of liveLines(body)) {
    if (/^## /.test(raw)) {
      section = raw;
      ordinal = 0;
      scopeLine = 0;
    }
    if (/^\s*[-*+] \[[ xX]\]/.test(raw)) ordinal++;
    if (family.test(raw))
      found.push({
        section,
        ordinal,
        ...(family === policyFamily
          ? { scopeLine, raw }
          : {
              marker: raw.slice(raw.indexOf('<!--')),
              checked: /^- \[x\]/.test(raw),
              checkbox: /^- \[[ x]\] /.test(raw),
            }),
      });
    if (raw.trim()) scopeLine++;
  }
  return found;
}
/** Only this coordinator can mint the capability. Generic flags cannot grant it. */
export function validateReviewedDelta(base, next, capability) {
  const before = stripBodyVersion(base),
    after = stripBodyVersion(next);
  const descriptor = capability && capabilities.get(capability);
  if (descriptor) {
    const allowed = permittedBody(before, descriptor);
    if (after !== allowed.body) refuse('reviewed-scope-delta');
    return allowed.lineIndex;
  }
  if (!protectedFamily.test(before) && !protectedFamily.test(after)) return null;
  if (
    !isDeepStrictEqual(
      protectedLocations(before, policyFamily),
      protectedLocations(after, policyFamily)
    )
  )
    refuse('reviewed-scope-policy-mutation');
  const old = protectedLocations(before, pointerFamily),
    fresh = protectedLocations(after, pointerFamily);
  if (old.length !== fresh.length) refuse('reviewed-scope-pointer-mutation');
  for (let index = 0; index < old.length; index++) {
    const a = old[index],
      b = fresh[index];
    if (
      !isDeepStrictEqual({ ...a, checked: false }, { ...b, checked: false }) ||
      (!a.checked && b.checked)
    )
      refuse('reviewed-scope-pointer-mutation');
  }
  return null;
}
function boundInput(ctx, issueNumber, deps) {
  return {
    projectDir: ctx.projectDir,
    invokingDir: ctx.invokingDir ?? process.cwd(),
    issueNumber,
    cfg: ctx.cfg,
    deps,
  };
}
function bodyCapacity(body, version = Number.MAX_SAFE_INTEGER) {
  if (Buffer.byteLength(stampBodyVersion(stripBodyVersion(body), version)) > LIMITS.body)
    refuse('reviewed-scope-body-size');
}
function replaceable(error) {
  if (!(error instanceof ReviewedScopeError)) return false;
  if (error.code !== 'reviewed-scope-comment-unreadable') return true;
  return (
    error.cause?.status === 404 ||
    error.cause?.statusCode === 404 ||
    /HTTP 404/.test(String(error.cause?.stderr ?? error.cause?.message ?? ''))
  );
}
export async function recordReviewedScope({ ctx, label, manifestPath }) {
  const deps = { pexec: ctx.pexec ?? pexec, ...ctx.deps?.reviewedScope };
  const issueNumber = ctx.issueNumber ?? Number(loadState(ctx.statePath).active?.replace(/^#/, ''));
  const input = boundInput(ctx, issueNumber, deps);
  const readAuthority = deps.readRecordingAuthority ?? readRecordingAuthority;
  const readManifest = deps.readBoundManifest ?? readBoundManifest;
  const validateLocal = deps.validateLocalEvidence ?? validateLocalEvidence;
  const readLiveBody =
    deps.readLiveBody ??
    (async () => {
      const result = await deps.pexec(
        'gh',
        [
          'issue',
          'view',
          String(issueNumber),
          '-R',
          ctx.cfg.repo,
          '--json',
          'body',
          '--jq',
          '.body',
        ],
        { encoding: 'utf8' }
      );
      return result.stdout;
    });
  const authority = await readAuthority(input);
  const manifestBytes = await readManifest(manifestPath, authority, { deps });
  const manifest = parseManifest(manifestBytes);
  if (manifest.label !== label) refuse('reviewed-scope-label');
  const local = await validateLocal({ manifest, manifestBytes, manifestPath, authority, deps });
  const manifestDigest = sha256(manifestBytes);
  if (local.manifestDigest !== manifestDigest) refuse('reviewed-scope-manifest-changed');
  const initial = stripBodyVersion(await readLiveBody());
  if (parseIssueDirectory({ issueBody: initial }) !== null) refuse('reviewed-scope-directory');
  const target = resolveScopeTarget(initial, label);
  if (manifest.label !== target.label) refuse('reviewed-scope-label');
  if (target.verifierBearing) refuse('reviewed-scope-verifier-target');
  const request = requestDigest({ manifest, targetDigest: target.contentDigest });
  let current = null;
  if (target.pointer) {
    try {
      current = await readCurrentRecord({
        repository: authority.repository,
        issue: issueNumber,
        pointer: target.pointer,
        deps,
      });
    } catch (error) {
      if (!replaceable(error)) throw error;
    }
  }
  const equivalent =
    current?.requestDigest === request && current.targetDigest === target.contentDigest;
  const predecessor = target.pointer
    ? { commentId: target.pointer.commentId, sha256: target.pointer.sha256 }
    : null;
  const lineage =
    target.pointer?.lineage ??
    lineageDigest({
      repository: authority.repository,
      issue: issueNumber,
      targetDigest: target.contentDigest,
    });
  const descriptor = {
    label,
    targetDigest: target.contentDigest,
    expectedPointer: target.pointer,
    expectedGlyph: target.checked,
    nextPointer: target.pointer,
  };
  if (!equivalent) {
    descriptor.nextPointer = { commentId: '9'.repeat(20), sha256: 'a'.repeat(64), lineage };
    bodyCapacity(permittedBody(initial, descriptor).body);
    const record = makeRecord({
      manifest,
      targetDigest: target.contentDigest,
      requestDigest: request,
      lineage,
      predecessor,
      actor: authority.actor,
      recordedAt: (deps.now ?? (() => new Date().toISOString()))(),
    });
    const pointer = await ensureRecordComment({
      repository: authority.repository,
      issue: issueNumber,
      record,
      expectedPredecessor: predecessor,
      deps,
    });
    descriptor.nextPointer = {
      commentId: pointer.commentId,
      sha256: pointer.sha256,
      lineage: pointer.lineage,
    };
  } else bodyCapacity(permittedBody(initial, descriptor).body);
  const capability = Object.freeze({});
  capabilities.set(capability, Object.freeze(descriptor));
  const fresh = async (base, next, { readback = false } = {}) => {
    const observed = await readAuthority(input);
    if (!isDeepStrictEqual(observed, authority)) refuse('reviewed-scope-authority-changed');
    const bytes = await readManifest(manifestPath, observed, { deps });
    if (sha256(bytes) !== manifestDigest) refuse('reviewed-scope-manifest-changed');
    parseManifest(bytes);
    await validateLocal({ manifest, manifestBytes, manifestPath, authority: observed, deps });
    validateReviewedDelta(base, next, capability);
    // Current record must remain byte-authenticated even on a checked no-op.
    const confirmed = await readCurrentRecord({
      repository: authority.repository,
      issue: issueNumber,
      pointer: descriptor.nextPointer,
      deps,
    });
    if (confirmed.requestDigest !== request || confirmed.targetDigest !== target.contentDigest)
      refuse('reviewed-scope-record-changed');
    const live = await readLiveBody();
    targetOnBase(
      stripBodyVersion(live),
      readback
        ? { ...descriptor, expectedPointer: descriptor.nextPointer, expectedGlyph: true }
        : descriptor
    );
    bodyCapacity(next, parseBodyVersion(live) + 1);
  };
  const result = await mutateIssueBody({
    issueNumber,
    repo: authority.repository,
    deps,
    reviewedEvidenceCapability: capability,
    mutate: (base) => permittedBody(base, descriptor).body,
    validateFreshBaseAsync: fresh,
  });
  const finalBody = await readLiveBody();
  const finalTarget = resolveScopeTarget(finalBody, label);
  if (
    !finalTarget.checked ||
    finalTarget.contentDigest !== target.contentDigest ||
    !samePointer(finalTarget.pointer, descriptor.nextPointer)
  )
    refuse('reviewed-scope-readback');
  await fresh(initial, permittedBody(initial, descriptor).body, { readback: true });
  return { ...result, pointer: descriptor.nextPointer };
}
