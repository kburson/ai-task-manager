// `analyze` verb — Grooming → Analysis transition gate.
//
// Composes four predicates (field-required, body-section-required,
// wave-admission, cascade-grooming) and, on success, calls
// `scripts/gh/move-state.mjs <issue> analyze`.
//
// Refusal contract: exit code 4, one blocker per line on stderr. Mirrors
// `move-state.mjs`'s body-gate convention so callers and tests can rely on
// a single refusal exit code across the gate stack.

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gh, gql, splitRepo, projectValuesForIssue } from '../../gh/lib/github-projects.mjs';
import { admit as defaultAdmit } from '../../gh/lib/wave-admission.mjs';
import {
  checkRequiredFields,
  checkRequiredBodySections,
  checkWaveAdmission,
  checkCascadeGrooming,
} from '../lib/body-gates.mjs';
import { loadProjectFieldDefs } from '../project-fields.mjs';

const pexec = promisify(execFile);
const __dir = path.dirname(fileURLToPath(import.meta.url));

const SKIP_NETWORK = process.env.TT_SKIP_NETWORK === '1';

// Default fetchers extract issue context from real GitHub. Tests inject stubs
// via the `deps` argument.

async function defaultFetchIssueContext({ issueNumber, repo }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(`
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          title
          body
          labels(first: 50) { nodes { name } }
          parent { number }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(issueNumber) }
  );
  const issue = data?.repository?.issue;
  if (!issue) throw new Error(`analyze: issue #${issueNumber} not found in ${repo}`);
  const isEpic = /^EPIC:/i.test(issue.title || '');
  return {
    title: issue.title || '',
    body: issue.body || '',
    labels: (issue.labels?.nodes || []).map(l => l.name),
    parentEpicNumber: issue.parent?.number ?? null,
    isEpic,
  };
}

async function defaultFetchSubIssueStates({ epicNumber, repo, projectId }) {
  const { owner, repoName } = splitRepo(repo);
  const data = await gql(`
    query($owner: String!, $repo: String!, $issue: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $issue) {
          subIssues(first: 100) {
            nodes {
              number
              state
              projectItems(first: 20) {
                nodes {
                  project { id }
                  fieldValues(first: 100) {
                    nodes {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { ... on ProjectV2FieldCommon { name } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo: repoName, issue: Number(epicNumber) }
  );
  const subs = data?.repository?.issue?.subIssues?.nodes || [];
  const out = [];
  for (const sub of subs) {
    if (!sub) continue;
    const item = (sub.projectItems?.nodes || []).find(n => n?.project?.id === projectId);
    let state = '';
    if (item) {
      for (const fv of item.fieldValues.nodes || []) {
        const fname = fv?.field?.name;
        if (fname && fname.toLowerCase() === 'status' && fv.name) {
          state = String(fv.name).toLowerCase();
          break;
        }
      }
    }
    if (!state && sub.state === 'CLOSED') state = 'done';
    out.push({ number: sub.number, state });
  }
  return out;
}

// Resolve required project field values for the issue.
async function defaultResolveFieldValues({ cfg, issueNumber }) {
  const fieldDefs = loadProjectFieldDefs();
  const values = await projectValuesForIssue({ cfg, fieldDefs, issueNumber });
  return {
    estimate: values.estimate ?? null,
    size: values.size ?? null,
    priority: values.priority ?? null,
    sequence: values.sequence ?? null,
  };
}

// Spawn move-state.mjs <N> analyze and forward exit code.
async function runMoveState(issueNumber) {
  const candidates = [
    path.resolve(__dir, '../../gh/move-state.mjs'),
  ];
  const script = candidates.find(Boolean);
  return new Promise(resolve => {
    const child = spawn(process.execPath, [script, String(issueNumber), 'analyze'], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', code => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

export async function runAnalyze({ issueNumber, cfg, deps = {} } = {}) {
  if (!issueNumber) throw new Error('analyze: issueNumber is required');
  if (!cfg) throw new Error('analyze: cfg is required');

  const fetchIssueContext   = deps.fetchIssueContext   || defaultFetchIssueContext;
  const fetchSubIssueStates = deps.fetchSubIssueStates || defaultFetchSubIssueStates;
  const resolveFieldValues  = deps.resolveFieldValues  || defaultResolveFieldValues;
  const admit               = deps.admit               || defaultAdmit;
  const moveState           = deps.moveState           || runMoveState;

  const ctx = await fetchIssueContext({ issueNumber, repo: cfg.repo });
  const fieldValues = await resolveFieldValues({ cfg, issueNumber });
  const sequence = fieldValues.sequence;

  const refusals = [];
  refusals.push(...checkRequiredFields(fieldValues, ctx.labels));
  refusals.push(...checkRequiredBodySections(ctx.body));

  refusals.push(...await checkWaveAdmission({
    parentEpicNumber: ctx.parentEpicNumber,
    sequence,
    repo: cfg.repo,
    projectId: cfg.projectId,
    admit,
  }));

  refusals.push(...await checkCascadeGrooming({
    isEpic: ctx.isEpic,
    epicNumber: issueNumber,
    repo: cfg.repo,
    projectId: cfg.projectId,
    fetchSubIssueStates,
  }));

  if (refusals.length > 0) {
    return { ok: false, blockers: refusals };
  }

  const code = await moveState(issueNumber);
  return code === 0 ? { ok: true, blockers: [] } : { ok: false, blockers: [{ kind: 'move-state', message: `move-state.mjs exited ${code}` }] };
}

// CLI entrypoint when invoked from task-tracker.mjs verb dispatch.
export async function verbAnalyze(rest, cfg) {
  const target = rest[0];
  const m = String(target || '').match(/^#?(\d+)$/);
  if (!m) {
    process.stderr.write('Usage: /task analyze #N\n');
    process.exit(1);
  }
  const issueNumber = Number(m[1]);

  if (SKIP_NETWORK) {
    // In offline mode there is nothing to gate against. Surface a clear
    // signal rather than silently passing.
    process.stderr.write('analyze: TT_SKIP_NETWORK set — refusing to run gate offline\n');
    process.exit(1);
  }

  let result;
  try {
    result = await runAnalyze({ issueNumber, cfg });
  } catch (err) {
    process.stderr.write(`analyze: ${err.message}\n`);
    process.exit(1);
  }

  if (result.ok) {
    process.stdout.write(`✓ Issue #${issueNumber} moved to: analyze\n`);
    return;
  }

  process.stderr.write(`\n⛔ Refusing to move #${issueNumber} to analyze:\n`);
  for (const b of result.blockers) {
    process.stderr.write(`   BLOCKED: ${b.message}\n`);
  }
  process.stderr.write('\nResolve each blocker, then retry.\n');
  process.exit(4);
}

// Allow direct invocation: `node scripts/task-tracker/verbs/analyze.mjs #N`
const _isMain = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMain) {
  const { loadConfig } = await import('../config.mjs');
  const cfg = loadConfig();
  await verbAnalyze(process.argv.slice(2), cfg);
}
