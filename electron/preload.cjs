const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("geruosiDesktop", {
  platform: process.platform,
  checkUpdates: () => ipcRenderer.invoke("geruosi:check-updates"),
  saveDataPackage: (payload) => ipcRenderer.invoke("geruosi:save-data-package", payload),
  getSystemFonts: () => ipcRenderer.invoke("geruosi:get-system-fonts"),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  renderOfficePreview: (payload) => ipcRenderer.invoke("geruosi:render-office-preview", payload),
  captureCanvasPreview: (rect) => ipcRenderer.invoke("geruosi:capture-canvas-preview", rect),
  getAiConfig: () => ipcRenderer.invoke("geruosi:get-ai-config"),
  saveAiConfig: (payload) => ipcRenderer.invoke("geruosi:save-ai-config", payload),
  askAi: (payload) => ipcRenderer.invoke("geruosi:ask-ai", payload),
  askConfiguredAi: (payload) => ipcRenderer.invoke("geruosi:ask-configured-ai", payload)
});
