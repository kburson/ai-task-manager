// @story #1049
// cspell:ignore notnull
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

import { openProjectDatabase, runMigrations } from '../src/sqlite/open.mjs';
import { applyMigration001 } from '../src/sqlite/migrations/001-leases.mjs';
import { SqliteWorkLeaseStore } from '../src/sqlite/work-lease-store.mjs';
import { canonicalRequestDigest } from '../src/lease/schema.mjs';
import { assertLeaseStoreConformance } from './fixtures/lease-conformance.mjs';

const NOW = '2026-07-30T12:00:00.000Z';
const DISPLAY_PATH = '/workspace/1049';
const PATH_HASH = createHash('sha256').update(DISPLAY_PATH).digest('hex');
const CONTENDER_FIXTURE = fileURLToPath(
  new URL('./fixtures/sqlite-contender.mjs', import.meta.url)
);

function holder(overrides = {}) {
  return {
    principalKind: 'worker',
    provider: 'codex',
    agentRunId: 'run-1',
    sessionId: 'session-1',
    hostId: 'host-1',
    worktreeId: 'wt:v1:one',
    pathHash: PATH_HASH,
    branch: 'feature/child/1049',
    pid: 123,
    ...overrides,
  };
}

function acquire(overrides = {}) {
  const requestHolder = overrides.holder ?? holder();
  const issueId = overrides.issueId ?? '1049';
  return {
    projectId: 'project-1',
    issueId,
    mode: 'write',
    idempotencyKey: 'acquire-1',
    requestedAt: NOW,
    ttlMs: 900_000,
    holder: requestHolder,
    binding: {
      sessionId: requestHolder.sessionId,
      issueId,
      worktreeId: requestHolder.worktreeId,
      displayPath: DISPLAY_PATH,
    },
    ...overrides,
  };
}

function bindingFor(requestHolder = holder(), issueId = '1049', displayPath = DISPLAY_PATH) {
  return {
    sessionId: requestHolder.sessionId,
    issueId,
    worktreeId: requestHolder.worktreeId,
    displayPath,
  };
}

function insertV1Lease(db, { leaseId = 'lease-v1', issueId = '1049', token = 1 } = {}) {
  db.prepare(
    `INSERT INTO work_leases(
       lease_id, project_id, issue_id, mode, fencing_token, state,
       principal_kind, provider, agent_run_id, session_id, host_id,
       worktree_id, path_hash, branch, pid, acquired_at, heartbeat_at,
       expires_at, audit_json
     ) VALUES (?, 'project-1', ?, 'write', ?, 'active', 'worker', 'codex',
       'run-1', 'shared-session', 'host-1', ?, 'hash', 'feature/1049', 123,
       ?, ?, ?, '{}')`
  ).run(leaseId, issueId, token, `wt:${leaseId}`, NOW, NOW, '2026-07-30T12:15:00.000Z');
}

test('migration 002 upgrades v1 bindings atomically and permits one session to retain multiple leases', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigration001(db, () => new Date(NOW));
  insertV1Lease(db);
  db.prepare(
    `INSERT INTO work_bindings(
       project_id, session_id, issue_id, worktree_id, lease_id, fencing_token, observed_at
     ) VALUES ('project-1', 'shared-session', '1049', 'wt:lease-v1', 'lease-v1', 1, ?)`
  ).run(NOW);
  db.prepare(
    `INSERT INTO work_lease_events(
       event_id, project_id, lease_id, event_type, operation, idempotency_key,
       request_digest, response_json, error_json, status_code, actor_json,
       reason, prior_token, new_token, canonical_json, created_at
     ) VALUES ('event-v1', 'project-1', 'lease-v1', 'acquired', 'acquire',
       'event-key', 'digest', '{}', NULL, 201, '{}', NULL, NULL, 1, '{}', ?)`
  ).run(NOW);
  const leaseSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'work_leases'")
    .get().sql;
  const eventSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'work_lease_events'")
    .get().sql;
  const leaseRows = JSON.stringify(db.prepare('SELECT * FROM work_leases ORDER BY lease_id').all());
  const eventRows = JSON.stringify(
    db.prepare('SELECT * FROM work_lease_events ORDER BY event_id').all()
  );

  assert.throws(
    () =>
      runMigrations(db, {
        now: () => new Date(NOW),
        migration002Hooks: {
          afterCopy: () => {
            throw new Error('injected migration failure');
          },
        },
      }),
    /injected migration failure/
  );
  assert.equal(db.prepare('SELECT 1 FROM schema_migrations WHERE version = 2').get(), undefined);
  assert.deepEqual(
    db
      .prepare('PRAGMA table_info(work_bindings)')
      .all()
      .map((column) => column.name),
    [
      'project_id',
      'session_id',
      'issue_id',
      'worktree_id',
      'lease_id',
      'fencing_token',
      'observed_at',
    ]
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM work_bindings').get().count, 1);

  runMigrations(db, { now: () => new Date(NOW) });
  const columns = db.prepare('PRAGMA table_info(work_bindings)').all();
  assert.deepEqual(
    columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name),
    ['project_id', 'lease_id']
  );
  assert.equal(columns.find((column) => column.name === 'display_path').notnull, 0);
  assert.equal(db.prepare('SELECT display_path FROM work_bindings').get().display_path, null);
  assert.equal(
    db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'work_leases'").get()
      .sql,
    leaseSchema
  );
  assert.equal(
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'work_lease_events'")
      .get().sql,
    eventSchema
  );
  assert.equal(
    JSON.stringify(db.prepare('SELECT * FROM work_leases ORDER BY lease_id').all()),
    leaseRows
  );
  assert.equal(
    JSON.stringify(db.prepare('SELECT * FROM work_lease_events ORDER BY event_id').all()),
    eventRows
  );
  const bindingIndexes = db
    .prepare(
      "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'work_bindings' AND sql IS NOT NULL ORDER BY name"
    )
    .all();
  assert.deepEqual(
    bindingIndexes.map((row) => row.name),
    ['work_bindings_issue', 'work_bindings_session', 'work_bindings_worktree']
  );
  for (const row of bindingIndexes) assert.match(row.sql, /\(project_id,/);

  insertV1Lease(db, { leaseId: 'lease-v2', issueId: '1050', token: 2 });
  db.prepare(
    `INSERT INTO work_bindings(
       project_id, lease_id, session_id, issue_id, worktree_id, display_path,
       fencing_token, observed_at
     ) VALUES ('project-1', 'lease-v2', 'shared-session', '1050', 'wt:lease-v2',
       '/workspace/two', 2, ?)`
  ).run(NOW);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM work_bindings').get().count, 2);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  const versions = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version')
    .all()
    .map((row) => row.version);
  assert.deepEqual(versions, [1, 2]);
  runMigrations(db, { now: () => new Date(NOW) });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM work_bindings').get().count, 2);
  const fresh = openProjectDatabase({ databasePath: ':memory:', now: () => new Date(NOW) });
  const schemaSql = (database) =>
    database
      .prepare(
        "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = 'work_bindings' AND sql IS NOT NULL ORDER BY type, name"
      )
      .all()
      .map((row) => [row.type, row.name, row.sql]);
  assert.deepEqual(schemaSql(fresh), schemaSql(db));
  fresh.close();
  db.close();
});

test('open configures durable schema, WAL, foreign keys, and busy timeout', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-open-'));
  try {
    const db = openProjectDatabase({ databasePath: path.join(dir, 'project.sqlite') });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    for (const table of [
      'schema_migrations',
      'ledger_metadata',
      'work_leases',
      'work_lease_events',
      'work_bindings',
      'lease_fences',
    ]) {
      assert.ok(tables.includes(table), `missing table ${table}`);
    }
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.equal(db.prepare('PRAGMA busy_timeout').get().timeout, 5000);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('SQLite adapter satisfies the shared lease conformance suite', async () => {
  const stores = [];
  try {
    await assertLeaseStoreConformance({
      assert,
      createStore: () => {
        const db = openProjectDatabase({ databasePath: ':memory:' });
        const store = new SqliteWorkLeaseStore({ db, isHolderLive: () => false });
        stores.push(store);
        return store;
      },
    });
  } finally {
    for (const store of stores) store.close();
  }
});

test('project observation is sorted, correlated, and fails closed on a missing binding', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  let sequence = 0;
  const store = new SqliteWorkLeaseStore({ db, uuid: () => `id-${++sequence}` });
  const second = store.acquire(
    acquire({
      issueId: '1050',
      idempotencyKey: 'project-second',
      holder: holder({ worktreeId: 'wt:v1:two' }),
    })
  );
  const first = store.acquire(acquire({ idempotencyKey: 'project-first' }));
  const observed = store.observe({ projectId: 'project-1' });
  assert.deepEqual(
    observed.leases.map((lease) => lease.leaseId),
    [...observed.leases.map((lease) => lease.leaseId)].sort()
  );
  assert.deepEqual(
    observed.bindings.map((binding) => binding.leaseId),
    observed.leases.map((lease) => lease.leaseId)
  );
  db.prepare('DELETE FROM work_bindings WHERE lease_id = ?').run(second.leaseId);
  assert.throws(
    () => store.observe({ projectId: 'project-1' }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.ok(first.leaseId);
  store.close();
});

test('mutation replay reads the exact recorded outcome without changing authority rows', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  const store = new SqliteWorkLeaseStore({ db, uuid: () => 'replay-lease' });
  const request = acquire({ idempotencyKey: 'replay-acquire' });
  const lease = store.acquire(request);
  const selector = {
    projectId: request.projectId,
    operation: 'acquire',
    idempotencyKey: request.idempotencyKey,
    requestDigest: canonicalRequestDigest(request),
  };
  const before = {
    events: db.prepare('SELECT * FROM work_lease_events').all(),
    leases: db.prepare('SELECT * FROM work_leases').all(),
    bindings: db.prepare('SELECT * FROM work_bindings').all(),
    fences: db.prepare('SELECT * FROM lease_fences').all(),
  };
  assert.deepEqual(store.replayMutation(selector), {
    selector,
    outcome: 'committed',
    statusCode: 201,
    result: lease,
  });
  for (const mismatch of [
    { ...selector, operation: 'renew' },
    { ...selector, requestDigest: 'b'.repeat(64) },
  ]) {
    assert.throws(
      () => store.replayMutation(mismatch),
      (error) => error.code === 'idempotency-conflict'
    );
  }
  const absentSelector = { ...selector, idempotencyKey: 'missing' };
  assert.deepEqual(store.replayMutation(absentSelector), {
    selector: absentSelector,
    outcome: 'absent',
  });
  assert.deepEqual(
    {
      events: db.prepare('SELECT * FROM work_lease_events').all(),
      leases: db.prepare('SELECT * FROM work_leases').all(),
      bindings: db.prepare('SELECT * FROM work_bindings').all(),
      fences: db.prepare('SELECT * FROM lease_fences').all(),
    },
    before
  );
  store.close();
});

test('mutation replay fails closed on corrupt rows without mutating authority', () => {
  const corruptSwitch = (mutate) => (db) => {
    const sourceLease = JSON.parse(
      db.prepare('SELECT response_json FROM work_lease_events').get().response_json
    );
    const result = {
      lease: {
        ...sourceLease,
        issueId: '1050',
        leaseId: 'switch-target-lease',
        fencingToken: '2',
      },
      transition: {
        transitionId: 'transition-1',
        fromIssueId: '1049',
        fromLeaseId: sourceLease.leaseId,
        fromToken: sourceLease.fencingToken,
        toIssueId: '1050',
      },
    };
    mutate(result);
    db.prepare(
      `UPDATE work_lease_events
          SET operation = 'switch',
              response_json = ?,
              status_code = 200`
    ).run(JSON.stringify(result));
  };
  const corruptions = [
    {
      name: 'unknown stored operation',
      apply: (db) => db.prepare("UPDATE work_lease_events SET operation = 'unknown'").run(),
    },
    {
      name: 'public switch operation stored internally',
      apply: (db) => db.prepare("UPDATE work_lease_events SET operation = 'switchLease'").run(),
    },
    {
      name: 'forged result object',
      apply: (db) => db.prepare("UPDATE work_lease_events SET response_json = '{}'").run(),
    },
    {
      name: 'invalid success status',
      apply: (db) => db.prepare('UPDATE work_lease_events SET status_code = 299').run(),
    },
    {
      name: 'malformed lease',
      apply: (db) =>
        db
          .prepare(
            "UPDATE work_lease_events SET response_json = json_set(response_json, '$.holder', json('{}'))"
          )
          .run(),
    },
    {
      name: 'cross-project lease',
      apply: (db) =>
        db
          .prepare(
            "UPDATE work_lease_events SET response_json = json_set(response_json, '$.projectId', 'other-project')"
          )
          .run(),
    },
    {
      name: 'wrong valid state for acquire',
      apply: (db) =>
        db
          .prepare(
            "UPDATE work_lease_events SET response_json = json_set(response_json, '$.state', 'paused')"
          )
          .run(),
    },
    {
      name: 'wrong valid principal for acquire',
      apply: (db) =>
        db
          .prepare(
            "UPDATE work_lease_events SET response_json = json_set(response_json, '$.holder.principalKind', 'integration')"
          )
          .run(),
    },
    {
      name: 'bad lease chronology',
      apply: (db) =>
        db
          .prepare(
            "UPDATE work_lease_events SET response_json = json_set(response_json, '$.heartbeatAt', response_json ->> '$.expiresAt')"
          )
          .run(),
    },
    {
      name: 'switch target issue contradiction',
      operation: 'switchLease',
      apply: corruptSwitch((result) => {
        result.transition.toIssueId = '1051';
      }),
    },
    {
      name: 'switch lease identity contradiction',
      operation: 'switchLease',
      apply: corruptSwitch((result) => {
        result.lease.leaseId = result.transition.fromLeaseId;
      }),
    },
    {
      name: 'switch fencing contradiction',
      operation: 'switchLease',
      apply: corruptSwitch((result) => {
        result.lease.fencingToken = result.transition.fromToken;
      }),
    },
    {
      name: 'rejected wrong status',
      apply: (db) =>
        db
          .prepare(
            `UPDATE work_lease_events
                SET response_json = NULL,
                    error_json = ?,
                    status_code = 412`
          )
          .run(
            JSON.stringify({
              code: 'idempotency-conflict',
              message: 'request conflict',
              details: {},
            })
          ),
    },
    {
      name: 'rejected extra key',
      apply: (db) =>
        db
          .prepare(
            `UPDATE work_lease_events
                SET response_json = NULL,
                    error_json = ?,
                    status_code = 409`
          )
          .run(
            JSON.stringify({
              code: 'idempotency-conflict',
              message: 'request conflict',
              details: {},
              retryable: false,
            })
          ),
    },
    {
      name: 'rejected malformed details',
      apply: (db) =>
        db
          .prepare(
            `UPDATE work_lease_events
                SET response_json = NULL,
                    error_json = ?,
                    status_code = 409`
          )
          .run(
            JSON.stringify({
              code: 'idempotency-conflict',
              message: 'request conflict',
              details: [],
            })
          ),
    },
    {
      name: 'rejected password detail',
      apply: (db) =>
        db
          .prepare(
            `UPDATE work_lease_events
                SET response_json = NULL,
                    error_json = ?,
                    status_code = 409`
          )
          .run(
            JSON.stringify({
              code: 'idempotency-conflict',
              message: 'request conflict',
              details: { password: 'do-not-return' },
            })
          ),
    },
    {
      name: 'rejected authorization detail',
      apply: (db) =>
        db
          .prepare(
            `UPDATE work_lease_events
                SET response_json = NULL,
                    error_json = ?,
                    status_code = 409`
          )
          .run(
            JSON.stringify({
              code: 'idempotency-conflict',
              message: 'request conflict',
              details: { nested: { authorization: 'Bearer secret' } },
            })
          ),
    },
  ];

  for (const corruption of corruptions) {
    const db = openProjectDatabase({ databasePath: ':memory:' });
    const store = new SqliteWorkLeaseStore({ db, uuid: () => 'replay-corrupt-lease' });
    const request = acquire({ idempotencyKey: 'replay-corrupt' });
    store.acquire(request);
    const selector = {
      projectId: request.projectId,
      operation: corruption.operation ?? 'acquire',
      idempotencyKey: request.idempotencyKey,
      requestDigest: canonicalRequestDigest(request),
    };
    corruption.apply(db);
    const before = {
      events: db.prepare('SELECT * FROM work_lease_events').all(),
      leases: db.prepare('SELECT * FROM work_leases').all(),
      bindings: db.prepare('SELECT * FROM work_bindings').all(),
      fences: db.prepare('SELECT * FROM lease_fences').all(),
    };

    assert.throws(
      () => store.replayMutation(selector),
      (error) => error.code === 'authority-unavailable',
      corruption.name
    );
    assert.deepEqual(
      {
        events: db.prepare('SELECT * FROM work_lease_events').all(),
        leases: db.prepare('SELECT * FROM work_leases').all(),
        bindings: db.prepare('SELECT * FROM work_bindings').all(),
        fences: db.prepare('SELECT * FROM lease_fences').all(),
      },
      before,
      corruption.name
    );
    store.close();
  }
});

test('issue and worktree observations fail unavailable for every corrupt binding invariant', () => {
  const corruptions = [
    (db, lease) => db.prepare('DELETE FROM work_bindings WHERE lease_id = ?').run(lease.leaseId),
    (db, lease) =>
      db
        .prepare('UPDATE work_bindings SET fencing_token = fencing_token + 1 WHERE lease_id = ?')
        .run(lease.leaseId),
    (db, lease) =>
      db
        .prepare("UPDATE work_bindings SET project_id = 'moved-project' WHERE lease_id = ?")
        .run(lease.leaseId),
    (db, lease) =>
      db
        .prepare(
          "UPDATE work_bindings SET display_path = '/workspace/hash-mismatch' WHERE lease_id = ?"
        )
        .run(lease.leaseId),
    (db, lease) => {
      db.prepare('UPDATE work_bindings SET display_path = NULL WHERE lease_id = ?').run(
        lease.leaseId
      );
      db.prepare(
        "UPDATE work_leases SET path_hash = 'not-a-canonical-hash' WHERE lease_id = ?"
      ).run(lease.leaseId);
    },
  ];
  for (const corrupt of corruptions) {
    for (const selector of [
      { projectId: 'project-1', issueId: '1049' },
      { projectId: 'project-1', worktreeId: 'wt:v1:one' },
    ]) {
      const db = openProjectDatabase({ databasePath: ':memory:' });
      const store = new SqliteWorkLeaseStore({ db });
      const lease = store.acquire(acquire());
      corrupt(db, lease);
      assert.throws(
        () => store.observe(selector),
        (error) => error.code === 'authority-unavailable'
      );
      store.close();
    }
  }
});

test('internal binding failure does not poison an exact release replay after repair', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  const store = new SqliteWorkLeaseStore({ db });
  const lease = store.acquire(acquire());
  const release = {
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: 'release-after-binding-repair',
    releasedAt: '2026-07-30T12:03:00.000Z',
    reason: 'done',
    holder: lease.holder,
    binding: bindingFor(lease.holder, lease.issueId),
  };
  db.prepare('DELETE FROM work_bindings WHERE lease_id = ?').run(lease.leaseId);
  assert.throws(
    () => store.release(release),
    (error) => error.code === 'authority-unavailable'
  );
  db.prepare(
    `INSERT INTO work_bindings(
       project_id, lease_id, session_id, issue_id, worktree_id, display_path,
       fencing_token, observed_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lease.projectId,
    lease.leaseId,
    lease.holder.sessionId,
    lease.issueId,
    lease.holder.worktreeId,
    DISPLAY_PATH,
    lease.fencingToken,
    NOW
  );
  assert.equal(store.release(release).state, 'released');
  store.close();
});

test('trusted renew backfills a v1 null path while wrong path or pid cannot mutate authority', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  const store = new SqliteWorkLeaseStore({ db });
  const lease = store.acquire(acquire());
  db.prepare('UPDATE work_bindings SET display_path = NULL WHERE lease_id = ?').run(lease.leaseId);
  assert.equal(store.observe({ projectId: 'project-1' }).bindings[0].displayPath, null);

  const wrongPath = '/workspace/wrong';
  assert.throws(
    () =>
      store.renew({
        projectId: lease.projectId,
        leaseId: lease.leaseId,
        fencingToken: lease.fencingToken,
        idempotencyKey: 'wrong-path',
        requestedAt: '2026-07-30T12:01:00.000Z',
        ttlMs: 900_000,
        holder: { ...lease.holder, pathHash: createHash('sha256').update(wrongPath).digest('hex') },
        binding: { ...acquire().binding, displayPath: wrongPath },
      }),
    (error) => error.code === 'lease-not-held'
  );
  assert.throws(
    () =>
      store.verify({
        projectId: lease.projectId,
        leaseId: lease.leaseId,
        fencingToken: lease.fencingToken,
        operation: 'task-bind',
        verifiedAt: NOW,
        holder: { ...lease.holder, pid: lease.holder.pid + 1 },
        binding: acquire().binding,
      }),
    (error) => error.code === 'lease-not-held'
  );
  assert.throws(
    () =>
      store.verify({
        projectId: lease.projectId,
        leaseId: lease.leaseId,
        fencingToken: lease.fencingToken,
        operation: 'task-bind',
        verifiedAt: NOW,
        holder: lease.holder,
        binding: { ...acquire().binding, issueId: '1050' },
      }),
    (error) => error.code === 'lease-not-held'
  );
  assert.equal(db.prepare('SELECT display_path FROM work_bindings').get().display_path, null);

  const renewed = store.renew({
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: 'trusted-backfill',
    requestedAt: '2026-07-30T12:02:00.000Z',
    ttlMs: 900_000,
    holder: lease.holder,
    binding: acquire().binding,
  });
  assert.equal(store.observe({ projectId: 'project-1' }).bindings[0].displayPath, DISPLAY_PATH);
  store.release({
    projectId: lease.projectId,
    leaseId: lease.leaseId,
    fencingToken: lease.fencingToken,
    idempotencyKey: 'release-after-backfill',
    releasedAt: '2026-07-30T12:03:00.000Z',
    reason: 'done',
    holder: renewed.holder,
    binding: acquire().binding,
  });
  store.close();
});

test('linked connections serialize one winner and persist idempotent responses', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-contention-'));
  const databasePath = path.join(dir, 'project.sqlite');
  try {
    const first = new SqliteWorkLeaseStore({ db: openProjectDatabase({ databasePath }) });
    const second = new SqliteWorkLeaseStore({ db: openProjectDatabase({ databasePath }) });
    const lease = first.acquire(acquire());
    assert.throws(
      () =>
        second.acquire(
          acquire({
            idempotencyKey: 'contended',
            holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
          })
        ),
      (error) => error.code === 'lease-contended'
    );
    first.release({
      projectId: 'project-1',
      leaseId: lease.leaseId,
      fencingToken: lease.fencingToken,
      idempotencyKey: 'release-1',
      releasedAt: NOW,
      reason: 'done',
      holder: lease.holder,
      binding: bindingFor(lease.holder, lease.issueId),
    });
    assert.throws(
      () =>
        second.acquire(
          acquire({
            idempotencyKey: 'contended',
            holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
          })
        ),
      (error) => error.code === 'lease-contended',
      'terminal contention replay survives state change and connection boundary'
    );
    first.close();
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runContender(databasePath, request) {
  return new Promise((resolve, reject) => {
    const child = fork(CONTENDER_FIXTURE, {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('message', resolve);
    child.once('exit', (code) => {
      if (code && code !== 0) {
        reject(new Error(`contender exited ${code}: ${stderr}`));
      }
    });
    child.send({ databasePath, request });
  });
}

test('separate processes contend through one database with one sanitized loser', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'aitm-sqlite-process-contention-'));
  const databasePath = path.join(dir, 'project.sqlite');
  try {
    const results = await Promise.all([
      runContender(databasePath, acquire({ idempotencyKey: 'process-one' })),
      runContender(
        databasePath,
        acquire({
          idempotencyKey: 'process-two',
          holder: holder({
            agentRunId: 'run-2',
            sessionId: 'session-2',
            worktreeId: 'wt:v1:two',
            pathHash: PATH_HASH,
            pid: 456,
          }),
        })
      ),
    ]);
    const winners = results.filter((result) => result.ok);
    const losers = results.filter((result) => !result.ok);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.equal(losers[0].error.code, 'lease-contended');
    assert.equal('stack' in losers[0].error, false);
    assert.equal(JSON.stringify(losers[0]).includes(databasePath), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('paused leases retain both unique constraints and live holders resist takeover', () => {
  const db = openProjectDatabase({ databasePath: ':memory:' });
  const store = new SqliteWorkLeaseStore({ db, isHolderLive: () => true });
  const lease = store.acquire(acquire());
  db.prepare("UPDATE work_leases SET state = 'paused' WHERE lease_id = ?").run(lease.leaseId);
  assert.throws(
    () =>
      store.acquire(
        acquire({
          idempotencyKey: 'paused-issue',
          holder: holder({ agentRunId: 'run-2', sessionId: 'session-2', pid: 456 }),
        })
      ),
    (error) => error.code === 'lease-contended'
  );
  assert.throws(
    () =>
      store.acquire(
        acquire({
          issueId: '1051',
          idempotencyKey: 'paused-worktree',
          holder: holder({ agentRunId: 'run-3', sessionId: 'session-3', pid: 789 }),
        })
      ),
    (error) => error.code === 'worktree-contended'
  );
  assert.throws(
    () =>
      store.takeover({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: lease.leaseId,
        expectedToken: lease.fencingToken,
        expectedHolder: lease.holder,
        expectedBinding: bindingFor(lease.holder, lease.issueId),
        idempotencyKey: 'live-takeover',
        observedAt: NOW,
        reason: 'operator asked',
        requester: holder({ agentRunId: 'run-4', sessionId: 'session-4', pid: 1000 }),
        requesterBinding: bindingFor(
          holder({ agentRunId: 'run-4', sessionId: 'session-4', pid: 1000 }),
          lease.issueId
        ),
        ttlMs: 900_000,
        evidence: {
          kind: 'operator-attestation',
          hostId: 'host-1',
          pid: 123,
          checkedAt: NOW,
          detailsHash: 'attestation',
        },
      }),
    (error) => error.code === 'holder-live'
  );
  store.close();
});

test('takeover fails closed when liveness authority is unavailable', () => {
  const store = new SqliteWorkLeaseStore({
    db: openProjectDatabase({ databasePath: ':memory:' }),
  });
  const lease = store.acquire(acquire());
  assert.throws(
    () =>
      store.takeover({
        projectId: 'project-1',
        issueId: '1049',
        expectedLeaseId: lease.leaseId,
        expectedToken: lease.fencingToken,
        expectedHolder: lease.holder,
        expectedBinding: bindingFor(lease.holder, lease.issueId),
        idempotencyKey: 'unverified-expiry',
        observedAt: '2026-07-30T12:30:00.000Z',
        reason: 'TTL elapsed',
        requester: holder({
          agentRunId: 'run-2',
          sessionId: 'session-2',
          worktreeId: 'wt:v1:two',
          pathHash: PATH_HASH,
          pid: 456,
        }),
        requesterBinding: bindingFor(
          holder({
            agentRunId: 'run-2',
            sessionId: 'session-2',
            worktreeId: 'wt:v1:two',
            pathHash: PATH_HASH,
            pid: 456,
          }),
          lease.issueId
        ),
        ttlMs: 900_000,
        evidence: {
          kind: 'remote-expired',
          hostId: 'host-1',
          pid: 123,
          checkedAt: '2026-07-30T12:30:00.000Z',
          detailsHash: 'expiry-only',
        },
      }),
    (error) => error.code === 'authority-unavailable'
  );
  assert.equal(store.observe({ projectId: 'project-1', issueId: '1049' }).leaseId, lease.leaseId);
  store.close();
});
