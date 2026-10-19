// @story #2006
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { snapshotFor } from './decomposition-hook.cases.mjs';
import { collectHookDecompositionSnapshot } from '../../../../task-tracker/lib/decomposition-hook-authority.mjs';
import { replaceDecompositionRecords } from '../../../../task-tracker/lib/decomposition-records.mjs';

export async function completeEpicSnapshot(f) {
  const git = (args) => {
    const r = spawnSync('git', args, { cwd: f.native.root, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git(['add', '-f', 'docs/plan.md']);
  git([
    '-c',
    'user.name=Fixture operator',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'Fixture accepted plan',
  ]);
  const commit = git(['rev-parse', 'HEAD']);
  const node = f.response.data.repository.issue;
  node.body = node.body.replaceAll('1'.repeat(40), commit);
  for (const child of node.subIssues.nodes)
    child.body = child.body.replaceAll('1'.repeat(40), commit);
  node.projectItems.nodes[0].fieldValues.nodes.push({
    name: 'Develop',
    field: { id: 'STATUS', name: 'Status' },
  });
  const fresh = await collectHookDecompositionSnapshot({
    issue: 107,
    cfg: f.cfg,
    projectDir: f.native.root,
    deps: { graphql: async () => f.response },
  });
  assert.equal(
    fresh.current.input.epicReadiness.completion,
    true,
    JSON.stringify(fresh.current.assessment.blockers)
  );
  node.body = replaceDecompositionRecords(node.body, {
    assessment: fresh.current.assessment,
    publication: null,
  });
  return f.response;
}

// Only the provider transport is doubled; the executable native hook is real.
export function activityVerdict(
  f,
  payload,
  { snapshot = snapshotFor(f, 25), unavailable = false } = {}
) {
  const binary = path.join(f.native.root, '.tmp/review-provider');
  mkdirSync(binary, { recursive: true });
  const provider = path.join(binary, 'gh');
  writeFileSync(
    provider,
    unavailable
      ? '#!/usr/bin/env node\nprocess.stderr.write("429 provider unavailable");process.exit(1);\n'
      : '#!/usr/bin/env node\nprocess.stdout.write(' +
          JSON.stringify(JSON.stringify(snapshot)) +
          ');\n'
  );
  chmodSync(provider, 0o755);
  writeFileSync(
    path.join(f.native.root, '.ai-task-manager/task-tracker.json'),
    JSON.stringify(f.cfg)
  );
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../../../task-tracker/activity-guard.mjs', import.meta.url))],
    {
      cwd: f.native.root,
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: binary + path.delimiter + process.env.PATH,
        AITM_GH_TEST_DOUBLE_BIN: binary,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : { decision: 'allow' };
}
export function patchPayload(f, targets) {
  return {
    cwd: f.native.root,
    session_id: f.native.sid,
    tool_name: 'apply_patch',
    tool_input: {
      patch:
        '*** Begin Patch\n' +
        targets.map((target) => '*** Add File: ' + target + '\n+fixture\n').join('') +
        '*** End Patch',
    },
  };
}
export function buildPayload(f, command) {
  return {
    cwd: f.native.root,
    session_id: f.native.sid,
    tool_name: 'Bash',
    tool_input: { command },
  };
}
