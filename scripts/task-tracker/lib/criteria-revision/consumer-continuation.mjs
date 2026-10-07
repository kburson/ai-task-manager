// @story #1855
// Reconstructable ordinary metadata continuation. No proof, checkbox, stage,
// grant, record, or pending transaction changes are authorized here.
import { canonicalRecordJson } from '../github-records/canonical-json.mjs';
import { BODY_VERSION_MARKER_RE, parseBodyVersion } from '../body-version.mjs';
import {
  findLostMarkers, findCheckboxesTickedWithoutProof, findNewMalformedVerifiedCmds,
  findNewlyIntroducedExecutionProof, findUnexpectedSectionLoss, validateMarkerAdvances,
} from '../body-invariants.mjs';
import { readRevisionDefinitions, hashSemanticContract } from './proposal.mjs';
import { sameRevisionObservation } from './canonical.mjs';
import { validateExecutor } from './schema.mjs';
const equal = (a, b) => canonicalRecordJson(a) === canonicalRecordJson(b);
const sourceSections = ['Scope', 'User Story', 'Deep-Dive Analysis', 'Plan Metadata', 'Story Origin'];
function sourceSection(body, name) {
  const lines = body.split('\n'), result = [];
  let active = false;
  for (const line of lines) {
    if (/^##\s/.test(line)) active = line.trim() === `## ${name}`;
    if (active) result.push(line);
  }
  return result.join('\n').trimEnd();
}
function controls(body) {
  return [...body.matchAll(/<!--[\s\S]*?-->/g)]
    .map(m => m[0]).filter(marker => !BODY_VERSION_MARKER_RE.test(marker));
}
function checkboxes(body) { return body.split('\n').filter(line => /^\s*- \[[ x]\]/i.test(line)); }
export function isMetadataOnlyBodyChange(before, after, observation, definitions) {
  try {
    for (const body of [before, after]) {
      const claims = [...body.matchAll(/<!--\s*aitm-body-version\b[^]*?-->/gi)];
      if (claims.length !== 1 || claims[0][0].match(BODY_VERSION_MARKER_RE)?.[0] !== claims[0][0] ||
          !Number.isSafeInteger(parseBodyVersion(body))) return false;
    }
    if (parseBodyVersion(after) <= parseBodyVersion(before)) return false;
    if (findLostMarkers(before, after).length || findCheckboxesTickedWithoutProof(before, after).length ||
        findNewMalformedVerifiedCmds(before, after).length || findNewlyIntroducedExecutionProof(before, after).length ||
        findUnexpectedSectionLoss(before, after)) return false;
    validateMarkerAdvances(before, after);
    if (!equal(controls(before), controls(after)) || !equal(checkboxes(before), checkboxes(after))) return false;
    if (sourceSections.some(name => sourceSection(before, name) !== sourceSection(after, name))) return false;
    const identities = definitions.map(d => ({ identity: d.identity, section: d.section, rootId: d.rootId,
      definitionHash: hashSemanticContract([{ ...d, identity: 'unbound' }]) }));
    const current = readRevisionDefinitions({ ...observation, body: { bytes: after, version: parseBodyVersion(after) }, identities });
    return hashSemanticContract(current) === hashSemanticContract(definitions);
  } catch { return false; }
}
export function metadataContinuation({ observation, expected, proposal }) {
  if (!expected || !proposal || proposal.mode === 'abort') return false;
  if (!Number.isSafeInteger(observation.body.version) || observation.body.version <= expected.body.version ||
      parseBodyVersion(observation.body.bytes) !== observation.body.version) return false;
  const comparable = { ...observation, body: expected.body };
  if (!sameRevisionObservation(comparable, expected)) return false;
  return isMetadataOnlyBodyChange(expected.body.bytes, observation.body.bytes, observation, proposal.after.definitions);
}

// Data comparison only: current admission still requires private complete native
// replay, exact current runtime scope, and the actual held mutation capability.
export function sameStableRevisionExecutor(left, right) {
  validateExecutor(left); validateExecutor(right);
  return left.adapter === right.adapter && left.worktree === right.worktree && left.branch === right.branch;
}
