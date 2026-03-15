const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const baseDir = path.resolve(__dirname, "..", "storage");
const targets = [
  path.join(baseDir, "novel_demo.sqlite"),
  path.join(baseDir, "novel_demo.sqlite-wal"),
  path.join(baseDir, "novel_demo.sqlite-shm")
];

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

const dbPath = path.join(baseDir, "novel_demo.sqlite");
if (!fs.existsSync(dbPath)) {
  process.exit();
}

let db = null;
try {
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 3000");

  const tableExists = (name) => {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name);
    return Boolean(row);
  };

  const deleteIfExists = (name) => {
    if (tableExists(name)) {
      db.prepare(`DELETE FROM ${name}`).run();
    }
  };

  deleteIfExists("project_chat_messages");
  deleteIfExists("generation_logs");
  deleteIfExists("chapter_summaries");
  deleteIfExists("story_facts");
  deleteIfExists("chapters");
  deleteIfExists("characters");
  deleteIfExists("locations");
  deleteIfExists("world_settings");
  deleteIfExists("project_configs");
  deleteIfExists("projects");
  deleteIfExists("app_settings");

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
