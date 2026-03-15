const path = require("path");
const http = require("http");
const fs = require("fs/promises");
const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");

const DEFAULT_PORT = Number(process.env.PORT || 3000);
let activePort = DEFAULT_PORT;
let stopServerRef = async () => {};
let shuttingDown = false;
let mainWindow = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

ipcMain.handle("export:saveFile", async (_event, payload = {}) => {
  const content = String(payload.content || "");
  const defaultFileName = String(payload.defaultFileName || "novel-export.txt").trim() || "novel-export.txt";
  const extension = String(payload.extension || "txt").toLowerCase();

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

  const { startServer, stopServer, port } = require(path.join(__dirname, "..", "server.js"));
  const listenPort = Number(process.env.PORT || port || DEFAULT_PORT);
  await startServer(listenPort);
  activePort = listenPort;
  stopServerRef = stopServer;

  const ready = await waitForServer(listenPort);
  if (!ready) {
    throw new Error(`本地服务未在预期时间内启动（端口 ${listenPort}）`);
  }

  mainWindow = createMainWindow(listenPort);
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
