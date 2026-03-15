function fail(message, error) {
  console.error(`[native-check] ${message}`);
  if (error) {
    console.error(error && error.stack ? error.stack : String(error));
  }
  process.exit(1);
}

try {
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  const row = db.prepare("SELECT 1 AS ok").get();
  db.close();

  if (!row || row.ok !== 1) {
    fail("better-sqlite3 自检查询失败。");
  }

  console.log(
    `[native-check] better-sqlite3 正常: node=${process.version}, abi=${process.versions.modules}`
  );
} catch (error) {
  fail(
    "better-sqlite3 加载失败。请先执行 `npm.cmd run native:rebuild:node` 后重试。",
    error
  );
}
