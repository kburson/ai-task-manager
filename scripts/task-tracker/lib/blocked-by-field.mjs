// `Blocked By` Project field mirror (#287, parent epic #280).
//
// The canonical record of "what blocks this issue" is the
// `<!-- aitm-blocked-by: #M, #P -->` body marker. This helper mirrors that
// marker into a TEXT Project field on the kanban board so the value is
// visible at a glance without opening the issue.
//
// Mirror direction is one-way: marker → field. UI-side edits to the field
// drift until the next marker write. That trade-off keeps the runtime free
// of merge logic on every transition.
//
// Wired call sites:
//
//   - `verbs/block.mjs`     — after `addBlockedBy` succeeds.
//   - `verbs/unblock.mjs`   — after `removeBlockedBy` succeeds (writes the
//                             remaining refs; empty string when fully cleared).
//   - `lib/unpark-dependents.mjs` — after each dependent's body edit.
//
// All call sites are no-ops when `cfg.fieldBlockedBy` is absent (older
// installs pre-migrate). The helper does not throw on missing config — it
// returns `{ skipped: 'no-field-id' }` so the caller can log and continue.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GH_API_TIMEOUT_MS } from './process-timeouts.mjs';
import { warnMissingFieldId } from './field-config-warn.mjs';

const pexec = promisify(execFile);

/**
 * Render a blocker-ref list into the field value:
 *
 *   []           → ''
 *   [5]          → '#5'
 *   [11, 3, 7]   → '#3, #7, #11'  (sorted ascending, deduped)
 *
 * Non-integer / non-positive entries are dropped.
 */
export function formatBlockedByValue(refs) {
  if (!Array.isArray(refs)) return '';
  const sorted = [...new Set(refs.filter((n) => Number.isInteger(n) && n > 0))].sort(
    (a, b) => a - b
  );
  if (sorted.length === 0) return '';
  return sorted.map((n) => `#${n}`).join(', ');
}

// Default GraphQL writer. Looks up the issue's project item, then writes the
// TEXT value via `updateProjectV2ItemFieldValue`. Returns `false` when the
// issue is not in any project (e.g. pre-board issue) — same fail-soft shape
// as the rest of the project-field helpers.
async function defaultWriteFieldValue({ cfg, issueNumber, value, exec = pexec }) {
  const { projectId, repo, fieldBlockedBy } = cfg;
  if (!projectId || !repo || !fieldBlockedBy) return false;

  const { stdout: viewOut } = await exec(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){issue(number:$num){projectItems(first:10){nodes{id project{id}}}}}}`,
      '-F',
      `owner=${repo.split('/')[0]}`,
      '-F',
      `name=${repo.split('/')[1]}`,
      '-F',
      `num=${issueNumber}`,
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  let itemId = '';
  try {
    const data = JSON.parse(viewOut);
    const nodes = data?.data?.repository?.issue?.projectItems?.nodes || [];
    const match = nodes.find((n) => n?.project?.id === projectId);
    itemId = match?.id || '';
  } catch {
    itemId = '';
  }
  if (!itemId) return false;

  await exec(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=mutation($project:ID!,$item:ID!,$field:ID!,$val:String!){updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:{text:$val}}){projectV2Item{id}}}`,
      '-F',
      `project=${projectId}`,
      '-F',
      `item=${itemId}`,
      '-F',
      `field=${fieldBlockedBy}`,
      '-F',
      `val=${value}`,
    ],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return true;
}

/**
 * Write the Blocked By field for an issue.
 *
 * @param {object}   opts
 * @param {number}   opts.issueNumber
 * @param {number[]} opts.refs         current blocker numbers (post-mutation)
 * @param {object}   opts.cfg          must carry `projectId`, `repo`,
 *                                     `fieldBlockedBy`
 * @param {object}   [opts.deps]
 * @param {Function} [opts.deps.writeFieldValue]  injectable for tests
 * @returns {Promise<{ok:true, value:string} | {skipped:'no-field-id'|'no-item'}>}
 */
export async function writeBlockedByField({ issueNumber, refs, cfg, deps = {} } = {}) {
  if (!cfg || !cfg.fieldBlockedBy) {
    warnMissingFieldId({ cfgKey: 'fieldBlockedBy', context: 'board mirror skipped' });
    return { skipped: 'no-field-id' };
  }
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('writeBlockedByField: issueNumber must be a positive integer');
  }
  const value = formatBlockedByValue(refs);
  // #632 — thread an injectable exec into the default gh writer so its two
  // subprocess round-trips are unit-drivable. Production passes no `deps.exec`,
  // so `defaultWriteFieldValue` binds the real `pexec` — byte-identical.
  const execFn = deps.exec || pexec;
  const writer = deps.writeFieldValue || ((a) => defaultWriteFieldValue({ ...a, exec: execFn }));
  const ok = await writer({ cfg, issueNumber, value });
  if (!ok) return { skipped: 'no-item' };
  return { ok: true, value };
}
