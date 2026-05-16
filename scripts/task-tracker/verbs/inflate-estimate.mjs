// `inflate-estimate` verb — appends a "Discovered work — estimate inflation" section to
// the existing `<!-- aitm-refined-estimate: N -->` comment (legacy
// `aitm-groom-estimate:` also accepted) and atomically updates the
// Size + Estimate board fields and the aitm-fields block in the issue body.
//
// Each invocation appends a dated block; re-runs do NOT overwrite prior inflations.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  projectValuesForIssue,
  projectItemForIssue,
  fieldOptionMap,
  writeProjectFieldValue,
} from '../../gh/lib/github-projects.mjs';
import { loadProjectFieldDefs, fieldIdFor, valueForProjectField } from '../project-fields.mjs';
import {
  parseIssueFieldDb,
  stripIssueFieldDb,
  formatIssueFieldDb,
  defaultFieldValues,
} from '../issue-field-db.mjs';
import { GH_API_TIMEOUT_MS } from '../lib/process-timeouts.mjs';

const pexec = promisify(execFile);

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'];
const SIZE_CEILINGS = { XS: 2, S: 4, M: 10, L: 20 };
export const REFINED_ESTIMATE_MARKER_RE =
  /<!--\s*aitm-(?:refined|groom)-estimate:\s*\d+\s*-->/;
// Legacy alias retained for backward-compat imports.
export const GROOM_ESTIMATE_MARKER_RE = REFINED_ESTIMATE_MARKER_RE;

export function parseArgs(argv = []) {
  const args = argv.slice();
  const issueNumber = Number(args.shift());
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(
      `inflate-estimate: first argument must be a positive issue number, got: ${argv[0]}`
    );
  }

  const parsed = { issueNumber, size: null, estimate: null, reason: null, items: [] };
  let i = 0;
  while (i < args.length) {
    const flag = args[i];
    if (flag === '--size' && args[i + 1]) {
      parsed.size = args[i + 1];
      i += 2;
    } else if (flag === '--estimate' && args[i + 1]) {
      parsed.estimate = args[i + 1];
      i += 2;
    } else if (flag === '--reason' && args[i + 1]) {
      parsed.reason = args[i + 1];
      i += 2;
    } else if (flag === '--item' && args[i + 1]) {
      parsed.items.push(args[i + 1]);
      i += 2;
    } else {
      throw new Error(`inflate-estimate: unknown argument: ${flag}`);
    }
  }
  return parsed;
}

export function validateArgs({ size, estimate, reason, items }) {
  const errs = [];
  if (!size) errs.push('--size is required');
  else if (!SIZE_ORDER.includes(size)) errs.push(`--size must be one of: ${SIZE_ORDER.join(', ')}`);
  if (!estimate) {
    errs.push('--estimate is required');
  } else {
    const n = parseFloat(estimate.replace(/h$/i, ''));
    if (!Number.isFinite(n)) errs.push('--estimate must be a number (e.g. 4h or 4)');
  }
  if (!reason) errs.push('--reason is required');
  if (!items.length) errs.push('--item is required (repeatable)');
  if (errs.length) throw new Error(`inflate-estimate: ${errs.join('; ')}`);
}

function parseEstimateHours(estimate) {
  return parseFloat(String(estimate).replace(/h$/i, ''));
}

function parseItem(raw) {
  const m = raw.match(/^(.*?)\s*\(~([^)]+)\)\s*$/);
  if (m) return { description: m[1].trim(), effort: m[2].trim() };
  return { description: raw.trim(), effort: '?' };
}

export function buildInflationSection({
  reason,
  items,
  beforeSize,
  beforeEstimate,
  newSize,
  newEstimate,
  date = new Date().toISOString().slice(0, 10),
}) {
  const beforeIdx = SIZE_ORDER.indexOf(beforeSize);
  const afterIdx = SIZE_ORDER.indexOf(newSize);
  const bucketDelta = afterIdx - beforeIdx;
  const ceiling = SIZE_CEILINGS[beforeSize];
  const deltaCell =
    ceiling !== undefined
      ? `+${bucketDelta} bucket(s) (total effort exceeded ${beforeSize} ceiling of ${ceiling}h)`
      : `+${bucketDelta} bucket(s)`;

  const parsedItems = items.map(parseItem);

  const itemRows = parsedItems
    .map((it, i) => `| ${i + 1} | ${it.description} | ~${it.effort} |`)
    .join('\n');

  return [
    '',
    `---`,
    '',
    `### Discovered work — estimate inflation (${date})`,
    '',
    reason,
    '',
    '| # | Item | Effort |',
    '|---|---|---|',
    itemRows,
    '',
    '| Field | Before | After | Delta |',
    '|---|---|---|---|',
    `| Size | ${beforeSize} | ${newSize} | ${deltaCell} |`,
    `| Estimate | ${beforeEstimate}h | ${newEstimate}h | +${(newEstimate - beforeEstimate).toFixed(1).replace(/\.0$/, '')}h |`,
  ].join('\n');
}

async function defaultListComments({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    [
      'api',
      `repos/${repo}/issues/${issueNumber}/comments`,
      '--paginate',
      '--jq',
      '[.[] | {id, body}]',
    ],
    { timeout: GH_API_TIMEOUT_MS * 2 }
  );
  // --paginate emits one JSON array per page; merge them
  const pages = String(stdout || '')
    .trim()
    .split(/\n(?=\[)/);
  const comments = [];
  for (const page of pages) {
    try {
      comments.push(...JSON.parse(page));
    } catch {}
  }
  return comments;
}

async function defaultPatchComment({ repo, commentId, body }) {
  const tmp = path.join(os.tmpdir(), `aitm-inflate-${commentId}-${Date.now()}.md`);
  writeFileSync(tmp, body);
  try {
    await pexec(
      'gh',
      ['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${commentId}`, '-F', `body=@${tmp}`],
      { timeout: GH_API_TIMEOUT_MS * 2 }
    );
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

async function defaultGetIssueBody({ issueNumber, repo }) {
  const { stdout } = await pexec(
    'gh',
    ['issue', 'view', String(issueNumber), '-R', repo, '--json', 'body', '--jq', '.body'],
    { timeout: GH_API_TIMEOUT_MS }
  );
  return String(stdout || '').trim();
}

async function defaultWriteIssueBody({ issueNumber, repo, body }) {
  const tmp = path.join(os.tmpdir(), `aitm-inflate-body-${issueNumber}-${Date.now()}.md`);
  writeFileSync(tmp, body);
  try {
    await pexec('gh', ['issue', 'edit', String(issueNumber), '-R', repo, '--body-file', tmp], {
      timeout: GH_API_TIMEOUT_MS,
    });
  } finally {
    try {
      unlinkSync(tmp);
    } catch {}
  }
}

export async function runInflateEstimate(
  { issueNumber, size, estimate, reason, items },
  cfg,
  deps = {}
) {
  const listComments = deps.listComments || defaultListComments;
  const patchComment = deps.patchComment || defaultPatchComment;
  const getIssueBody = deps.getIssueBody || defaultGetIssueBody;
  const writeIssueBody = deps.writeIssueBody || defaultWriteIssueBody;
  const fetchProjectValues = deps.projectValuesForIssue || projectValuesForIssue;
  const getProjectItem = deps.projectItemForIssue || projectItemForIssue;
  const getFieldOptionMap = deps.fieldOptionMap || fieldOptionMap;
  const writeField = deps.writeProjectFieldValue || writeProjectFieldValue;
  const fieldDefsLoader = deps.loadProjectFieldDefs || loadProjectFieldDefs;

  const repo = cfg.repo;
  const newEstimate = parseEstimateHours(estimate);

  // 1. Find the refine-estimate comment
  const comments = await listComments({ issueNumber, repo });
  const refineComment = comments.find((c) => REFINED_ESTIMATE_MARKER_RE.test(c.body));
  if (!refineComment) {
    return { status: 'no-refine-comment' };
  }

  // 2. Read current board values for the "Before" column
  const fieldDefs = fieldDefsLoader();
  let beforeSize = null;
  let beforeEstimate = null;
  if (cfg.projectId) {
    try {
      const projVals = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      beforeSize = projVals.size || null;
      beforeEstimate = typeof projVals.estimate === 'number' ? projVals.estimate : null;
    } catch {
      // Non-fatal: fall through with nulls
    }
  }

  // 3. Build and append the inflation section
  const section = buildInflationSection({
    reason,
    items,
    beforeSize: beforeSize || '?',
    beforeEstimate: beforeEstimate ?? '?',
    newSize: size,
    newEstimate,
  });
  const patchedBody = refineComment.body + section;
  await patchComment({ repo, commentId: refineComment.id, body: patchedBody });

  // 4. Update board Size + Estimate fields
  let boardUpdated = false;
  if (cfg.projectId) {
    try {
      const { itemId } = await getProjectItem({ repo, projectId: cfg.projectId, issueNumber });
      if (itemId) {
        const optMap = await getFieldOptionMap(cfg.projectId);
        const sizeDef = fieldDefs.find((d) => d.key === 'size');
        const estimateDef = fieldDefs.find((d) => d.key === 'estimate');

        if (sizeDef) {
          const sizeFieldId = fieldIdFor(cfg, 'size');
          if (sizeFieldId) {
            const val = valueForProjectField(size, sizeDef.type);
            if (val)
              await writeField({
                projectId: cfg.projectId,
                itemId,
                fieldId: sizeFieldId,
                value: val,
                optionMap: optMap,
              });
          }
        }
        if (estimateDef) {
          const estimateFieldId = fieldIdFor(cfg, 'estimate');
          if (estimateFieldId) {
            const val = valueForProjectField(newEstimate, estimateDef.type);
            if (val)
              await writeField({
                projectId: cfg.projectId,
                itemId,
                fieldId: estimateFieldId,
                value: val,
                optionMap: optMap,
              });
          }
        }
        boardUpdated = true;
      }
    } catch (err) {
      process.stderr.write(`warning: board field update failed: ${err.message}\n`);
    }
  }

  // 5. Update aitm-fields block in issue body — force-merge new size/estimate
  try {
    const issueBody = await getIssueBody({ issueNumber, repo });
    const parsed = parseIssueFieldDb(issueBody);
    const existing = parsed.ok ? parsed.values : defaultFieldValues(fieldDefs);
    const updated = { ...existing, size, estimate: newEstimate };
    const nextBody = `${stripIssueFieldDb(issueBody)}\n\n${formatIssueFieldDb(updated)}\n`;
    if (nextBody !== issueBody) await writeIssueBody({ issueNumber, repo, body: nextBody });
  } catch (err) {
    process.stderr.write(`warning: issue body update failed: ${err.message}\n`);
  }

  return { status: 'appended', boardUpdated };
}

export async function verbInflateEstimate(argv, cfg) {
  const parsed = parseArgs(argv);
  validateArgs(parsed);
  const result = await runInflateEstimate(parsed, cfg);

  if (result.status === 'no-refine-comment' || result.status === 'no-groom-comment') {
    console.error(
      `error: no \`<!-- aitm-refined-estimate: ${parsed.issueNumber} -->\` comment (or legacy aitm-groom-estimate) found on issue #${parsed.issueNumber}.\n` +
        `  This comment is posted when an issue transitions to Refine. Has issue #${parsed.issueNumber} been refined?`
    );
    process.exit(1);
  }

  console.log(`✓ Inflation section appended to refine-estimate comment on #${parsed.issueNumber}`);
  if (result.boardUpdated) {
    console.log(
      `✓ Board Size → ${parsed.size}, Estimate → ${parseEstimateHours(parsed.estimate)}h`
    );
  } else {
    console.log(`  (board fields skipped — projectId not configured or no project item found)`);
  }
}
