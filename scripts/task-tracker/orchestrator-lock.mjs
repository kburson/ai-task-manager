#!/usr/bin/env node
// @story #1857
// Durable orchestrator permission. Expiry disables capability; it never grants
// takeover or foreign release. A legacy ownerless record needs explicit
// operator disposition before adoption and is preserved on refusal.
import { rmSync } from 'node:fs';
import { findMainWorktreePath } from './fleet-registry.mjs';
import { orchestratorLockPath } from './paths.mjs';
import { currentSessionId, aiAppName } from './word-counter.mjs';
import { timingActorKey } from './lib/timing-actor.mjs';
import { readRuntimeJsonRecord, writeRuntimeJsonRecord, withRuntimeRecordLockSync } from './lib/runtime-writer.mjs';

const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000;
const argv = process.argv.slice(2);
const verb = argv.shift();
const usage = 'usage: orchestrator-lock.mjs <acquire <epic> [--ttl-hours <h>] | release | status>';

try {
  if (!['acquire', 'release', 'status'].includes(verb)) throw new Error(usage);
  let ttlMs = DEFAULT_TTL_MS;
  let epic;
  if (verb === 'acquire') {
    epic = argv.shift();
    if (!epic || !/^#?[1-9][0-9]*$/.test(epic))
      throw new Error('usage: orchestrator-lock.mjs acquire <epic> [--ttl-hours <h>]');
    if (argv.length) {
      if (argv.length !== 2 || argv[0] !== '--ttl-hours') throw new Error(usage);
      ttlMs = Math.round(Number(argv[1]) * 3600 * 1000);
      if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('invalid --ttl-hours');
    }
  } else if (argv.length) throw new Error(usage);
  const p = orchestratorLockPath(findMainWorktreePath(process.cwd()));
  const result = withRuntimeRecordLockSync(p, () => {
    const existing = readRuntimeJsonRecord(p, { optional: true });
    if (verb === 'status')
      return existing ? JSON.stringify({ held: true, expired: Date.now() - Date.parse(existing.startedAt) > existing.ttlMs, ...existing }) : JSON.stringify({ held: false });
    const identity = { provider: aiAppName(), sid: currentSessionId() };
    const actor = timingActorKey(identity);
    if (verb === 'acquire') {
      if (existing) throw new Error('lock held for ' + existing.epic + '; explicit owner release or recovery is required, including expired records');
      writeRuntimeJsonRecord(p, { schema: 'aitm.orchestrator-lock/v1', epic, startedAt: new Date().toISOString(), ttlMs, owner: { ...identity, actor } });
      return 'acquired orchestrator lock for ' + epic + ' (ttl=' + ttlMs + 'ms)';
    }
    if (existing) {
      if (existing.schema !== 'aitm.orchestrator-lock/v1' || existing.owner.actor !== actor)
        throw new Error('ORCHESTRATOR_OWNER_MISMATCH: refusing foreign or ownerless lock release');
      rmSync(p);
    }
    return 'orchestrator lock released';
  });
  process.stdout.write(result + '\n');
} catch (error) {
  process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n');
  process.exitCode = 1;
}
