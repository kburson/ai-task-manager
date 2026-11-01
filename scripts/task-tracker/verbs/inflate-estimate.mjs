// `inflate-estimate` verb — appends a "Discovered work — estimate inflation" section to
// the existing `<!-- aitm-refined-estimate: N -->` comment and updates through resumable publication
// the Size + Estimate board fields and the aitm-fields block in the
// issue body.
//
// Each revision appends one keyed audit block; exact retries preserve its history.

import {
  executeEstimateWriter,
  observedEstimateEffect,
} from '../lib/estimate-writer-publication.mjs';
import {
  intendedInflationInput,
  reconcileInflationAudit,
  validateAuditRequest,
} from '../lib/decomposition-inflation-audit.mjs';
import { pexec } from '../../gh/lib/gh-client.mjs';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import { projectScratchDir } from '../lib/scratch-dir.mjs';

import {
  projectValuesForIssue,
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
import { mutateIssueBody } from '../lib/issue-body-mutate.mjs';
import { ceilEstimateHours } from '../lib/estimation/estimate-granularity.mjs';

const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL'];
const SIZE_CEILINGS = { XS: 2, S: 4, M: 10, L: 20 };
export const REFINED_ESTIMATE_MARKER_RE = /<!--\s*aitm-refined-estimate:\s*\d+\s*-->/;

export function parseArgs(argv = []) {
  const args = argv.slice();
  const issueNumber = Number(args.shift());
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error(
      `inflate-estimate: first argument must be a positive issue number, got: ${argv[0]}`
    );
  }

  if (args.includes('--reconcile-audit') || args.includes('--current-input')) {
    if (args.length !== 4 || args[0] !== '--reconcile-audit' || args[2] !== '--current-input')
      throw new Error('inflate-estimate: invalid reconciliation arguments');
    const request = { issueNumber, reconcileAudit: args[1], currentInput: args[3] };
    validateAuditRequest(request);
    return request;
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

export function validateArgs(request) {
  if ('reconcileAudit' in request) return validateAuditRequest(request);
  const { size, estimate, reason, items } = request;
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
  return ceilEstimateHours(parseFloat(String(estimate).replace(/h$/i, '')));
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
      '[.[] | {id, node_id, body}]',
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
    } catch {
      /* best-effort: optional read; fall back to default on parse/IO error */
    }
  }
  return comments;
}

async function defaultPatchComment({ repo, commentId, body }) {
  const tmp = path.join(projectScratchDir('gh'), `aitm-inflate-${commentId}-${Date.now()}.md`);
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
    } catch {
      /* best-effort: cleanup; failure is non-fatal */
    }
  }
}

async function defaultMutateIssueBody({ issueNumber, repo, mutate }) {
  await mutateIssueBody({
    issueNumber,
    repo,
    mutate,
    timeout: GH_API_TIMEOUT_MS,
    deps: { pexec },
  });
}

export async function runInflateEstimate(request, cfg, deps = {}) {
  const { issueNumber, size, estimate, reason, items } = request;
  const listComments = deps.listComments ?? defaultListComments,
    patchComment = deps.patchComment ?? defaultPatchComment;
  if ('reconcileAudit' in request) return reconcileInflationAudit(request, cfg, deps, listComments);
  const mutateBody = deps.mutateIssueBody ?? defaultMutateIssueBody;
  const fetchProjectValues = deps.projectValuesForIssue ?? projectValuesForIssue;
  const fieldDefs = (deps.loadProjectFieldDefs ?? loadProjectFieldDefs)();
  const newEstimate = parseEstimateHours(estimate),
    repo = cfg.repo;
  const comments = await listComments({ issueNumber, repo });
  const refine = comments.filter((c) => REFINED_ESTIMATE_MARKER_RE.test(c.body));
  if (!refine.length) return { status: 'no-refine-comment' };
  if (refine.length !== 1) throw new Error('inflate-estimate:ambiguous-refine-comment');
  const readComment = async () => {
    const matches = (await listComments({ issueNumber, repo })).filter(
      (c) => c.id === refine[0].id
    );
    if (matches.length !== 1) throw new Error('inflate-estimate:comment-readback');
    return observedEstimateEffect(matches[0].body);
  };
  const readBody =
    deps.getIssueBody ??
    (async () =>
      JSON.parse(
        (
          await pexec(
            'gh',
            ['issue', 'view', String(issueNumber), '--repo', repo, '--json', 'body'],
            { timeout: GH_API_TIMEOUT_MS }
          )
        ).stdout
      ).body);
  const readFields = async () => {
    const parsed = parseIssueFieldDb(await readBody());
    if (!parsed.ok) throw new Error('inflate-estimate:fields-readback');
    return observedEstimateEffect({
      estimate: parsed.values.estimate ?? null,
      size: parsed.values.size ?? null,
    });
  };
  let nextComment;
  const proposal = { estimate: { basis: 'published', hours: newEstimate, proposalId: null }, size };
  return executeEstimateWriter({
    cfg,
    issueNumber,
    writerId: 'inflate-estimate',
    key: { size, estimate: newEstimate, reason, items },
    proposal,
    deriveIntendedInput: (initial) =>
      intendedInflationInput(initial, proposal, comments, refine[0].id, nextComment),
    deps,
    effects: async ({ subject, operationId, createdAt }) => {
      const before = await fetchProjectValues({ cfg, fieldDefs, issueNumber });
      const comment = (await readComment()).value,
        key = `Publication operation: ${operationId}`;
      const body = comment.includes(key)
        ? comment
        : comment +
          buildInflationSection({
            reason,
            items,
            beforeSize: before.size,
            beforeEstimate: before.estimate,
            newSize: size,
            newEstimate,
            date: createdAt.slice(0, 10),
          }) +
          `\n${key}\n`;
      nextComment = body;
      const options = await (deps.fieldOptionMap ?? fieldOptionMap)(cfg.projectId);
      const boardEffect = (field, value, resource) => ({
        id: field,
        resource,
        targetIdentity: subject.projectItemId,
        value,
        read: async () =>
          observedEstimateEffect(
            (await fetchProjectValues({ cfg, fieldDefs, issueNumber }))[field] ?? null
          ),
        apply: async () => {
          const definition = fieldDefs.find((d) => d.key === field),
            fieldId = fieldIdFor(cfg, field);
          if (!definition || !fieldId) throw new Error(`inflate-estimate:field-${field}`);
          await (deps.writeProjectFieldValue ?? writeProjectFieldValue)({
            projectId: cfg.projectId,
            itemId: subject.projectItemId,
            fieldId,
            value: valueForProjectField(value, definition.type),
            optionMap: options,
          });
        },
      });
      return [
        {
          id: 'audit',
          resource: 'comment',
          targetIdentity: `comment:${refine[0].id}`,
          value: body,
          read: readComment,
          apply: () => patchComment({ repo, commentId: refine[0].id, body }),
        },
        boardEffect('size', size, 'project-size'),
        boardEffect('estimate', newEstimate, 'project-estimate'),
        {
          id: 'fields',
          resource: 'body-fields',
          targetIdentity: `${repo}#${issueNumber}:fields`,
          value: { estimate: newEstimate, size },
          read: readFields,
          apply: () =>
            mutateBody({
              issueNumber,
              repo,
              mutate: (base) => {
                const parsed = parseIssueFieldDb(base),
                  existing = parsed.ok ? parsed.values : defaultFieldValues(fieldDefs);
                return `${stripIssueFieldDb(base)}\n\n${formatIssueFieldDb({ ...existing, size, estimate: newEstimate })}\n`;
              },
            }),
        },
      ];
    },
  });
}

export async function verbInflateEstimate(argv, cfg) {
  const parsed = parseArgs(argv);
  validateArgs(parsed);
  const result = await runInflateEstimate(parsed, cfg);

  if (result.status === 'no-refine-comment') {
    console.error(
      `error: no \`<!-- aitm-refined-estimate: ${parsed.issueNumber} -->\` comment found on issue #${parsed.issueNumber}.\n` +
        `  This comment is posted when an issue transitions to Refine. Has issue #${parsed.issueNumber} been refined?`
    );
    process.exit(1);
  }

  if (result.status !== 'recorded') {
    console.error(
      `inflate-estimate: ${result.status}: ${result.reason ?? 'publication unconfirmed'}`
    );
    process.exitCode = 1;
    return;
  }
  if (parsed.reconcileAudit) {
    console.log(`✓ Inflation audit ${parsed.reconcileAudit} reconciled at ${result.operationId}`);
    return;
  }
  console.log(`✓ Inflation section appended to refine-estimate comment on #${parsed.issueNumber}`);
  if (result.status === 'recorded') {
    console.log(
      `✓ Board Size → ${parsed.size}, Estimate → ${parseEstimateHours(parsed.estimate)}h`
    );
  } else {
    console.log(`  (board fields skipped — projectId not configured or no project item found)`);
  }
}
