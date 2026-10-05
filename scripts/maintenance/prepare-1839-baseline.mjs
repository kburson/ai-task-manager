// @story #1839
// Repository-only preparation: explicit operator inputs, no remote mutations.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readUsage, resolveUsageRoot } from '../task-tracker/lib/graphql-usage/storage.mjs';
import { scanGraphqlSurfaces } from '../task-tracker/lib/graphql-usage/inventory.mjs';
const [configFile, pilotSession, outputDir] = process.argv.slice(2);
if (!configFile || !pilotSession || !outputDir)
  throw Error('Usage: node prepare-1839-baseline.mjs CONFIG PILOT_SESSION OUTPUT_DIR');
const cfg = JSON.parse(await fs.readFile(configFile, 'utf8'));
const hash = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');
const roots = await Promise.all(cfg.workers.map((w) => resolveUsageRoot(w.worktree)));
if (roots.some((r) => !r.available || r.commonRootId !== roots[0].commonRootId))
  throw Error('shared root unavailable');
const data = await readUsage(roots[0].root);
const pilot = data.observations.filter((r) => r.sessionId === hash(pilotSession));
if (
  pilot.length === 0 ||
  pilot.some(
    (r) =>
      !r.operation ||
      !r.repository ||
      (!r.issueNumber && !r.draftId) ||
      r.lifecycleState === 'unknown'
  )
)
  throw Error('preflight attribution incomplete');
const shim = scanGraphqlSurfaces({ root: cfg.source }).find(
  (r) => r.source === 'scripts/task-tracker/action-capture-bin/gh' && r.coverage === 'opaque'
);
if (!shim) throw Error('opaque interception site absent');
const declaration = {
  schema: 'aitm.graphql-usage.comparison/v1',
  commonRootId: roots[0].commonRootId,
  declaredAt: new Date().toISOString(),
  startedAt: cfg.startedAt,
  endedAt: cfg.endedAt,
  participants: cfg.workers.map((w, i) => ({
    worktreeId: roots[i].worktreeId,
    sessionId: hash(w.sessionId),
  })),
  groups: ['query', 'mutation'].map((kind) => ({
    id: 'native-' + kind + '-invocations',
    operations: [...new Set(pilot.filter((r) => r.kind === kind).map((r) => r.operation))].sort(),
    sites: [shim.source + ':' + shim.line],
    observationKind: 'opaque-cli-invocation',
    signal: 'opaque-invocation-volume',
  })),
  inventory: [shim],
};
if (Date.parse(declaration.declaredAt) >= Date.parse(declaration.startedAt))
  throw Error('missed declaration boundary');
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputDir + '/declaration.json', JSON.stringify(declaration, null, 2) + '\n', {
  flag: 'wx',
});
const files = [
  'scripts/task-tracker/lib/graphql-usage/collection.mjs',
  'scripts/task-tracker/lib/graphql-usage/identity.mjs',
  'scripts/task-tracker/lib/graphql-usage/storage.mjs',
  'scripts/task-tracker/lib/action-capture.mjs',
  'scripts/task-tracker/action-capture-bin/gh',
  'scripts/task-tracker/graphql-usage-launch.mjs',
];
const collectorFiles = Object.fromEntries(
  await Promise.all(files.map(async (p) => [p, hash(await fs.readFile(cfg.source + '/' + p))]))
);
const recipeFiles = Object.fromEntries(
  await Promise.all(
    ['scope', 'ac', 'origin', 'story', 'plan', 'vc'].map(async (name) => [
      name,
      hash(await fs.readFile(cfg.recipe + '/' + name + '.md')),
    ])
  )
);
const configurationHashes = await Promise.all(
  cfg.workers.map((w) => fs.readFile(w.worktree + '/.ai-task-manager/task-tracker.json').then(hash))
);
const preflight = {
  schema: 'aitm.graphql-usage.preflight/v1',
  declaredAt: declaration.declaredAt,
  declarationSha256: hash(JSON.stringify(declaration)),
  sourceCommit: cfg.sourceCommit,
  collectorVersion: 'v1',
  collectorFiles,
  configurationHashes,
  recipeId: hash(JSON.stringify(recipeFiles)),
  recipeFiles,
  workerSha256: hash(await fs.readFile(cfg.workerScript)),
  workloadKind: 'controlled',
  repetitionsPerWorktree: cfg.repetitions,
  spacingSeconds: cfg.spacingSeconds,
  plannedWorkflows: cfg.repetitions * cfg.workers.length,
  commandSequence: [
    'create-issue --shape solo --label documentation --priority p2',
    'start --role agent',
    'refine --size S --estimate 1 --priority p2 --rank repetition',
    'refine --size S --estimate 1 --priority p2 --rank repetition',
    'plan',
    'stop',
  ],
  controlledParameters: {
    shape: 'solo',
    label: 'documentation',
    priority: 'p2',
    size: 'S',
    estimateHours: 1,
  },
  population:
    'Exactly the two predeclared scratch launcher sessions; all smoke and pilot sessions are outside the interval.',
  comparableSignal:
    'Opaque native CLI invocation volume; no request-count or total-point inference.',
  pilot: { observations: pilot.length, unknownAttribution: 0 },
  exclusions:
    'Preflight, smoke, aborted launches, production repository activity, other sessions, external tools and hidden CLI requests are excluded from the declared sample.',
};
await fs.writeFile(outputDir + '/preflight.json', JSON.stringify(preflight, null, 2) + '\n', {
  flag: 'wx',
});
console.log(
  JSON.stringify({
    declaredAt: preflight.declaredAt,
    declarationSha256: preflight.declarationSha256,
    participants: cfg.workers.length,
    candidates: declaration.groups.map((g) => ({ id: g.id, operations: g.operations.length })),
    startedAt: cfg.startedAt,
    endedAt: cfg.endedAt,
  })
);
