const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  testConnection: () => ipcRenderer.invoke('test-connection'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  uploadToS3: (payload, rifLavorazione, tipologiaFile) => ipcRenderer.invoke('upload-to-s3', payload, rifLavorazione, tipologiaFile),
  exportCsv: (results, tipologiaFile) => ipcRenderer.invoke('export-csv', results, tipologiaFile),
  uploadCsvAfterUpload: (results, tipologiaFile) => ipcRenderer.invoke('upload-csv-after-upload', results, tipologiaFile),
  onUploadProgress: (callback) => {
    ipcRenderer.removeAllListeners('upload-progress');
    ipcRenderer.on('upload-progress', callback);
  },
  onUpdaterStatus: (callback) => ipcRenderer.on('updater-status', callback)
});
