// @story #1988 — preserve scripted provider failures and model verified body writes.
import { writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
export function installStatefulGhBody({ binDir, transport }) {
  const original = path.join(binDir, 'gh-body-transport');
  writeFileSync(original, transport);
  chmodSync(original, 0o755);
  const script = `#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const bin=process.env.AITM_GH_TEST_DOUBLE_BIN,file=path.join(bin,'body.json'),args=process.argv.slice(2);
const isView=args[0]==='issue'&&args[1]==='view',isEdit=args[0]==='issue'&&args[1]==='edit';
if(isView&&fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file,'utf8'));process.stdout.write(args.includes('-q')?value.body:JSON.stringify(value));}
else{
 const i=args.indexOf('--body-file'),input=isEdit&&args[i+1]==='-'?fs.readFileSync(0,'utf8'):undefined;
 const result=spawnSync(path.join(bin,'gh-body-transport'),args,{encoding:'utf8',input});
 if(result.status!==0){process.stderr.write(result.stderr??'transport failed');process.exit(result.status??1);}
 if(isView){const value=JSON.parse(result.stdout);fs.writeFileSync(file,JSON.stringify(value));process.stdout.write(args.includes('-q')?value.body:result.stdout);}
 else{if(isEdit&&i>=0)fs.writeFileSync(file,JSON.stringify({body:input??fs.readFileSync(args[i+1],'utf8')}));process.stdout.write(result.stdout??'');}
}
`;
  writeFileSync(path.join(binDir, 'gh'), script);
  chmodSync(path.join(binDir, 'gh'), 0o755);
}
