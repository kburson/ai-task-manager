// @story #1839
// Disposable smoke helper: invoke only through the explicitly configured live test.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {
  prepareUsageEnv,
  observeGraphqlHttp,
} from '../../../task-tracker/lib/graphql-usage/collection.mjs';
import { resolveUsageRoot, readUsage } from '../../../task-tracker/lib/graphql-usage/storage.mjs';
const [repo, issueArg, output] = process.argv.slice(2);
const issueNumber = Number(issueArg),
  [owner, name] = repo.split('/');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(issueNumber) || issueNumber < 1)
  throw Error('explicit scratch target required');
const env = await prepareUsageEnv({
  env: { ...process.env, AITM_GRAPHQL_USAGE: '1' },
  launchRoute: 'measurement-launcher',
});
const token = execFileSync(env.AITM_CAPTURE_REAL_GH, ['auth', 'token'], {
  encoding: 'utf8',
}).trim();
const context = { repository: repo, issueNumber, lifecycleState: 'plan', stateSource: 'argument' };
const call = (query, variables) =>
  observeGraphqlHttp(
    'https://api.github.com/graphql',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    },
    { env, context }
  );
const result = await call(
  'query BaselineSmokeQuery($owner:String!,$name:String!,$issueNumber:Int!){repository(owner:$owner,name:$name){issue(number:$issueNumber){id title}} rateLimit{cost}}',
  { owner, name, issueNumber }
);
if (result.errors) throw Error('smoke query failed');
const original = result.data.repository.issue;
const mutation =
  'mutation BaselineSmokeMutation($id:ID!,$title:String!){updateIssue(input:{id:$id,title:$title}){issue{id title}}}';
let cleanup = false;
try {
  const changed = await call(mutation, { id: original.id, title: original.title + ' [smoke]' });
  if (changed.errors || changed.data?.updateIssue.issue.title !== original.title + ' [smoke]')
    throw Error('smoke mutation failed');
} finally {
  const restored = await call(mutation, { id: original.id, title: original.title });
  cleanup = !restored.errors && restored.data?.updateIssue.issue.title === original.title;
}
const data = await readUsage((await resolveUsageRoot(process.cwd())).root);
const rows = data.observations.filter(
  (r) => r.sessionId === JSON.parse(env.AITM_GRAPHQL_USAGE_CONTEXT).sessionId
);
const queryRow = rows.find((r) => r.operation === 'BaselineSmokeQuery');
const mutationRows = rows.filter((r) => r.operation === 'BaselineSmokeMutation');
const proof = {
  schema: 'aitm.graphql-usage.smoke/v1',
  repository: repo,
  issueNumber,
  sameResponseQueryCost: result.data.rateLimit.cost,
  recordedQueryCost: queryRow?.pointCost,
  queryCostMatches: queryRow?.pointCost === result.data.rateLimit.cost,
  mutationCostUnavailable:
    mutationRows.length === 2 &&
    mutationRows.every(
      (r) => r.pointCost === null && r.costUnknownReason === 'mutation-cost-unavailable'
    ),
  cleanupSucceeded: cleanup,
  observations: rows,
};
await fs.writeFile(output, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ ...proof, observations: proof.observations.length }));
if (!proof.queryCostMatches || !proof.mutationCostUnavailable || !cleanup) process.exitCode = 1;
