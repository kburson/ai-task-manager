// @story #2073 — selected provider bytes and durable ledger for actual hook executables.
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
export function installMeasuredHookProvider(root, snapshot, cfg, { drift = false } = {}) {
  const bin = path.join(root, '.tmp/2073-provider');
  mkdirSync(bin, { recursive: true });
  const state = structuredClone(snapshot.data);
  state.repository.nameWithOwner = cfg.repo;
  const enrich = (value, where = 'root') => {
    if (!value || typeof value !== 'object') return;
    if (value.field?.id) {
      value.field.name ??= value.field.id;
      value.id ??= 'VALUE:' + where;
      value.__typename ??= Object.hasOwn(value, 'number')
        ? 'ProjectV2ItemFieldNumberValue'
        : 'ProjectV2ItemFieldSingleSelectValue';
    }
    for (const [key, child] of Object.entries(value)) enrich(child, where + '.' + key);
  };
  enrich(state);
  if (drift)
    state.repository.issue.comments.nodes = Array.from({ length: 101 }, (_, index) => ({
      __typename: 'IssueComment',
      id: 'C' + index,
      databaseId: index + 1,
      body: 'Ordinary discussion',
      createdAt: '2026-10-20T00:00:00.000Z',
      updatedAt: '2026-10-20T00:00:00.000Z',
      url: 'https://example.invalid/' + index,
      author: { login: 'operator' },
      issue: { number: state.repository.issue.number, repository: { nameWithOwner: cfg.repo } },
    }));
  const stateFile = path.join(bin, 'state.json'),
    ledgerFile = path.join(bin, 'ledger.jsonl');
  writeFileSync(stateFile, JSON.stringify(state));
  writeFileSync(ledgerFile, '');
  mkdirSync(path.join(root, '.ai-task-manager'), { recursive: true });
  writeFileSync(path.join(root, '.ai-task-manager/task-tracker.json'), JSON.stringify(cfg));
  const source = `#!/usr/bin/env node
(async()=>{
const fs=require('node:fs');
const {createTrafficProvider}=await import(${JSON.stringify(new URL('./refinement-traffic-provider.mjs', import.meta.url).href)});
const shapes=await import(${JSON.stringify(new URL('../fixtures/refinement-traffic-shapes.mjs', import.meta.url).href)});
const prior=fs.readFileSync(${JSON.stringify(ledgerFile)},'utf8').trim().split('\\n').filter(Boolean).length;
const provider=createTrafficProvider({population:JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)},'utf8')),shapes:[{query:shapes.optimizedHookRoot,family:'hook-root'},{query:shapes.optimizedHookGraph,family:'hook-graph'},{query:shapes.optimizedHookFence,family:'hook-fence'},...shapes.optimizedHookContinuations]});
try{const result=await provider.pexec('gh',process.argv.slice(2),{input:process.argv.includes('--input')?fs.readFileSync(0,'utf8'):undefined});process.stdout.write(result.stdout);}
catch(error){process.stderr.write(error.message);process.exitCode=1;}
finally{if(${JSON.stringify(drift)}&&prior===0)provider.state.repository.issue.assignees.nodes=[{login:'replacement'}];fs.writeFileSync(${JSON.stringify(stateFile)},JSON.stringify(provider.state));fs.appendFileSync(${JSON.stringify(ledgerFile)},provider.ledger.map(entry=>JSON.stringify({...entry,index:prior+entry.index})).join('\\n')+'\\n');}
})();
`;
  writeFileSync(path.join(bin, 'gh'), source);
  chmodSync(path.join(bin, 'gh'), 0o755);
  return {
    ledgerFile,
    env: {
      ...process.env,
      PATH: bin + path.delimiter + process.env.PATH,
      AITM_GH_TEST_DOUBLE_BIN: bin,
      TT_SKIP_NETWORK: '0',
      AITM_GRAPHQL_USAGE: '0',
    },
  };
}
