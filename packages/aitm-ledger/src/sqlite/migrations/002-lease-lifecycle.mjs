export const VERSION = 2;

export function applyMigration002(db, now = () => new Date(), hooks = {}) {
  const applied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(VERSION);
  if (applied) return false;

  db.exec(`
    ALTER TABLE work_bindings RENAME TO work_bindings_v1;

    CREATE TABLE work_bindings (
      project_id TEXT NOT NULL,
      lease_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      worktree_id TEXT NOT NULL,
      display_path TEXT,
      fencing_token INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      PRIMARY KEY (project_id, lease_id),
      FOREIGN KEY (lease_id) REFERENCES work_leases(lease_id)
    );

    INSERT INTO work_bindings(
      project_id, lease_id, session_id, issue_id, worktree_id,
      display_path, fencing_token, observed_at
    )
    SELECT project_id, lease_id, session_id, issue_id, worktree_id,
           NULL, fencing_token, observed_at
      FROM work_bindings_v1;
  `);

  hooks.afterCopy?.();

  db.exec(`
    DROP TABLE work_bindings_v1;

    CREATE INDEX work_bindings_session
      ON work_bindings(project_id, session_id, lease_id);
    CREATE INDEX work_bindings_issue
      ON work_bindings(project_id, issue_id, lease_id);
    CREATE INDEX work_bindings_worktree
      ON work_bindings(project_id, worktree_id, lease_id);
  `);
  db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(
    VERSION,
    now().toISOString()
  );
  return true;
}
