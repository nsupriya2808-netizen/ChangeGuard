import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'changeguard.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Software Quality Engineer',
      avatar_url TEXT,
      theme TEXT NOT NULL DEFAULT 'light',
      preferences_json TEXT NOT NULL DEFAULT '{}',
      reset_token TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      current_version TEXT NOT NULL DEFAULT 'v1.0',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version_label TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      raw_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS change_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      old_version TEXT NOT NULL,
      new_version TEXT NOT NULL,
      old_text TEXT NOT NULL,
      new_text TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      analysis_time_ms REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS requirement_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER NOT NULL REFERENCES change_analyses(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      req_code TEXT NOT NULL,
      change_type TEXT NOT NULL,
      old_text TEXT NOT NULL DEFAULT '',
      new_text TEXT NOT NULL DEFAULT '',
      similarity_score REAL NOT NULL DEFAULT 1,
      change_size REAL NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'none',
      diff_tokens_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      comp_code TEXT NOT NULL,
      name TEXT NOT NULL,
      layer TEXT NOT NULL CHECK(layer IN ('requirement', 'design', 'code', 'test')),
      description TEXT NOT NULL DEFAULT '',
      risk_weight REAL NOT NULL DEFAULT 0.5,
      execution_time_sec REAL NOT NULL DEFAULT 10,
      past_failures INTEGER NOT NULL DEFAULT 0,
      total_runs INTEGER NOT NULL DEFAULT 0,
      UNIQUE(project_id, comp_code)
    );

    CREATE TABLE IF NOT EXISTS traceability_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
      link_type TEXT NOT NULL DEFAULT 'depends_on',
      weight REAL NOT NULL DEFAULT 1.0,
      UNIQUE(project_id, source_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS impact_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      change_analysis_id INTEGER NOT NULL REFERENCES change_analyses(id) ON DELETE CASCADE,
      affected_nodes_json TEXT NOT NULL,
      impact_paths_json TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      analysis_time_ms REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_prioritizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      impact_analysis_id INTEGER REFERENCES impact_analyses(id) ON DELETE SET NULL,
      ranked_tests_json TEXT NOT NULL,
      total_time_sec REAL NOT NULL DEFAULT 0,
      prioritized_time_sec REAL NOT NULL DEFAULT 0,
      time_saved_sec REAL NOT NULL DEFAULT 0,
      tests_saved_count INTEGER NOT NULL DEFAULT 0,
      metrics_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      prioritization_id INTEGER REFERENCES test_prioritizations(id) ON DELETE SET NULL,
      run_mode TEXT NOT NULL DEFAULT 'simulated',
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      total_duration_sec REAL NOT NULL DEFAULT 0,
      passed_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      results_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('github', 'git', 'jenkins', 'github_actions')),
      status TEXT NOT NULL DEFAULT 'not_connected',
      config_json TEXT NOT NULL DEFAULT '{}',
      last_checked_at TEXT,
      last_message TEXT NOT NULL DEFAULT 'Not configured',
      UNIQUE(project_id, provider)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export function getDatabaseStats(): { path: string; sizeBytes: number; tables: Record<string, number> } {
  const tableNames = [
    'users',
    'projects',
    'change_analyses',
    'requirement_changes',
    'components',
    'traceability_links',
    'impact_analyses',
    'test_prioritizations',
    'test_runs',
  ];
  const tables: Record<string, number> = {};
  for (const t of tableNames) {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
    tables[t] = row.c;
  }
  const pageCount = db.pragma('page_count', { simple: true }) as number;
  const pageSize = db.pragma('page_size', { simple: true }) as number;
  return {
    path: DB_PATH,
    sizeBytes: pageCount * pageSize,
    tables,
  };
}
