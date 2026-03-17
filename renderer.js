let selectedFiles = [];
let lastUploadResults = null;

function updateUploadButton() {
  const rifLavorazione = document.getElementById('rifLavorazione').value.trim();
  const tipologiaFile = document.getElementById('tipologiaFile').value;
  const uploadBtn = document.getElementById('upload');

  uploadBtn.disabled = !rifLavorazione || !tipologiaFile || selectedFiles.length === 0;
}

document.getElementById('rifLavorazione').addEventListener('input', updateUploadButton);
document.getElementById('tipologiaFile').addEventListener('change', updateUploadButton);

document.getElementById('testConnection').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  statusDiv.className = 'status info';
  statusDiv.textContent = '🔄 Test connessione in corso...';
  
  try {
    const result = await window.electronAPI.testConnection();
    if (result.success) {
      statusDiv.className = 'status success';
      statusDiv.textContent = `✅ ${result.message}`;
    } else {
      statusDiv.className = 'status error';
      statusDiv.textContent = `❌ ${result.message}`;
    }
  } catch (error) {
    statusDiv.className = 'status error';
    statusDiv.textContent = `❌ Errore: ${error.message}`;
  }
});

document.getElementById('selectFolder').addEventListener('click', async () => {
  selectedFiles = await window.electronAPI.selectFolder();
  displayFiles();
  updateUploadButton();
});

document.getElementById('upload').addEventListener('click', async () => {
  const rifLavorazione = document.getElementById('rifLavorazione').value.trim();
  const tipologiaFile = document.getElementById('tipologiaFile').value;

  const fileKeys = selectedFiles.map((fileObj) => ({
    file: fileObj.fullPath
  }));

  const statusDiv = document.getElementById('status');
  const progressContainer = document.getElementById('progressContainer');
  const currentFileDiv = document.getElementById('currentFile');
  const fileProgressBar = document.getElementById('fileProgressBar');
  const overallProgressBar = document.getElementById('overallProgressBar');
  const overallProgressText = document.getElementById('overallProgressText');

  statusDiv.className = 'status info';
  statusDiv.textContent = '🚀 Upload in corso...';
  progressContainer.style.display = 'block';
  fileProgressBar.value = 0;
  overallProgressBar.value = 0;
  overallProgressText.textContent = '0%';
  currentFileDiv.textContent = '📋 Preparazione upload...';

  // Listen for progress updates
  window.electronAPI.onUploadProgress((event, data) => {
    currentFileDiv.textContent = `📄 Upload: ${data.currentFile}`;
    fileProgressBar.value = data.fileProgress;
    overallProgressBar.value = data.overallProgress;
    overallProgressText.textContent = `${data.overallProgress}% (${data.completed}/${data.total})`;
  });

  try {
    const results = await window.electronAPI.uploadToS3(fileKeys, rifLavorazione, tipologiaFile);
    lastUploadResults = results;
    statusDiv.className = 'status success';
    statusDiv.textContent = '✅ Upload completato!';
    progressContainer.style.display = 'none';

    // Display results
    results.forEach(result => {
      const div = document.createElement('div');
      div.className = result.status === 'success' ? 'result-item result-success' : 'result-item result-error';
      div.textContent = `${result.status === 'success' ? '✅' : '❌'} ${result.file} → ${result.key}`;
      if (result.error) div.textContent += ` - Errore: ${result.error}`;
      statusDiv.appendChild(div);
    });

    // Show export section
    document.getElementById('exportSection').style.display = 'block';
  } catch (error) {
    statusDiv.className = 'status error';
    statusDiv.textContent = `❌ Errore: ${error.message}`;
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
    const result = await window.electronAPI.exportCsv(lastUploadResults);
    if (result.success) {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status success';
      statusDiv.textContent = `✅ CSV esportato con successo: ${result.filePath}`;
    } else if (result.keepInTemp) {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'status info';
      statusDiv.textContent = `📁 Esportazione annullata. File disponibile in: ${result.filePath}`;
    }
  } catch (error) {
    const statusDiv = document.getElementById('status');
    statusDiv.className = 'status error';
    statusDiv.textContent = `❌ Errore nell'esportazione: ${error.message}`;
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = '📊 Esporta CSV';
  }
});

function basename(filePath) {
  return filePath.split('\\').pop().split('/').pop();
}

function displayFiles() {
  const fileListDiv = document.getElementById('fileList');
  fileListDiv.innerHTML = '';

  if (selectedFiles.length === 0) return;

  selectedFiles.forEach((fileObj) => {
    const fileDiv = document.createElement('div');
    fileDiv.className = 'file-item';
    fileDiv.textContent = `📄 ${fileObj.relativePath}`;
    fileListDiv.appendChild(fileDiv);
  });
}