const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const baseDir = path.resolve(__dirname, "..", "storage");
const targets = [
  path.join(baseDir, "dreamweaver_novel.sqlite"),
  path.join(baseDir, "dreamweaver_novel.sqlite-wal"),
  path.join(baseDir, "dreamweaver_novel.sqlite-shm")
];

const CLEANUP_SQL = {
  project_chat_messages: "DELETE FROM project_chat_messages",
  generation_logs: "DELETE FROM generation_logs",
  chapter_summaries: "DELETE FROM chapter_summaries",
  story_facts: "DELETE FROM story_facts",
  chapters: "DELETE FROM chapters",
  characters: "DELETE FROM characters",
  locations: "DELETE FROM locations",
  world_settings: "DELETE FROM world_settings",
  project_configs: "DELETE FROM project_configs",
  projects: "DELETE FROM projects",
  app_settings: "DELETE FROM app_settings"
};

let hasLockedFile = false;

for (const target of targets) {
  try {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      console.log(`removed: ${target}`);
    }
  } catch (error) {
    if (error && error.code === "EBUSY") {
      hasLockedFile = true;
      console.warn(`locked: ${target}`);
    } else {
      console.error(`failed to remove ${target}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}

if (!hasLockedFile) {
  process.exit();
}

const dbPath = path.join(baseDir, "dreamweaver_novel.sqlite");
if (!fs.existsSync(dbPath)) {
  process.exit();
}

let db = null;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 3000");

  /**
   * Check whether a table exists in the current database.
   * @param {string} tableName
   * @returns {boolean}
   */
  const tableExists = (tableName) => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName);
    return Boolean(row);
  };

  /**
   * Delete table rows using a static SQL whitelist.
   * @param {keyof typeof CLEANUP_SQL} tableName
   */
  const deleteIfExists = (tableName) => {
    if (tableExists(tableName)) {
      db.prepare(CLEANUP_SQL[tableName]).run();
    }
  };

  Object.keys(CLEANUP_SQL).forEach((tableName) => {
    deleteIfExists(tableName);
  });

  db.pragma("wal_checkpoint(TRUNCATE)");
  db.exec("VACUUM");
  console.log("locked database fallback: cleared user data/config");
} catch (error) {
  console.error(`fallback cleanup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (db) {
    db.close();
  }
}
