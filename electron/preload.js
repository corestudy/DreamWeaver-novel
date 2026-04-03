const { contextBridge, ipcRenderer } = require("electron");

/**
 * Normalize renderer export payload before crossing IPC boundary.
 * Main process will validate again.
 * @param {{content?: string, defaultFileName?: string, extension?: string}} payload
 * @returns {{content: string, defaultFileName: string, extension: string}}
 */
function normalizeExportPayload(payload = {}) {
  return {
    content: String(payload.content || ""),
    defaultFileName: String(payload.defaultFileName || "novel-export.txt"),
    extension: String(payload.extension || "txt").toLowerCase()
  };
}

contextBridge.exposeInMainWorld("novelDesktop", {
  /**
   * Request native save dialog export through a restricted IPC channel.
   * @param {{content?: string, defaultFileName?: string, extension?: string}} payload
   * @returns {Promise<{canceled: boolean, filePath?: string}>}
   */
  async saveExportFile(payload) {
    return ipcRenderer.invoke("export:saveFile", normalizeExportPayload(payload));
  }
});
