// Wave detection — batched GraphQL parent-enumeration for a list of candidate
// children about to be dispatched as a fan-out.
//
// `classify({ candidates, repo, runQuery })` returns:
//   { solos: number[], parented: [{ child, parent }], multiParent: bool,
//     parents: Set<number>, kind: 'single'|'all-solo'|'all-parented-shared'|
//                                'mixed'|'multi-parent' }
//
// `runQuery({ owner, repoName, batch })` is injectable for tests; the default
// implementation calls GitHub's GraphQL with up to 20 aliased nodes per call.

import { gql, splitRepo } from './github-projects.mjs';

const BATCH_SIZE = 20;

export async function classify({ candidates, repo, runQuery = defaultRunQuery } = {}) {
  const nums = (candidates || [])
    .map((n) => Number(String(n).replace(/^#/, '')))
    .filter(Number.isFinite);
  if (nums.length === 0) {
    return { solos: [], parented: [], multiParent: false, parents: new Set(), kind: 'empty' };
  }
  if (!repo) throw new Error('wave-detect: repo is required');
  const { owner, repoName } = splitRepo(repo);

  const lookups = new Map();
  for (let i = 0; i < nums.length; i += BATCH_SIZE) {
    const batch = nums.slice(i, i + BATCH_SIZE);
    const res = await runQuery({ owner, repoName, batch });
    for (const row of res || []) {
      lookups.set(Number(row.child), row.parent == null ? null : Number(row.parent));
    }
  }

  const solos = [];
  const parented = [];
  const parents = new Set();
  for (const n of nums) {
    const p = lookups.get(n);
    if (p == null) solos.push(n);
    else {
      parented.push({ child: n, parent: p });
      parents.add(p);
    }
  }

  let kind;
  if (nums.length === 1) kind = 'single';
  else if (solos.length === nums.length) kind = 'all-solo';
  else if (parented.length === nums.length && parents.size === 1) kind = 'all-parented-shared';
  else if (parents.size > 1 && solos.length === 0) kind = 'multi-parent';
  else kind = 'mixed';

  return { solos, parented, multiParent: parents.size > 1, parents, kind };
}

export function buildBatchQuery(batch) {
  const aliases = batch
    .map((_, i) => `i${i}: issue(number:$n${i}){ number parent{ number } }`)
    .join('\n      ');
  const vars = batch.map((_, i) => `$n${i}:Int!`).join(', ');
  return `
    query($owner:String!, $name:String!, ${vars}) {
      repository(owner:$owner, name:$name) {
        ${aliases}
      }
    }`;
}

export async function defaultRunQuery({ owner, repoName, batch }) {
  const query = buildBatchQuery(batch);
  const variables = { owner, name: repoName };
  batch.forEach((n, i) => {
    variables[`n${i}`] = Number(n);
  });
  const data = await gql(query, variables);
  const repo = data?.repository || {};
  const out = [];
  batch.forEach((n, i) => {
    const node = repo[`i${i}`];
    out.push({ child: Number(n), parent: node?.parent?.number ?? null });
  });
  return out;
}

export function rejectionMessage(result) {
  if (result.kind === 'mixed') {
    const solo = result.solos.join(', ');
    const par = result.parented.map((p) => `#${p.child}→#${p.parent}`).join(', ');
    return `wave-detect: mixed-fanout — solo [${solo}] and parented [${par}]. Hoist solos under the existing parent, or detach the parented child, before retrying.`;
  }
  if (result.kind === 'multi-parent') {
    const groups = result.parented.map((p) => `#${p.child}→#${p.parent}`).join(', ');
    return `wave-detect: multi-parent — ${groups}. Dispatch these as separate waves.`;
  }
  return null;
}
