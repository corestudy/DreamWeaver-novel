const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const configuredDataDir = String(process.env.NOVEL_DATA_DIR || "").trim();
const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : path.join(__dirname, "storage");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "dreamweaver_novel.sqlite");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const TABLE_INFO_SQL = {
  projects: "PRAGMA table_info(projects)",
  project_configs: "PRAGMA table_info(project_configs)"
};

const COLUMN_ALTER_SQL = {
  projects: {
    description: "ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''",
    cover_color: "ALTER TABLE projects ADD COLUMN cover_color TEXT NOT NULL DEFAULT '#0f766e'",
    cover_image: "ALTER TABLE projects ADD COLUMN cover_image TEXT NOT NULL DEFAULT ''"
  },
  project_configs: {
    ai_base_url_override: "ALTER TABLE project_configs ADD COLUMN ai_base_url_override TEXT NOT NULL DEFAULT ''",
    ai_api_key_override: "ALTER TABLE project_configs ADD COLUMN ai_api_key_override TEXT NOT NULL DEFAULT ''",
    outline_text: "ALTER TABLE project_configs ADD COLUMN outline_text TEXT NOT NULL DEFAULT ''",
    outline_uploaded: "ALTER TABLE project_configs ADD COLUMN outline_uploaded INTEGER NOT NULL DEFAULT 0",
    outline_uploaded_at: "ALTER TABLE project_configs ADD COLUMN outline_uploaded_at TEXT"
  }
};

/**
 * Ensure a known schema column exists.
 * Only allows whitelisted table/column pairs to prevent dynamic SQL injection.
 * @param {keyof typeof TABLE_INFO_SQL} tableName
 * @param {string} columnName
 */
function ensureColumn(tableName, columnName) {
  const tableInfoSql = TABLE_INFO_SQL[tableName];
  const alterSql = COLUMN_ALTER_SQL[tableName]?.[columnName];
  if (!tableInfoSql || !alterSql) {
    throw new Error(`Unsupported schema migration target: ${tableName}.${columnName}`);
  }
  const columns = db.prepare(tableInfoSql).all();
  const exists = columns.some((item) => item.name === columnName);
  if (!exists) {
    db.exec(alterSql);
  }
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      profile TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS world_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      key_name TEXT NOT NULL,
      value_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS chapter_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL UNIQUE,
      summary TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS generation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_id INTEGER,
      action TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      output_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key_name TEXT PRIMARY KEY,
      value_text TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_configs (
      project_id INTEGER PRIMARY KEY,
      synopsis TEXT NOT NULL DEFAULT '',
      writing_style TEXT NOT NULL DEFAULT '',
      narrative_pov TEXT NOT NULL DEFAULT '',
      default_tone TEXT NOT NULL DEFAULT '自然叙事',
      default_target_length TEXT NOT NULL DEFAULT '约200-500字',
      ai_model_override TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS story_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      chapter_id INTEGER,
      fact_text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(chapter_id) REFERENCES chapters(id)
    );

    CREATE TABLE IF NOT EXISTS project_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS project_memory_status (
      project_id INTEGER PRIMARY KEY,
      context_hash TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_checked',
      detail TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS project_memory_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      action TEXT NOT NULL DEFAULT 'check',
      status TEXT NOT NULL DEFAULT 'failed',
      context_hash TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      receipt_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS cheat_mode_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT NOT NULL UNIQUE,
      book_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS cheat_mode_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(session_id) REFERENCES cheat_mode_sessions(id)
    );
  `);

  ensureColumn("projects", "description");
  ensureColumn("projects", "cover_color");
  ensureColumn("projects", "cover_image");
  ensureColumn("project_configs", "ai_base_url_override");
  ensureColumn("project_configs", "ai_api_key_override");
  ensureColumn("project_configs", "outline_text");
  ensureColumn("project_configs", "outline_uploaded");
  ensureColumn("project_configs", "outline_uploaded_at");
}

module.exports = {
  db,
  initDb
};
