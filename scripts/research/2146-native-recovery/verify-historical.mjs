// @story #2146
// Narrow derivative of pinned verify-v2.mjs; originals remain immutable archived data.
import path from 'node:path';
import assert from 'node:assert/strict';
// prettier-ignore
export function runHistoricalAssertions(context, mode) {
const {fs,evidence,ownerRoot,sha,readJson,execFileSync}=context;
assert.ok(['report','plan'].includes(mode));
const j=p=>readJson(path.join(evidence,p));const m=j('manifest-v2.json');
assert.equal(m.sourceHead,'2fd89e1103a0ee1976e0e1a1210c2d4e1bb57de0');assert.equal(m.sourceStatus,'');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:ownerRoot,encoding:'utf8'}).trim(),m.sourceHead);
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:ownerRoot,encoding:'utf8'}).trim(),'');
for(const [p,h] of Object.entries(m.artifacts))assert.equal(sha(fs.readFileSync(path.join(evidence,p))),h,'artifact changed '+p);
for(const [p,h] of Object.entries(m.sources))assert.equal(sha(fs.readFileSync(path.join(ownerRoot,p))),h,'owned source changed '+p);
const matrix=j('matrix-v2.json');assert.equal(matrix.cases.length,16);assert.equal(new Set(matrix.cases.map(c=>c.id)).size,16);
for(const c of matrix.cases){assert.ok(c.reason);assert.ok(c.status);for(const p of c.evidence)assert.ok(fs.existsSync(path.join(evidence,p)));}
let publicRuns=0;
for(const p of Object.keys(m.artifacts).filter(p=>p.endsWith('/summary.json'))){const s=j(p);const dir=path.dirname(p),identity=j(dir+'/execution-identity.json');assert.equal(sha(fs.readFileSync(path.join(evidence,dir,'harness.mjs'))),identity.harnessSha256);assert.equal(sha(fs.readFileSync(path.join(evidence,dir,'provider-preload.mjs'))),identity.providerSha256);assert.equal(s.dependenciesUnchanged,true);if(s.blocked)assert.equal(s.cliStatus,null);publicRuns++;}
const base=j('qualified-baseline-results.json');const dir=r=>context.resolveHistoricalOutput(r.out);const record=(r,which)=>j(dir(r)+'/'+which+'.json');
const a=record(base.draft,'before'),b=record(base.draft,'after');assert.equal(a.branch,'');assert.equal(b.branch,'codex/2146-draft');assert.equal(base.draft.cliStatus,1);assert.deepEqual(a.provider,b.provider);assert.deepEqual(a.records,Object.fromEntries(Object.entries(b.records).filter(([k])=>!k.includes('draft-branch'))));
const t1=record(base.terminal,'before'),t2=record(base.terminal,'after');assert.deepEqual(t1.records,t2.records);assert.deepEqual(t1.provider.comments,t2.provider.comments);assert.match(t2.provider.body,/sid="default-session"/);for(const line of t1.provider.body.split('\n').filter(x=>x.includes('aitm-worktree-location')))assert.ok(t2.provider.body.includes(line));
assert.deepEqual(j(dir(base.terminal)+'/runtime-before.json'),j(dir(base.terminal)+'/runtime-after.json'));
const beforeRuntime=j(dir(base.draft)+'/runtime-before.json'),afterRuntime=j(dir(base.draft)+'/runtime-after.json');for(const side of Object.keys(beforeRuntime)){for(const [p,bytes] of Object.entries(beforeRuntime[side].files))assert.equal(afterRuntime[side].files[p],bytes);}
const active=s=>JSON.parse(Object.entries(s.records).find(([k])=>k.endsWith('active-task.json'))[1]);const prev=j('prevention-results.json');const first=record(prev.find(r=>r.cliStatus===0&&r.id.endsWith('-start')),'after'),last=record(prev.at(-1),'after');for(const k of ['entryStartTs','bindingGenerationId','boundAt','wordsAtStart'])assert.equal(active(first)[k],active(last)[k]);
for(const r of j('write-drift-results.json').filter(r=>r.case.startsWith('normalize-'))){assert.equal(r.result.cliStatus,0);assert.ok(!record(r.result,'after').provider.body.includes('aitm-last-known-state'));}
for(const r of j('normalization-candidate-results.json'))assert.equal(r.cliStatus,1);
const fresh=j('fresh-readback-result.json');assert.equal(fresh.cliStatus,1);assert.match(j(dir(fresh)+'/cli.json').stderr,/authoritative readback mismatch/);assert.ok(record(fresh,'after').provider.body.includes('aitm-last-known-state'));assert.deepEqual(record(fresh,'before').records,record(fresh,'after').records);
const reflog=j('renewal-reflog/runs/2026-11-03T23-47-53-011Z-renewal-reflog/summary.json');assert.equal(reflog.cliStatus,0);assert.equal(reflog.blocked,null);assert.equal(matrix.cases.find(c=>c.id==='ref-reflog-drift').status,'unexpected-acceptance');
for(const r of j('activation-probes-baseline03.json')){assert.ok(r.blocked);assert.equal(r.cliStatus,null);}
for(const r of j('transport-qualification03.json').results)assert.equal(r.status,r.expected);
for(const r of j('baseline-prevention-assertions.json').results)assert.equal(r.status,1);
for(const p of Object.keys(m.artifacts).filter(p=>p.endsWith('provider.json.ledger.jsonl'))){const rows=fs.readFileSync(path.join(evidence,p),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);for(const r of rows.filter(r=>r.kind==='git'&&r.args.some(a=>['push','fetch','pull','clone','ls-remote'].includes(a)))){assert.ok(p.startsWith('qualification'));assert.ok(rows.some(x=>x.pid===r.pid&&x.kind==='refusal'&&x.text==='remote Git forbidden in fixture'));}}
const report=fs.readFileSync(evidence+'/report-v2.md','utf8');for(const s of ['not proof that the Codex native host','expected-refusal assertion exits 1','Not implemented or executed','Unknown','partial effect'])assert.ok(report.includes(s),s);
if(mode==='plan'){const plan=fs.readFileSync(evidence+'/2026-11-03-2146-native-recovery-defect-plan.md','utf8');for(const s of ['NOT authorization to implement','LocationAuthority','InitialBranchState','RecoveryManifest','generationRecorded: string | null','both historical location markers verbatim','no executable activation step','Owner choices','Still unexecuted','Future execution sequence'])assert.ok(plan.includes(s),s);}
return {issue:2146,artifact:mode,integrity:'verified',executionRecords:publicRuns,matrixCases:16,productOutcome:'mixed; includes expected-refusal failure',exactRecovery:'UNIMPLEMENTED',nativeHostActivation:'UNPROVEN',historicalReconstructionClean:true};
}
