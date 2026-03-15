const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const DOC_FILE = path.join(ROOT, "前后端交互标准文档.md");
const SERVER_FILE = path.join(ROOT, "server.js");

function normalizeApiPath(rawPath) {
  return rawPath
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, ":param")
    .replace(/:param\/:param/g, ":param/:param")
    .replace(/\/+/g, "/");
}

function toRouteKey(method, routePath) {
  return `${method.toUpperCase()} ${normalizeApiPath(routePath)}`;
}

function extractFrontendRoutes() {
  const files = fs
    .readdirSync(PUBLIC_DIR)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(PUBLIC_DIR, name));

  const routeSet = new Set();
  const apiCallRegex =
    /api\(\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = apiCallRegex.exec(text))) {
      const rawPath = match[1] || match[2] || match[3] || "";
      if (!rawPath.startsWith("/api/")) continue;
      const options = match[4] || "";
      const methodMatch = options.match(/method\s*:\s*["']([A-Z]+)["']/i);
      const method = methodMatch ? methodMatch[1].toUpperCase() : "GET";
      routeSet.add(toRouteKey(method, rawPath));
    }
  }

  return routeSet;
}

function extractServerRoutes() {
  const text = fs.readFileSync(SERVER_FILE, "utf8");
  const routeSet = new Set();
  const routeRegex = /app\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g;
  let match;

  while ((match = routeRegex.exec(text))) {
    const method = match[1].toUpperCase();
    const routePath = (match[2] || "").trim();
    if (!routePath.startsWith("/api/")) continue;
    routeSet.add(toRouteKey(method, routePath));
  }
  return routeSet;
}

function extractCoreTableRoutes(docText) {
  const routeSet = new Set();
  const rowRegex = /\|\s*[^|]+\s*\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*`?([^`|]+)`?\s*\|/g;
  let match;
  while ((match = rowRegex.exec(docText))) {
    const method = match[1].toUpperCase();
    const routePath = (match[2] || "").trim();
    if (!routePath.startsWith("/api/")) continue;
    routeSet.add(toRouteKey(method, routePath));
  }
  return routeSet;
}

function extractContractMatrixRoutes(docText) {
  const startToken = "## 前端接口契约矩阵（method/path/request/response/error）";
  const start = docText.indexOf(startToken);
  if (start < 0) {
    return { found: false, rows: new Map() };
  }
  const tail = docText.slice(start + startToken.length);
  const nextHeadingIndex = tail.search(/\n##\s+/);
  const section = nextHeadingIndex >= 0 ? tail.slice(0, nextHeadingIndex) : tail;

  const rows = new Map();
  const lineRegex = /\|\s*(GET|POST|PUT|DELETE|PATCH)\s*\|\s*`?([^`|]+)`?\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/g;
  let match;
  while ((match = lineRegex.exec(section))) {
    const method = match[1].toUpperCase();
    const routePath = (match[2] || "").trim();
    const req = match[3].trim();
    const res = match[4].trim();
    const err = match[5].trim();
    rows.set(toRouteKey(method, routePath), { req, res, err });
  }
  return { found: true, rows };
}

function diffMissing(sourceSet, targetSet) {
  const missing = [];
  for (const key of sourceSet) {
    if (!targetSet.has(key)) missing.push(key);
  }
  return missing.sort();
}

function run() {
  if (!fs.existsSync(DOC_FILE)) {
    console.error(`[api-doc-check] 文档不存在: ${DOC_FILE}`);
    process.exit(1);
  }

  const docText = fs.readFileSync(DOC_FILE, "utf8");
  const frontendRoutes = extractFrontendRoutes();
  const serverRoutes = extractServerRoutes();
  const coreTableRoutes = extractCoreTableRoutes(docText);
  const matrix = extractContractMatrixRoutes(docText);

  const errors = [];

  const missingInCoreTableFromFrontend = diffMissing(frontendRoutes, coreTableRoutes);
  if (missingInCoreTableFromFrontend.length) {
    errors.push("以下前端接口未出现在文档核心接口清单:");
    errors.push(...missingInCoreTableFromFrontend.map((item) => `  - ${item}`));
  }

  const missingInCoreTableFromServer = diffMissing(serverRoutes, coreTableRoutes);
  if (missingInCoreTableFromServer.length) {
    errors.push("以下后端接口未出现在文档核心接口清单:");
    errors.push(...missingInCoreTableFromServer.map((item) => `  - ${item}`));
  }

  if (!matrix.found) {
    errors.push("未找到“前端接口契约矩阵（method/path/request/response/error）”章节。");
  } else {
    const matrixKeys = new Set(matrix.rows.keys());
    const missingInMatrix = diffMissing(frontendRoutes, matrixKeys);
    if (missingInMatrix.length) {
      errors.push("以下前端接口未出现在契约矩阵:");
      errors.push(...missingInMatrix.map((item) => `  - ${item}`));
    }
    for (const [key, row] of matrix.rows.entries()) {
      if (!row.req || !row.res || !row.err) {
        errors.push(`契约矩阵存在空字段: ${key}`);
      }
    }
  }

  if (errors.length) {
    console.error("[api-doc-check] 校验失败:");
    console.error(errors.join("\n"));
    process.exit(1);
  }

  console.log(
    `[api-doc-check] 通过: 前端接口 ${frontendRoutes.size} 条，后端接口 ${serverRoutes.size} 条，文档契约矩阵 ${matrix.rows.size} 条。`
  );
}

run();


