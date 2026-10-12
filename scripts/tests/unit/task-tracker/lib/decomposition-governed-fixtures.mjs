// @story #1991 — real collector and stateful provider ports for recovery tests.
import { initializeFixtureActor } from '../../../helpers/fixture-actor.mjs';
initializeFixtureActor(import.meta.url, 'codex');
import { currentUnitAuthority } from './decomposition-unit-admission-fixture.mjs';
import { fixture, observed, freshUnitDir, hash } from './decomposition-authority-fixtures.mjs';
import { saveState } from '../../../../task-tracker/state.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
async function setup(hours = 25, options = {}) {
  const f = await currentUnitAuthority({ body: '## AITM Progress Markers\n', hours, ...options });
  return { ...f, deps: { subject: f.subject, runtime: f.runtime, projectDir: f.projectDir } };
}
export async function governedFixture(hours = 25, options = {}) {
  const f = await setup(hours, options);
  const content =
    '### Task 1: One recovery boundary\nRun: ' +
    String.fromCharCode(96) +
    'node verify.mjs' +
    String.fromCharCode(96) +
    '\n';
  mkdirSync(path.join(f.projectDir, 'docs'), { recursive: true });
  writeFileSync(path.join(f.projectDir, 'docs/plan.md'), content);
  f.authority.values.plan = {
    path: 'docs/plan.md',
    commit: '1'.repeat(40),
    section: null,
    digest: hash(content),
    availability: 'available',
    content,
    references: null,
  };
  f.authority.deps.readPlanAtCommit = async () => content;
  f.authority.body = f.authority.body.replace(
    '## AITM Progress Markers',
    '## Plan Metadata\n- **Source-plan**: docs/plan.md\n- **Source-plan-commit**: ' +
      '1'.repeat(40) +
      '\n\n## AITM Progress Markers'
  );
  f.deps.readOwnership = async () => ({
    state: 'develop',
    assignees: ['operator'],
    currentUser: 'operator',
  });
  await f.runtime.refresh(f.subject);
  const statePath = path.join(f.projectDir, 'state.json');
  saveState({ active: String(f.subject.issue), entryStartTs: '2026-10-12T18:00:00Z' }, statePath);
  var title = 'One recovery boundary',
    labels = [];
  f.ctxMetadata = {
    readIssue: async () => ({ title, labels, body: f.authority.body }),
    writeVisible: async (input) => {
      title = input.title ?? title;
      labels.push(...input.labelsToAdd);
    },
  };
  const pexec = async (bin, args, options) => {
    if (bin !== 'gh') throw new Error('unexpected transport');
    if (args[1] === 'view')
      return {
        stdout: args.includes('title,body,labels')
          ? JSON.stringify({ title, labels, body: f.authority.body })
          : f.authority.body,
      };
    if (args[1] === 'edit' && !args.includes('--body-file')) {
      if (args.includes('--title')) title = args[args.indexOf('--title') + 1];
      if (args.includes('--add-label')) labels.push(args[args.indexOf('--add-label') + 1]);
      return { stdout: '' };
    }
    if (args[1] === 'edit' && args.includes('--body-file')) {
      f.authority.body = options.input;
      f.authority.writes.push(options.input);
      return { stdout: '' };
    }
    throw new Error('unexpected gh operation');
  };
  const ctx = {
    pexec,
    cfg: f.cfg,
    statePath,
    rest: [String(f.subject.issue), 'audit'],
    deps: { ...f.authority.deps, decomposition: f.deps, metadata: f.ctxMetadata },
    projectDir: f.projectDir,
  };
  delete ctx.deps.readIssue;
  return { ...f, ctx };
}

import { formatIssueFieldDb } from '../../../../task-tracker/issue-field-db.mjs';
export async function currentGuardContext(ctx) {
  let body = ctx.body.replace(
    /<!-- aitm-fields:[^]*?-->/g,
    formatIssueFieldDb({ estimate: 4, size: 'M' })
  );
  if (!/^## AITM Progress Markers$/m.test(body))
    body +=
      '\n\n## AITM Progress Markers\n' +
      (body.includes('aitm-fields:') ? '' : formatIssueFieldDb({ estimate: 4, size: 'M' }));
  body = body.replace(/^## Scope\s*$/m, '## Scope\n\nOne bounded guard parity fixture.');
  if (!/^## Acceptance Criteria$/m.test(body))
    body = body.replace(
      '## AITM Progress Markers',
      '## Acceptance Criteria\n- [ ] Preserve current guard behavior.\n\n## AITM Progress Markers'
    );
  const f = await currentUnitAuthority({
    body,
    issue: Number(ctx.issueNumber),
    repository: ctx.cfg.repo,
    hours: 4,
  });
  f.authority.body = f.authority.body.replace(
    /<!-- aitm-fields:[^]*?-->/g,
    formatIssueFieldDb({ estimate: 4, size: 'XS' })
  );
  f.authority.values.project.size = 'XS';
  f.authority.values.forecast.size = 'XS';
  await f.runtime.refresh(f.subject);
  return {
    ...ctx,
    cfg: { ...ctx.cfg, ...f.cfg },
    body: f.authority.body,
    deps: {
      ...ctx.deps,
      decomposition: { subject: f.subject, runtime: f.runtime, projectDir: f.projectDir },
    },
  };
}

import { createDecompositionRuntime } from '../../../../task-tracker/lib/decomposition-authority.mjs';
export async function preparePromoteAuthority(deps, issueNumber, cfg) {
  if (!deps?.decomposition?.projectValuesForIssue) return;
  const raw = (await deps.pexec('gh', ['issue', 'view', String(issueNumber)])).stdout;
  if (!/aitm-last-known-state: plan/.test(raw) && !/^## Deep-Dive Analysis/m.test(raw)) return;
  const values = await deps.decomposition.projectValuesForIssue();
  const f = fixture(values.estimate);
  f.values.project = { ...f.values.project, ...values, projectId: cfg.projectId };
  f.values.forecast = { ...f.values.forecast, estimate: values.estimate, size: values.size };
  f.body = raw.replace(/<!-- aitm-fields:[^]*?-->/g, formatIssueFieldDb(values));
  if (!/^## User Story$/m.test(f.body))
    f.body =
      '## User Story\nAs a release operator\nI want to stop partial publication\nSo that consumers receive complete releases\n\n' +
      f.body;
  if (!/^## Scope$/m.test(f.body))
    f.body += '\n## Scope\nExercise one bounded promotion boundary.\n';
  if (!/^## Acceptance Criteria$/m.test(f.body))
    f.body += '\n## Acceptance Criteria\n- [ ] Preserve the current promotion boundary.\n';
  const subject = {
    repository: cfg.repo,
    issue: Number(issueNumber),
    projectId: cfg.projectId,
    projectItemId: 'PVTI_a',
  };
  f.deps.readIssue = async () => observed({ number: Number(issueNumber), body: f.body });
  f.deps.readBackIssue = f.deps.readIssue;
  const root = freshUnitDir('promote-current-');
  const runtime = createDecompositionRuntime({ cfg, projectDir: root, deps: f.deps });
  await runtime.refresh(subject);
  const mutate = deps.mutateIssueBody;
  deps.mutateIssueBody = async (input) =>
    mutate({
      ...input,
      mutate: () => {
        f.body = input.mutate(f.body);
        return f.body;
      },
    });
  const fetch = deps.fetchIssueBody;
  deps.fetchIssueBody = async (...args) => ({ ...(await fetch(...args)), body: f.body });
  deps.decomposition = { subject, runtime, projectDir: root };
}
