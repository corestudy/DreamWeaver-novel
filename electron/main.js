const path = require("path");
const http = require("http");
const fs = require("fs/promises");
const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
let activePort = DEFAULT_PORT;
let stopServerRef = async () => {};
let shuttingDown = false;
let mainWindow = null;
const MAX_EXPORT_BYTES = 8 * 1024 * 1024;
const ALLOWED_EXPORT_EXTENSIONS = new Set(["txt", "md", "html"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Restrict IPC calls to the local workspace pages loaded by this app.
 * @param {Electron.IpcMainInvokeEvent} event
 * @returns {boolean}
 */
function isTrustedIpcSender(event) {
  const frameUrl = String(event?.senderFrame?.url || "");
  const localhostPrefix = `http://127.0.0.1:${activePort}/`;
  const loopbackPrefix = `http://localhost:${activePort}/`;
  return frameUrl.startsWith(localhostPrefix) || frameUrl.startsWith(loopbackPrefix);
}

/**
 * Keep only a safe file base name to prevent path confusion in save dialogs.
 * @param {string} rawName
 * @returns {string}
 */
function sanitizeExportName(rawName) {
  const normalized = String(rawName || "").trim().replace(/[\/:*?"<>|]/g, "_");
  const baseName = path.basename(normalized || "novel-export.txt");
  return baseName || "novel-export.txt";
}

function checkServer(port) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: 1500
      },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode) && res.statusCode < 500);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
  });
}

async function waitForServer(port, retries = 80, intervalMs = 250) {
  for (let i = 0; i < retries; i += 1) {
    if (await checkServer(port)) {
      return true;
    }
    await sleep(intervalMs);
  }
  return false;
}

function createMainWindow(port) {
  const window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1160,
    minHeight: 760,
    autoHideMenuBar: true,
    backgroundColor: "#f4f8ff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.loadURL(`http://127.0.0.1:${port}/index.html`);
  return window;
}

/**
 * Save exported text/markdown/html to user-selected path via native dialog.
 * Renderer cannot directly access Node fs, so this IPC boundary is validated.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {{content?: string, defaultFileName?: string, extension?: string}} payload
 * @returns {Promise<{canceled: boolean, filePath?: string}>}
 */
ipcMain.handle("export:saveFile", async (event, payload = {}) => {
  if (!isTrustedIpcSender(event)) {
    throw new Error("untrusted IPC sender");
  }

  const content = String(payload.content || "");
  if (Buffer.byteLength(content, "utf8") > MAX_EXPORT_BYTES) {
    throw new Error("export content too large");
  }

  const defaultFileName = sanitizeExportName(payload.defaultFileName || "novel-export.txt");
  const extension = String(payload.extension || "txt").toLowerCase();
  if (!ALLOWED_EXPORT_EXTENSIONS.has(extension)) {
    throw new Error("invalid export extension");
  }

  const filters = [
    { name: "Text", extensions: ["txt"] },
    { name: "Markdown", extensions: ["md"] },
    { name: "HTML", extensions: ["html"] }
  ];

  const result = await dialog.showSaveDialog({
    title: "导出小说内容",
    defaultPath: defaultFileName,
    filters,
    properties: ["createDirectory", "showOverwriteConfirmation"]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  const filePath = result.filePath.endsWith(`.${extension}`) ? result.filePath : `${result.filePath}.${extension}`;
  await fs.writeFile(filePath, content, "utf-8");
  return { canceled: false, filePath };
});

async function bootstrap() {
  process.env.NOVEL_DATA_DIR = path.join(app.getPath("userData"), "storage");

  const { startServer, stopServer, port, getActivePort } = require(path.join(__dirname, "..", "server.js"));
  const preferPort = Number(process.env.PORT || port || DEFAULT_PORT);
  await startServer(preferPort, { allowPortFallback: true });
  activePort = typeof getActivePort === "function" ? Number(getActivePort() || preferPort) : preferPort;
  stopServerRef = stopServer;

  const ready = await waitForServer(activePort);
  if (!ready) {
    throw new Error(`本地服务未在预期时间内启动（端口 ${activePort}）`);
  }

  mainWindow = createMainWindow(activePort);
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    dialog.showErrorBox("启动失败", error.message || String(error));
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(activePort);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (shuttingDown) {
    return;
  }
  event.preventDefault();
  shuttingDown = true;
  stopServerRef()
    .catch(() => {})
    .finally(() => app.quit());
});
