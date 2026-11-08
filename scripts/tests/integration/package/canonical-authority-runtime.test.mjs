// @story #2145
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRuntimeRootFixture } from '../../helpers/runtime-root-fixture.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const run = (command, args, cwd, extra = {}) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', timeout: 60000, ...extra });

test('packed scoped authority runtime and hook execute against an unchanged separate subject', async () => {
  const root = createRuntimeRootFixture('canonical-authority-package-');
  try {
    const metadata = JSON.parse(
      run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root], project)
    );
    const packed = (Array.isArray(metadata) ? metadata : Object.values(metadata))[0];
    const archive = path.join(root, packed.filename);
    assert.equal(
      'sha512-' + createHash('sha512').update(readFileSync(archive)).digest('base64'),
      packed.integrity
    );
    const subject = path.join(root, 'subject');
    mkdirSync(subject);
    run('git', ['init', '-q'], subject);
    writeFileSync(
      path.join(subject, 'package.json'),
      JSON.stringify({ name: 'unchanged-subject', version: '1.0.0', private: true, type: 'module' })
    );
    writeFileSync(path.join(subject, '.gitignore'), 'node_modules/\n.scratch/\n.tmp/\n');
    writeFileSync(
      path.join(subject, 'approved-source.txt'),
      'This subject source must remain unchanged.\n'
    );
    for (const file of [
      'scripts/task-tracker/task-tracker.mjs',
      'scripts/gh/update-event-fields.mjs',
    ]) {
      mkdirSync(path.dirname(path.join(subject, file)), { recursive: true });
      writeFileSync(
        path.join(subject, file),
        'throw new Error("retained old runtime must not own the new operator tail");\n'
      );
    }
    run('git', ['add', '.'], subject);
    run(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'subject baseline',
      ],
      subject
    );
    const head = run('git', ['rev-parse', 'HEAD'], subject).trim();
    assert.notEqual(head, run('git', ['rev-parse', 'HEAD'], project).trim());
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-save',
        '--package-lock=false',
        '--offline',
        '--no-audit',
        '--no-fund',
        archive,
      ],
      subject
    );
    const packageRoot = path.join(subject, 'node_modules/@kburson/ai-task-manager');
    for (const file of [
      'bin/aitm.mjs',
      'scripts/task-tracker/verbs/workflow-exception.mjs',
      'scripts/task-tracker/lib/workflow-policy/codex-host-source.mjs',
      'scripts/task-tracker/lib/workflow-policy/exception-record.mjs',
    ]) {
      assert.ok(
        readFileSync(path.join(packageRoot, file)).equals(readFileSync(path.join(project, file)))
      );
    }
    // Keep an old unscoped self-link present, as in the unchanged #2169 checkout.
    symlinkSync(subject, path.join(subject, 'node_modules/ai-task-manager'), 'dir');
    const scratch = path.join(subject, '.scratch');
    mkdirSync(scratch);
    const bin = path.join(scratch, 'bin');
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'codex'),
      `#!/usr/bin/env node
import readline from 'node:readline';
for await(const line of readline.createInterface({input:process.stdin})) {
 const x=JSON.parse(line); if(!x.id)continue;
 let result;
 if(x.method==='initialize')result={};
 else if(x.method==='thread/read')result={thread:{id:x.params.threadId,sessionId:process.env.CODEX_THREAD_ID || process.env.AI_TASK_MANAGER_SESSION_ID || 'default-session'}};
 else if(x.method==='thread/items/list')result={data:[{turnId:x.params.turnId,item:{type:'userMessage',id:'approval',content:[{type:'text',text:'Authorize bounded review.\\nPreserve history.'}]}}],nextCursor:null};
 else throw Error('Unexpected mutating host method');
 process.stdout.write(JSON.stringify({id:x.id,result})+'\\n');
}
`,
      { mode: 0o755 }
    );
    const moduleUrl = pathToFileURL(path.join(packageRoot, 'scripts/task-tracker')).href;
    const probe = path.join(scratch, 'probe.mjs');
    writeFileSync(
      probe,
      `import assert from 'node:assert/strict';
import {createWorkflowExceptionRuntime} from ${JSON.stringify(moduleUrl + '/verbs/workflow-exception.mjs')};
import {currentSessionId} from ${JSON.stringify(moduleUrl + '/word-counter.mjs')};
import {hashAuthorizationStatement} from ${JSON.stringify(moduleUrl + '/lib/workflow-policy/authority-resolver.mjs')};
import {createWorkflowExceptionEnvelope,validateWorkflowExceptionEnvelope,toEvaluatorRecord} from ${JSON.stringify(moduleUrl + '/lib/workflow-policy/exception-record.mjs')};
import {endTaskTracking,syncEventFields} from ${JSON.stringify(moduleUrl + '/lib/move-state/cache-unpark.mjs')};
const statement='Authorize bounded review.\\nPreserve history.';
const runtime=createWorkflowExceptionRuntime({cfg:{repo:'owner/repo'},projectDir:process.cwd()},{deliver:{}});
const source={schema:'aitm.authorization-source/v2',adapter:'codex-app-server/v1',threadId:'fixture-thread',turnId:'fixture-turn',sessionId:currentSessionId(),messageId:'approval',statementHash:hashAuthorizationStatement(statement)};
const resolved=await runtime.resolveAuthority({source});assert.equal(resolved.status,'verified');
const record=createWorkflowExceptionEnvelope({repository:'owner/repo',issue:2145,exceptionId:'test-only',revision:1,status:'active',scopeIdentity:'sha256:'+'a'.repeat(64),requirementIds:['review.semantic-resident'],constraints:[],reason:'A synthetic package test, never live authorization.',authorization:resolved.authority,expiresAt:'2026-11-09T23:59:59.000Z',operationId:'sha256:'+'b'.repeat(64),createdAt:'2026-11-08T03:00:00.000Z',recordId:'01M2H000000000000000000001',grantId:'01M2H000000000000000000090'});
validateWorkflowExceptionEnvelope(JSON.parse(JSON.stringify(record)));
assert.equal(record.payload.approvalEvidence.statement,statement);assert.ok(toEvaluatorRecord(record));
const tailCalls=[];const pexec=async(command,args)=>{tailCalls.push(args);return{stdout:''};};
const tail={__dir:${JSON.stringify(path.join(packageRoot, 'scripts/gh'))},stateArg:'done',issueArg:'2145',SKIP_NETWORK:false,pexec};
endTaskTracking(tail);await syncEventFields(tail);
assert.equal(tailCalls[0][0],${JSON.stringify(path.join(packageRoot, 'scripts/task-tracker/task-tracker.mjs'))});
assert.equal(tailCalls[1][0],${JSON.stringify(path.join(packageRoot, 'scripts/gh/update-event-fields.mjs'))});
console.log(JSON.stringify({status:'verified',cwd:process.cwd(),origin:resolved.authority.origin}));
`
    );
    const coverage = path.join(scratch, 'coverage');
    mkdirSync(coverage);
    const observed = JSON.parse(
      run(process.execPath, [probe], subject, {
        env: {
          ...process.env,
          PATH: bin + path.delimiter + process.env.PATH,
          NODE_V8_COVERAGE: coverage,
        },
      })
    );
    assert.deepEqual(observed, { status: 'verified', cwd: subject, origin: 'codex-app-server' });
    const env = { ...process.env, NODE_V8_COVERAGE: coverage };
    const help = run(
      process.execPath,
      [path.join(packageRoot, 'bin/aitm.mjs'), 'workflow-exception', 'help'],
      subject,
      { env }
    );
    assert.match(help, /workflow-exception/);
    const { guardBootstrapCommand } = await import(
      pathToFileURL(path.join(packageRoot, 'scripts/task-tracker/lib/guard-entrypoint.mjs'))
    );
    const hook = spawnSync('/bin/sh', ['-c', guardBootstrapCommand('bash-guard')], {
      cwd: subject,
      encoding: 'utf8',
      timeout: 30000,
      env,
      input: JSON.stringify({
        cwd: subject,
        tool_name: 'Bash',
        tool_input: { command: 'git status --short' },
      }),
    });
    assert.equal(hook.status, 0, hook.stderr);
    const loaded = readdirSync(coverage).flatMap((file) =>
      JSON.parse(readFileSync(path.join(coverage, file), 'utf8')).result.map((row) => row.url)
    );
    for (const file of [
      'bin/aitm.mjs',
      'scripts/task-tracker/verbs/workflow-exception.mjs',
      'scripts/task-tracker/bash-guard.mjs',
    ])
      assert.ok(loaded.includes(pathToFileURL(path.join(packageRoot, file)).href), file);
    assert.equal(run('git', ['rev-parse', 'HEAD'], subject).trim(), head);
    assert.equal(run('git', ['status', '--porcelain'], subject).trim(), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
