export const VERSION = 1;

export const SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lease_fences (
  project_id TEXT PRIMARY KEY,
  current_token INTEGER NOT NULL DEFAULT 0 CHECK (current_token >= 0)
);

CREATE TABLE IF NOT EXISTS work_leases (
  lease_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode = 'write'),
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  state TEXT NOT NULL CHECK (state IN ('active', 'paused', 'released', 'expired', 'superseded')),
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('worker', 'integration')),
  provider TEXT NOT NULL,
  agent_run_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  host_id TEXT NOT NULL,
  worktree_id TEXT NOT NULL,
  path_hash TEXT NOT NULL,
  branch TEXT NOT NULL,
  pid INTEGER NOT NULL,
  acquired_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  audit_json TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS work_leases_retained_issue
  ON work_leases(project_id, issue_id)
  WHERE state IN ('active', 'paused');

CREATE UNIQUE INDEX IF NOT EXISTS work_leases_retained_worktree
  ON work_leases(project_id, worktree_id)
  WHERE state IN ('active', 'paused');

CREATE TABLE IF NOT EXISTS work_lease_events (
  event_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  lease_id TEXT,
  event_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  response_json TEXT,
  error_json TEXT,
  status_code INTEGER NOT NULL,
  actor_json TEXT,
  reason TEXT,
  prior_token INTEGER,
  new_token INTEGER,
  canonical_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS work_lease_events_lease
  ON work_lease_events(project_id, lease_id, created_at);

CREATE TABLE IF NOT EXISTS work_bindings (
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  issue_id TEXT NOT NULL,
  worktree_id TEXT NOT NULL,
  lease_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (project_id, session_id),
  FOREIGN KEY (lease_id) REFERENCES work_leases(lease_id)
);
`;

export function applyMigration001(db, now = () => new Date()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(VERSION);
  if (applied) return false;
  db.exec(SQL);
  db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
    VERSION,
    now().toISOString()
  );
  return true;
}
