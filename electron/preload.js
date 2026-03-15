const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("novelDesktop", {
  async saveExportFile(payload) {
    return ipcRenderer.invoke("export:saveFile", payload || {});
  }
});
