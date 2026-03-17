const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  testConnection: () => ipcRenderer.invoke('test-connection'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  uploadToS3: (fileKeys, rifLavorazione, tipologiaFile) => ipcRenderer.invoke('upload-to-s3', fileKeys, rifLavorazione, tipologiaFile),
  exportCsv: (results) => ipcRenderer.invoke('export-csv', results),
  onUploadProgress: (callback) => ipcRenderer.on('upload-progress', callback),
  onUpdaterStatus: (callback) => ipcRenderer.on('updater-status', callback)
});
