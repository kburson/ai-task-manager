// @story #1210
import { readFileSync } from 'node:fs';

import { upsertOwnedComment } from '../lib/owned-comment.mjs';
import { loadState } from '../state.mjs';
import { assertGovernedMutationSession } from './issue-body.mjs';

function fail(category, detail = '') {
  throw new Error(`comment:${category}${detail ? `: ${detail}` : ''}`);
}

export function parseCommentArgs(argv = []) {
  let issueNumber = null;
  let key = null;
  let bodyFile = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index]);
    if (/^#?\d+$/.test(arg)) {
      if (issueNumber !== null) fail('duplicate issue-number');
      issueNumber = Number(arg.replace(/^#/, ''));
      continue;
    }
    const flags = [
      ['--key', 'key'],
      ['--body-file', 'bodyFile'],
    ];
    let handled = false;
    for (const [flag, field] of flags) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        if ((field === 'key' ? key : bodyFile) !== null) fail(field);
        const inline = arg.startsWith(`${flag}=`) ? arg.slice(flag.length + 1) : null;
        const value = inline ?? argv[index + 1];
        if (!value || String(value).startsWith('--')) fail(field);
        if (inline === null) index += 1;
        if (field === 'key') key = String(value);
        else bodyFile = String(value);
        handled = true;
        break;
      }
    }
    if (!handled) fail('unknown argument', arg);
  }
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) fail('issue-number');
  if (key === null) fail('key');
  if (bodyFile === null) fail('body-file');
  return { issueNumber, key, bodyFile };
}

export async function runCommentVerb(ctx, deps = {}) {
  const args = parseCommentArgs(ctx?.rest || []);
  const load = deps.loadState || loadState;
  const state = load(ctx.statePath, ctx.state);
  assertGovernedMutationSession(state, args.issueNumber);
  const readFile = deps.readFile || ((file) => readFileSync(file, 'utf8'));
  let body;
  try {
    body = readFile(args.bodyFile);
  } catch (error) {
    fail('body-file', error?.message || String(error));
  }
  const upsert = deps.upsertOwnedComment || upsertOwnedComment;
  return upsert({
    repository: ctx.cfg?.repo,
    issue: args.issueNumber,
    key: args.key,
    body,
    deps,
  });
}

export async function verbComment(ctx) {
  const result = await runCommentVerb(ctx);
  console.log(`comment: ${result.status} id=${result.id}`);
}
