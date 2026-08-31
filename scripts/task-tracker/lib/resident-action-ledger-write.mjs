// @story #1117 #1454

import {
  RESIDENT_ACTION_HEAD_SCHEMA,
  canonicalJson,
  fingerprint,
  parseBodyLedgerHead,
  parseSpillHeadComment,
  renderBodyLedgerHead,
  renderSpillHeadComment,
} from './resident-action-ledger-codec.mjs';
import { mutateIssueBody } from './issue-body-mutate.mjs';

export const INLINE_HEAD_MARKER_LIMIT = 8192;
export const INLINE_BODY_LIMIT = 57344;

const BODY_HEAD_RE = /<!--\s*aitm-resident-action-ledger-head\s+[^]*?-->/i;

function fullHead(head) {
  return {
    schema: RESIDENT_ACTION_HEAD_SCHEMA,
    visit: head.visit,
    commit: head.commit ?? null,
    definition: head.definition,
    audit: head.audit ?? null,
    actions: head.actions ?? {},
  };
}

export function createGenesisHead({ visit, definition, commit = null, audit = null } = {}) {
  const head = {
    mode: 'inline',
    visit,
    commit,
    definition,
    audit,
    actions: {},
  };
  return Object.freeze({ ...head, marker: renderBodyLedgerHead(head) });
}

function replaceHead(body, marker) {
  const source = String(body || '');
  if (BODY_HEAD_RE.test(source)) return source.replace(BODY_HEAD_RE, marker);
  return `${source.replace(/\s*$/, '')}\n\n${marker}\n`;
}

function expectedMatches(expectedHead, actualHead) {
  if (expectedHead == null) return actualHead == null;
  if (!actualHead) return false;
  const expected =
    typeof expectedHead === 'string'
      ? parseBodyLedgerHead(expectedHead)
      : expectedHead.marker
        ? parseBodyLedgerHead(expectedHead.marker)
        : expectedHead;
  const clean = (value) => {
    const { marker: _marker, ...rest } = value;
    return rest;
  };
  return canonicalJson(clean(expected)) === canonicalJson(clean(actualHead));
}

function commentId(created) {
  const id = created?.id ?? created?.databaseId ?? created?.commentId;
  if (id == null) throw new Error('resident-action-spill-comment-id-missing');
  return String(id);
}

async function readVerifiedSpill({ issue, id, body, readComment }) {
  const found = await readComment(issue, id);
  const foundBody = typeof found === 'string' ? found : found?.body;
  if (!foundBody || fingerprint(foundBody) !== fingerprint(body)) {
    throw new Error('resident-action-spill-verification-failed');
  }
  parseSpillHeadComment(foundBody);
}

export async function advanceActionLedgerHead({
  issue,
  repo,
  expectedHead,
  nextHead,
  deps = {},
} = {}) {
  if (!issue) throw new Error('advanceActionLedgerHead: issue is required');
  if (!repo) throw new Error('advanceActionLedgerHead: repo is required');
  const createComment = deps.createComment;
  const readComment = deps.readComment;
  const complete = fullHead(nextHead);
  const inline = renderBodyLedgerHead({ mode: 'inline', ...complete });

  let mode = 'inline';
  let marker = inline;
  let spill = null;
  let commentVerifications = 0;

  const mutation = (base) => {
    const actual = parseBodyLedgerHead(base);
    const candidate = replaceHead(base, inline);
    if (
      inline.length <= INLINE_HEAD_MARKER_LIMIT &&
      candidate.length <= INLINE_BODY_LIMIT &&
      !(actual?.mode === 'spill' && actual.visit === complete.visit)
    ) {
      mode = 'inline';
      marker = inline;
    } else {
      if (!spill) throw new Error('resident-action-spill-not-prepared');
      mode = 'spill';
      marker = spill.marker;
    }
    return replaceHead(base, marker);
  };

  const initialBody = await deps.fetchBody(repo, issue);
  const initialActual = parseBodyLedgerHead(initialBody);
  const initialInlineBody = replaceHead(initialBody, inline);
  const mustSpill =
    inline.length > INLINE_HEAD_MARKER_LIMIT ||
    initialInlineBody.length > INLINE_BODY_LIMIT ||
    (initialActual?.mode === 'spill' && initialActual.visit === complete.visit);

  if (mustSpill) {
    if (typeof createComment !== 'function' || typeof readComment !== 'function') {
      throw new Error('resident-action-spill-capability-unavailable');
    }
    const spillBody = renderSpillHeadComment(complete);
    const created = await createComment(issue, spillBody);
    const id = commentId(created);
    await readVerifiedSpill({ issue, id, body: spillBody, readComment });
    commentVerifications += 1;
    spill = {
      id,
      body: spillBody,
      marker: renderBodyLedgerHead({
        mode: 'spill',
        visit: complete.visit,
        commit: complete.commit,
        audit: complete.audit,
        head: `${id}:${fingerprint(spillBody)}`,
      }),
    };
  }

  const write = await mutateIssueBody({
    issueNumber: issue,
    repo,
    mutate: mutation,
    deps,
    allowMarkerAdvance: ['aitm-resident-action-ledger-head'],
    validateFreshBase: (base) => {
      if (!expectedMatches(expectedHead, parseBodyLedgerHead(base))) {
        throw new Error('stale-expected-head');
      }
    },
  });

  const verifiedHead = parseBodyLedgerHead(write.body);
  if (!verifiedHead || verifiedHead.mode !== mode) {
    throw new Error('resident-action-head-readback-failed');
  }
  if (spill) {
    await readVerifiedSpill({ issue, id: spill.id, body: spill.body, readComment });
    commentVerifications += 1;
  }
  return Object.freeze({ mode, head: verifiedHead, write, commentVerifications });
}
