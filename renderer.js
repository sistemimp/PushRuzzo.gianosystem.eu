let selectedFiles = [];
let selectedFolderToken = null;
let selectedFilesCount = 0;
let selectedPreviewLimit = 0;
let lastUploadResults = null;
let lastTipologiaFile = null;

const RESULT_PREVIEW_LIMIT = 250;

function setStatus(type, message) {
  const statusDiv = document.getElementById('status');
  statusDiv.className = `status ${type}`;
  statusDiv.textContent = message;
}

function getApiUploadMessage(apiUpload) {
  if (!apiUpload) return '';
  if (apiUpload.skipped) {
    const reason = apiUpload.reason ? ` (${apiUpload.reason})` : '';
    return ` | API CSV: saltato${reason}`;
  }

  if (apiUpload.success) {
    return ` | API CSV: invio completato (HTTP ${apiUpload.statusCode})`;
  }

  if (apiUpload.attempted && apiUpload.error) {
    return ` | API CSV: errore (${apiUpload.error})`;
  }

  return '';
}

function updateUploadButton() {
  const rifLavorazione = document.getElementById('rifLavorazione').value.trim();
  const tipologiaFile = document.getElementById('tipologiaFile').value;
  const uploadBtn = document.getElementById('upload');

  uploadBtn.disabled = !rifLavorazione || !tipologiaFile || selectedFilesCount === 0 || !selectedFolderToken;
}

document.getElementById('rifLavorazione').addEventListener('input', updateUploadButton);
document.getElementById('tipologiaFile').addEventListener('change', updateUploadButton);

document.getElementById('checkUpdates').addEventListener('click', async () => {
  setStatus('info', '🔄 Controllo aggiornamenti in corso...');
  const result = await window.electronAPI.checkForUpdates();
  if (!result.success) {
    setStatus('error', `❌ ${result.message}`);
  }
});

window.electronAPI.onUpdaterStatus((_event, payload) => {
  switch (payload.type) {
    case 'checking':
      setStatus('info', `🔄 ${payload.message}`);
      break;
    case 'available':
      setStatus('info', `🆕 ${payload.message}`);
      break;
    case 'downloading':
      setStatus('info', `⬇️ ${payload.message}`);
      break;
    case 'downloaded':
      setStatus('success', `✅ ${payload.message}`);
      break;
    case 'not-available':
      setStatus('info', `ℹ️ ${payload.message}`);
      break;
    case 'disabled':
      setStatus('info', `ℹ️ ${payload.message}`);
      break;
    case 'error':
      setStatus('error', `❌ ${payload.message}`);
      break;
    default:
      break;
  }
});

document.getElementById('testConnection').addEventListener('click', async () => {
  setStatus('info', '🔄 Test connessione in corso...');

  try {
    const result = await window.electronAPI.testConnection();
    if (result.success) {
      setStatus('success', `✅ ${result.message}`);
    } else {
      setStatus('error', `❌ ${result.message}`);
    }
  } catch (error) {
    setStatus('error', `❌ Errore: ${error.message}`);
  }
});

document.getElementById('selectFolder').addEventListener('click', async () => {
  const selection = await window.electronAPI.selectFolder();

  if (!selection || !selection.selected) {
    selectedFiles = [];
    selectedFolderToken = null;
    selectedFilesCount = 0;
    selectedPreviewLimit = 0;
    displayFiles();
    updateUploadButton();
    return;
  }

  selectedFiles = selection.previewFiles || [];
  selectedFolderToken = selection.token || null;
  selectedFilesCount = selection.totalFiles || selectedFiles.length;
  selectedPreviewLimit = selection.previewLimit || selectedFiles.length;

  displayFiles();
  setStatus('info', `📁 Cartella selezionata: ${selectedFilesCount} file trovati`);
  updateUploadButton();
});

document.getElementById('upload').addEventListener('click', async () => {
  const rifLavorazione = document.getElementById('rifLavorazione').value.trim();
  const tipologiaFile = document.getElementById('tipologiaFile').value;

  const progressContainer = document.getElementById('progressContainer');
  const currentFileDiv = document.getElementById('currentFile');
  const fileProgressBar = document.getElementById('fileProgressBar');
  const overallProgressBar = document.getElementById('overallProgressBar');
  const overallProgressText = document.getElementById('overallProgressText');

  setStatus('info', '🚀 Upload in corso...');
  progressContainer.style.display = 'block';
  fileProgressBar.value = 0;
  overallProgressBar.value = 0;
  overallProgressText.textContent = '0%';
  currentFileDiv.textContent = '📋 Preparazione upload...';

  window.electronAPI.onUploadProgress((_event, data) => {
    currentFileDiv.textContent = `📄 Upload: ${data.currentFile}`;
    fileProgressBar.value = data.fileProgress;
    overallProgressBar.value = data.overallProgress;
    overallProgressText.textContent = `${data.overallProgress}% (${data.completed}/${data.total})`;
  });

  try {
    const payload = {
      selectionToken: selectedFolderToken,
      fileKeys: []
    };

    const results = await window.electronAPI.uploadToS3(payload, rifLavorazione, tipologiaFile);
    lastUploadResults = results;
    lastTipologiaFile = tipologiaFile;

    let apiUploadResult;
    try {
      apiUploadResult = await window.electronAPI.uploadCsvAfterUpload(results, tipologiaFile);
    } catch (err) {
      apiUploadResult = { attempted: true, success: false, error: err.message };
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const existedCount = results.filter((r) => r.status === 'success' && r.existedOnS3).length;
    const resumedCount = results.filter((r) => r.resumed).length;
    const errorCount = results.length - successCount;
    setStatus('success', `✅ Upload completato! Successi: ${successCount}, Esistenti su S3: ${existedCount}, Ripresi da resume: ${resumedCount}, Errori: ${errorCount}${getApiUploadMessage(apiUploadResult)}`);
    progressContainer.style.display = 'none';

    renderUploadResults(results);
    document.getElementById('exportSection').style.display = 'block';
  } catch (error) {
    setStatus('error', `❌ Errore: ${error.message}`);
    progressContainer.style.display = 'none';
  }
});

document.getElementById('exportCsv').addEventListener('click', async () => {
  if (!lastUploadResults) {
    alert('Nessun upload da esportare');
    return;
  }

  const exportBtn = document.getElementById('exportCsv');
  exportBtn.disabled = true;
  exportBtn.textContent = '⏳ Esportazione in corso...';

  try {
    const result = await window.electronAPI.exportCsv(lastUploadResults, lastTipologiaFile);
    if (result.success) {
      setStatus('success', `✅ CSV esportato con successo: ${result.filePath}${getApiUploadMessage(result.apiUpload)}`);
    } else if (result.keepInTemp) {
      setStatus('info', `📁 Esportazione annullata. File disponibile in: ${result.filePath}${getApiUploadMessage(result.apiUpload)}`);
    }
  } catch (error) {
    setStatus('error', `❌ Errore nell'esportazione: ${error.message}`);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '📊 Esporta CSV';
  }
});

function renderUploadResults(results) {
  const statusDiv = document.getElementById('status');

  const summary = document.createElement('div');
  summary.className = 'result-item';
  const successCount = results.filter((r) => r.status === 'success').length;
  const existedCount = results.filter((r) => r.status === 'success' && r.existedOnS3).length;
  const resumedCount = results.filter((r) => r.resumed).length;
  const errorCount = results.length - successCount;
  summary.textContent = `Riepilogo: ${results.length} file, ${successCount} successi, ${existedCount} gia presenti su S3, ${resumedCount} ripresi da resume, ${errorCount} errori`;
  statusDiv.appendChild(summary);

  const preview = results.slice(0, RESULT_PREVIEW_LIMIT);
  preview.forEach((result) => {
    const div = document.createElement('div');
    div.className = result.status === 'success' ? 'result-item result-success' : 'result-item result-error';
    const icon = result.status !== 'success'
      ? '❌'
      : (result.resumed ? '♻️' : (result.existedOnS3 ? '↩️' : '✅'));
    div.textContent = `${icon} ${result.file} → ${result.key}`;
    if (result.error) div.textContent += ` - Errore: ${result.error}`;
    statusDiv.appendChild(div);
  });

  if (results.length > RESULT_PREVIEW_LIMIT) {
    const extra = document.createElement('div');
    extra.className = 'result-item';
    extra.textContent = `Mostrati solo i primi ${RESULT_PREVIEW_LIMIT} risultati su ${results.length}.`;
    statusDiv.appendChild(extra);
  }
}

function displayFiles() {
  const fileListDiv = document.getElementById('fileList');
  fileListDiv.innerHTML = '';

  if (selectedFilesCount === 0) return;

  const meta = document.createElement('div');
  meta.className = 'file-item';
  meta.textContent = `Totale file: ${selectedFilesCount}`;
  fileListDiv.appendChild(meta);

  selectedFiles.forEach((fileObj) => {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item';
    fileDiv.textContent = `📄 ${fileObj.relativePath}`;
    fileListDiv.appendChild(fileDiv);
  });

  if (selectedFilesCount > selectedPreviewLimit) {
    const hidden = document.createElement('div');
    hidden.className = 'file-item';
    hidden.textContent = `... e altri ${selectedFilesCount - selectedPreviewLimit} file non mostrati in anteprima`;
    fileListDiv.appendChild(hidden);
  }
}
