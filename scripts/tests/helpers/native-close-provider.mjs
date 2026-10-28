// @story #2100
import { writeFileSync } from 'node:fs';
import path from 'node:path';
export function installProvider(bin, dataPath) {
  writeFileSync(
    path.join(bin, 'gh'),
    `#!${process.execPath}
import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync(${JSON.stringify(dataPath)},'utf8'));
const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(path.join(bin, 'calls.log'))},JSON.stringify(a)+'\\n');
let out;
if(a[0]==='issue'&&a[1]==='view'&&a.includes('blockedBy'))out={blockedBy:{nodes:[],totalCount:0,pageInfo:{hasNextPage:false}}};
else if(a[0]==='issue'&&a[1]==='view')out=a.includes('.comments')?d.comments:a.includes('.body')?d.body:{body:d.body,comments:d.comments};
else if(a.includes('graphql')&&a.some(x=>x.includes('pullRequest(number:')))out={data:{repository:{pullRequest:{headRefOid:d.pr.headRefOid,commits:{totalCount:d.evidence.length,nodes:d.evidence.map(c=>({commit:{oid:c.oid,messageHeadline:c.message,message:c.message,tree:{oid:c.tree},parents:{totalCount:c.parents.length,nodes:c.parents.map(oid=>({oid})),pageInfo:{hasNextPage:false}}}})),pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else if(a.includes('graphql'))out={data:{repository:{issue:{id:'I_fixture',number:d.issue,body:d.body,parent:null,projectItems:{nodes:[{id:'PVTI_fixture',project:{id:'PVT_native'},fieldValueByName:{name:'Review'},fieldValues:{nodes:[],pageInfo:{hasNextPage:false}}}],pageInfo:{hasNextPage:false,endCursor:null}},subIssues:{nodes:[],totalCount:0,pageInfo:{hasNextPage:false}},comments:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else if(a[0]==='pr'&&a[1]==='list')out=[{...d.pr,mergeCommit:{oid:d.merged}}];
else if(a[0]==='pr'&&a[1]==='view')out={...d.pr,mergeCommit:{oid:d.merged}};
else if(a.some(x=>x.endsWith('pulls')))out=[[{number:d.pr.number}]];
else if(a.some(x=>x.includes('sub_issues')))out=[[]];
else if(a.some(x=>x.includes('comments')))out=[d.comments];
else if(a.some(x=>x.includes('dependencies')))out=[];
else if(a.some(x=>x.includes('git/ref/heads')))out={ref:'refs/heads/feature/1878'};
else {process.stderr.write('unexpected provider '+JSON.stringify(a));process.exit(2);}
process.stdout.write(typeof out==='string'?out:JSON.stringify(out));
`,
    { mode: 0o755 }
  );
}
