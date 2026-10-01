// @story #1857
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRuntimeRootFixture } from '../../../helpers/runtime-root-fixture.mjs';
import { PROJECT_ROOT_ALIASES } from '../../../../task-tracker/lib/runtime-storage.mjs';
import { timingActorKey, timingActorMarker } from '../../../../task-tracker/lib/timing-actor.mjs';
const script = fileURLToPath(new URL('../../../../gh/log-issue-time.mjs', import.meta.url));
function run({ ambiguous = false, malformed = false } = {}) {
  const root = createRuntimeRootFixture('timing-cli-');
  try {
    const actor = timingActorMarker(timingActorKey({ provider: 'codex', sid: 'cli-fixture' }));
    const timing = [
      '## ⏱ Timing Log',
      '',
      '| Timestamp | Event | Active | Idle | Δ Words | Word Marker | Description | Full Words |',
      '|---|---|---|---|---|---|---|---|',
      '| 2026-10-01 00:00:00 +00:00 | develop:started | | | | 0 | phase | |',
      '| 2026-10-01 00:00:01 +00:00 | start | | | | 0 | legacy | |',
      '| 2026-10-01 00:01:00 +00:00 | pause | Unknown | Unknown | 12 | 112 | work | 1020 |' +
        actor +
        ' <!-- aitm-engagement:v1 start=1790812800000 end=1790812860000 active=unknown wstart=100 wend=112 fstart=1000 fend=1020 -->',
      ...(malformed ? ['| nonsense | update | 50 | | | 0 | lost work | |'] : []),
      '',
    ].join('\n');
    const nodes = [
      { id: 'IC_timing', body: timing },
      { id: 'IC_outcome', body: 'Quoted evidence: ' + JSON.stringify(timing) },
    ];
    if (ambiguous) nodes.push({ id: 'IC_duplicate', body: timing });
    const fields = ['Engaged', 'Session', 'Review', 'Plan'].map((name) => ({
      id: 'F_' + name,
      name,
    }));
    const initial =
      '<!-- aitm-fields: {"schema":1,"values":{"engagedTime":99,"sessionTime":99,"reviewTime":99,"planTime":99}} -->';
    writeFileSync(path.join(root, 'body.txt'), initial);
    writeFileSync(path.join(root, 'fixture.json'), JSON.stringify({ nodes, fields }));
    mkdirSync(path.join(root, '.ai-task-manager'));
    writeFileSync(
      path.join(root, '.ai-task-manager', 'task-tracker.json'),
      JSON.stringify({ repo: 'owner/repo', projectId: 'PVT_test' })
    );
    mkdirSync(path.join(root, 'bin'));
    const shim = [
      '#!/usr/bin/env node',
      'import fs from "node:fs";',
      'const args = process.argv.slice(2); const fixture = JSON.parse(fs.readFileSync("fixture.json", "utf8"));',
      'if (args[0] === "issue" && args[1] === "view") { const body = fs.readFileSync("body.txt", "utf8"); process.stdout.write(args.includes("-q") ? body : JSON.stringify({body})); }',
      'else if (args[0] === "issue" && args[1] === "edit") { fs.writeFileSync("body.txt", fs.readFileSync(0)); }',
      'else if (args[0] === "api" && args[1] === "graphql") {',
      ' if (args.some(a => a.startsWith("query="))) process.stdout.write(JSON.stringify({data:{repository:{nameWithOwner:"owner/repo",issue:{number:1857,comments:{nodes:fixture.nodes,totalCount:fixture.nodes.length,pageInfo:{hasNextPage:false,endCursor:null}}}}}}));',
      ' else { const input = JSON.parse(fs.readFileSync(0, "utf8"));',
      ' if (input.query.includes("projectItems")) process.stdout.write(JSON.stringify({data:{repository:{issue:{projectItems:{nodes:[{id:"PVTI_test",project:{id:"PVT_test"}}]}}},node:{fields:{nodes:fixture.fields}}}}));',
      ' else { fs.appendFileSync("writes.jsonl", JSON.stringify(input) + String.fromCharCode(10)); process.stdout.write(JSON.stringify({data:{}})); } }',
      '} else { console.error("Unexpected provider call"); process.exitCode=2; }',
      '',
    ].join('\n');
    writeFileSync(path.join(root, 'bin', 'gh'), shim, { mode: 0o755 });
    const env = {
      ...process.env,
      HOME: root,
      TT_SKIP_NETWORK: '1',
      PATH: path.join(root, 'bin') + path.delimiter + process.env.PATH,
      AITM_GH_TEST_DOUBLE_BIN: path.join(root, 'bin'),
    };
    for (const key of PROJECT_ROOT_ALIASES) delete env[key];
    const result = spawnSync(process.execPath, [script, '1857'], {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20000,
    });
    let writes = [];
    try {
      writes = readFileSync(path.join(root, 'writes.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse);
    } catch {
      /* no writes is expected for refusals */
    }
    return { ...result, body: readFileSync(path.join(root, 'body.txt'), 'utf8'), writes, initial };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('real timing CLI publishes Unknown from a unique canonical source without stale numeric fallback', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /AITM_TIMING_RESULT/);
  const structured = JSON.parse(
    result.stdout
      .split('\n')
      .find((line) => line.startsWith('AITM_TIMING_RESULT '))
      .slice(19)
  );
  assert.equal(structured.status, 'incomplete');
  assert.equal(structured.knownEngagedSec, 60);
  assert.equal(structured.values.engagedTime, null);
  assert.match(result.body, /"engagedTime":null/);
  assert.equal(result.writes.length, 4);
  for (const write of result.writes) assert.match(JSON.stringify(write), /Unknown/);
});
test('real timing CLI rejects ambiguous canonical source before any write', () => {
  const result = run({ ambiguous: true });
  assert.equal(result.status, 1);
  assert.equal(result.body, result.initial);
  assert.equal(result.writes.length, 0);
});
test('real timing CLI refuses malformed work rows rather than silently dropping them', () => {
  const result = run({ malformed: true });
  assert.equal(result.status, 1);
  assert.equal(result.body, result.initial);
  assert.equal(result.writes.length, 0);
});
