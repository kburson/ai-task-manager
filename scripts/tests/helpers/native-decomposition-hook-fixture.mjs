// @story #1990 — real collector/projection with complete controlled provider bytes.
import { currentUnitAuthority } from '../unit/task-tracker/lib/decomposition-unit-admission-fixture.mjs';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
export async function nativeHookAuthority(issue) {
  const current = await currentUnitAuthority({
    issue,
    repository: 'owner/repo',
    body: '## AITM Progress Markers\n<!-- aitm-deep-dive-posted ts="2026-10-11T12:00:00Z" -->\n<!-- aitm-deep-dive-complete ts="2026-10-11T12:00:00Z" -->\n',
  });
  current.authority.values.forecast = {
    estimate: null,
    size: null,
    recordId: null,
    payloadHash: null,
    proposals: [],
    observedProjections: [
      { size: 'M', estimate: 7 },
      { size: 'M', estimate: 7 },
    ],
  };
  await current.runtime.refresh(current.subject);
  return {
    ...current,
    body: current.authority.body,
    cfg: { ...current.cfg, kanbanFieldId: 'STATUS', fieldIds: { estimate: 'EST', size: 'SIZE' } },
  };
}
export function hookProviderResponse(current, state = 'develop', user = 'tester') {
  const item = {
    id: current.subject.projectItemId,
    project: { id: current.subject.projectId },
    fieldValueByName: { name: state },
    fieldValues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  };
  item.fieldValues.nodes.push(
    { number: 7, field: { id: 'EST', name: 'Estimate' } },
    { name: 'M', field: { id: 'SIZE', name: 'Size' } },
    { name: state, field: { id: 'STATUS', name: 'Status' } }
  );
  const issue = {
    id: 'ISSUE_' + current.subject.issue,
    number: current.subject.issue,
    body: current.body,
    assignees: { nodes: [{ login: user }] },
    comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
    projectItems: { nodes: [item], pageInfo: { hasNextPage: false, endCursor: null } },
  };
  return { data: { viewer: { login: user }, repository: { issue } } };
}
export function installHookProvider(root, current, state, environment = process.env) {
  const binary = path.join(root, '.tmp/hook-provider');
  mkdirSync(binary, { recursive: true });
  mkdirSync(path.join(root, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(root, '.ai-task-manager/task-tracker.json'), JSON.stringify(current.cfg));
  const snapshot = hookProviderResponse(current, state ?? null);
  const script =
    '#!/usr/bin/env node\nprocess.stdout.write(' +
    JSON.stringify(JSON.stringify(snapshot)) +
    ');\n';
  writeFileSync(path.join(binary, 'gh'), script);
  chmodSync(path.join(binary, 'gh'), 0o755);
  return {
    ...environment,
    PATH: binary + path.delimiter + environment.PATH,
    AITM_GH_TEST_DOUBLE_BIN: binary,
  };
}

export function runNativeHookFixture({ cwd, payload, stdinRaw, env, guardPath }) {
  const result = spawnSync('node', [guardPath], {
    cwd,
    env,
    input: stdinRaw !== undefined ? stdinRaw : JSON.stringify(payload),
    encoding: 'utf8',
  });
  let decision = null;
  if (result.stdout)
    try {
      decision = JSON.parse(result.stdout);
    } catch {
      /* Preserve malformed output for assertions. */
    }
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, decision };
}
