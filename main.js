const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadBucketCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { autoUpdater } = require('electron-updater');
const winston = require('winston');
require('dotenv').config();

// Configure logger
const logFilePath = path.join(os.tmpdir(), 'electron-s3-uploader.log');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: logFilePath }),
    new winston.transports.Console()
  ]
});

// Configure AWS S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucketName = process.env.S3_BUCKET;
const csvUploadApiUrl = process.env.CSV_UPLOAD_API_URL;
const csvUploadApiToken = process.env.CSV_UPLOAD_API_TOKEN;
const csvUploadTimeoutMs = Number.parseInt(process.env.CSV_UPLOAD_TIMEOUT_MS || '30000', 10);
const csvUploadFieldName = process.env.CSV_UPLOAD_FIELD_NAME || 'file';
const uploadStartApiUrl = process.env.UPLOAD_START_API_URL || '';
const uploadEndApiUrl = process.env.UPLOAD_END_API_URL || '';
const uploadTrackingTimeoutMs = Number.parseInt(process.env.UPLOAD_TRACKING_TIMEOUT_MS || '30000', 10);
const isPortableBuild = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
const uploadConcurrency = Math.max(1, Number.parseInt(process.env.UPLOAD_CONCURRENCY || '4', 10) || 4);
const fileListPreviewLimit = Math.max(10, Number.parseInt(process.env.FILE_LIST_PREVIEW_LIMIT || '300', 10) || 300);
const uploadRetryMaxAttempts = 3;
const uploadRetryBaseDelayMs = 800;

let mainWindow;
let updaterEnabled = false;
let updaterChecking = false;
let selectedFolderState = null;

function sendUpdaterStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('updater-status', payload);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, 'assets', 'favicon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

async function checkForUpdates(source = 'manual') {
  if (!updaterEnabled) {
    return { success: false, message: 'Auto updater non disponibile in questa build' };
  }

  if (updaterChecking) {
    return { success: false, message: 'Controllo aggiornamenti già in corso' };
  }

  try {
    await autoUpdater.checkForUpdates();
    logger.info(`Update check requested (${source})`);
    return { success: true, message: 'Controllo aggiornamenti avviato' };
  } catch (error) {
    logger.error(`Failed to check updates (${source}): ${error.message}`);
    sendUpdaterStatus({ type: 'error', message: `Errore controllo update: ${error.message}` });
    return { success: false, message: error.message };
  }
}

function initAutoUpdater() {
  const isPackaged = app.isPackaged;
  updaterEnabled = isPackaged && !isPortableBuild;

  if (!updaterEnabled) {
    const reason = !isPackaged
      ? 'Auto updater disabilitato in development mode'
      : 'Auto updater non supportato nella build portable';
    logger.info(reason);
    sendUpdaterStatus({ type: 'disabled', message: reason });
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = logger;

  autoUpdater.on('checking-for-update', () => {
    updaterChecking = true;
    logger.info('Checking for updates...');
    sendUpdaterStatus({ type: 'checking', message: 'Controllo aggiornamenti in corso...' });
  });

  autoUpdater.on('update-available', (info) => {
    logger.info(`Update available: ${info.version}`);
    sendUpdaterStatus({ type: 'available', message: `Aggiornamento disponibile: v${info.version}` });
  });

  autoUpdater.on('update-not-available', () => {
    updaterChecking = false;
    logger.info('No updates available');
    sendUpdaterStatus({ type: 'not-available', message: 'Nessun aggiornamento disponibile' });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    sendUpdaterStatus({
      type: 'downloading',
      message: `Download aggiornamento: ${percent}%`,
      percent
    });
  });

  autoUpdater.on('update-downloaded', async (info) => {
    updaterChecking = false;
    logger.info(`Update downloaded: ${info.version}`);
    sendUpdaterStatus({ type: 'downloaded', message: `Aggiornamento pronto: v${info.version}` });

    const result = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Riavvia ora', 'Più tardi'],
      defaultId: 0,
      cancelId: 1,
      title: 'Aggiornamento pronto',
      message: `La versione ${info.version} è stata scaricata.`,
      detail: 'Riavvia ora per completare l’installazione.'
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    updaterChecking = false;
    logger.error(`Auto updater error: ${error.message}`);
    sendUpdaterStatus({ type: 'error', message: `Errore auto-update: ${error.message}` });
  });
}

app.whenReady().then(async () => {
  createWindow();
  initAutoUpdater();

  if (updaterEnabled) {
    setTimeout(() => {
      checkForUpdates('startup');
    }, 5000);

    setInterval(() => {
      checkForUpdates('scheduled');
    }, 1000 * 60 * 60 * 6);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
ipcMain.handle('check-for-updates', async () => checkForUpdates('manual'));

ipcMain.handle('test-connection', async () => {
  try {
    const command = new HeadBucketCommand({
      Bucket: bucketName
    });
    await s3Client.send(command);
    logger.info(`Successfully connected to S3 bucket ${bucketName}`);
    return { success: true, message: `Connection successful! Bucket '${bucketName}' is accessible.` };
  } catch (error) {
    logger.error(`Failed to connect to S3: ${error.message}`);
    return { success: false, message: `Connection failed: ${error.message}` };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    selectedFolderState = null;
    return { selected: false, files: [], totalFiles: 0 };
  }

  const folderPath = result.filePaths[0];
  const files = await getAllFilesAsync(folderPath);
  const token = crypto.randomUUID();

  selectedFolderState = {
    token,
    folderPath,
    files
  };

  logger.info(`Selected folder ${folderPath} with ${files.length} files`);

  const previewFiles = files.slice(0, fileListPreviewLimit).map(file => ({
    relativePath: path.relative(folderPath, file).replace(/\\/g, '/'),
    fullPath: file
  }));

  return {
    selected: true,
    token,
    folderPath,
    totalFiles: files.length,
    previewFiles,
    previewLimit: fileListPreviewLimit
  };
});

ipcMain.handle('delete-from-csv', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, deleted: [], failed: [], totalKeys: 0 };
  }

  const csvPath = result.filePaths[0];
  const csvContent = await fsp.readFile(csvPath, 'utf8');
  const keys = extractKeysFromCsv(csvContent);

  if (keys.length === 0) {
    throw new Error('Il CSV non contiene key S3 valide da eliminare');
  }

  logger.info(`Starting delete from CSV ${csvPath}: ${keys.length} keys on bucket ${bucketName}`);
  const { deleted, failed } = await deleteKeysFromBucket(keys);

  return {
    canceled: false,
    csvPath,
    totalKeys: keys.length,
    deleted,
    failed
  };
});

async function getAllFilesAsync(rootPath) {
  const files = [];
  const dirs = [rootPath];

  while (dirs.length > 0) {
    const currentDir = dirs.pop();
    let entries = [];

    try {
      entries = await fsp.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      logger.error(`Failed to read directory ${currentDir}: ${error.message}`);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function truncateForLog(value, maxLength = 300) {
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
}

function splitCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseCsvRows(csvContent) {
  const normalized = csvContent.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  return lines.map(splitCsvLine);
}

function normalizeKeyValue(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^"(.*)"$/, '$1').trim();
}

function extractKeysFromCsv(csvContent) {
  const rows = parseCsvRows(csvContent);
  if (rows.length === 0) {
    return [];
  }

  const [headerRow, ...dataRows] = rows;
  const normalizedHeaders = headerRow.map((header) => normalizeKeyValue(header).toLowerCase());
  const keyHeaderCandidates = ['chiave s3', 's3 key', 'key', 'chiave'];
  const keyColumnIndex = normalizedHeaders.findIndex((header) => keyHeaderCandidates.includes(header));

  const rowsToProcess = keyColumnIndex >= 0 ? dataRows : rows;
  const inferredIndex = keyColumnIndex >= 0 ? keyColumnIndex : (rows[0].length > 1 ? 1 : 0);

  return rowsToProcess
    .map((row) => normalizeKeyValue(row[inferredIndex] || ''))
    .filter(Boolean);
}

async function deleteKeysFromBucket(keys) {
  const deleted = [];
  const failed = [];

  for (const key of keys) {
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key
      }));
      deleted.push({ key, status: 'success' });
      logger.info(`Deleted S3 object: ${key}`);
    } catch (error) {
      failed.push({ key, status: 'error', error: error.message });
      logger.error(`Failed to delete S3 object ${key}: ${error.message}`);
    }
  }

  return { deleted, failed };
}

async function uploadCsvToApi(filePath, csvContent, tipologiaFile) {
  if (!csvUploadApiUrl) {
    logger.info('CSV API upload skipped: CSV_UPLOAD_API_URL not configured');
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: 'CSV_UPLOAD_API_URL non configurato'
    };
  }

  const headers = {};
  if (csvUploadApiToken) {
    headers.Authorization = `Bearer ${csvUploadApiToken}`;
  }

  const formData = new FormData();
  const fileName = path.basename(filePath);
  formData.append(csvUploadFieldName, new Blob([csvContent], { type: 'text/csv' }), fileName);
  if (typeof tipologiaFile === 'string' && tipologiaFile.trim() !== '') {
    formData.append('type', tipologiaFile.trim());
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), csvUploadTimeoutMs);

  try {
    const response = await fetch(csvUploadApiUrl, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${truncateForLog(responseBody)}`);
    }

    logger.info(`CSV uploaded to API successfully: ${csvUploadApiUrl} (${response.status})`);
    return {
      attempted: true,
      success: true,
      statusCode: response.status,
      response: truncateForLog(responseBody)
    };
  } catch (error) {
    logger.error(`CSV API upload failed: ${error.message}`);
    return {
      attempted: true,
      success: false,
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractTrackingId(responseText, responseJson) {
  if (responseJson && typeof responseJson === 'object') {
    const candidates = [
      responseJson.id,
      responseJson.idInvioAws,
      responseJson.invioId,
      responseJson?.data?.id,
      responseJson?.data?.idInvioAws
    ];
    const found = candidates.find((value) => value !== undefined && value !== null && `${value}`.trim() !== '');
    if (found !== undefined) return `${found}`.trim();
  }

  const trimmed = (responseText || '').trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return extractTrackingId('', parsed);
    }
  } catch (error) {
    // Ignore parse failure and fallback to regex extraction below.
  }

  const idMatch = trimmed.match(/"id"\s*:\s*"?([a-zA-Z0-9_-]+)"?/i);
  if (idMatch && idMatch[1]) return idMatch[1];
  return null;
}

async function callUploadStartApi(totalToProcess) {
  if (!uploadStartApiUrl) {
    logger.info('Upload tracking start skipped: UPLOAD_START_API_URL not configured');
    return { attempted: false, success: false, skipped: true };
  }

  const url = new URL(uploadStartApiUrl);
  url.searchParams.set('numeroCaricamenti', String(totalToProcess));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), uploadTrackingTimeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal
    });
    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch (error) {
      bodyJson = null;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${truncateForLog(bodyText)}`);
    }

    const trackingId = extractTrackingId(bodyText, bodyJson);
    if (!trackingId) {
      throw new Error(`ID non trovato nella risposta: ${truncateForLog(bodyText)}`);
    }

    logger.info(`Upload tracking start OK. id=${trackingId}, total=${totalToProcess}`);
    return {
      attempted: true,
      success: true,
      trackingId,
      statusCode: response.status
    };
  } catch (error) {
    logger.error(`Upload tracking start failed: ${error.message}`);
    return {
      attempted: true,
      success: false,
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function callUploadEndApi(trackingId, successCount) {
  if (!uploadEndApiUrl) {
    logger.info('Upload tracking end skipped: UPLOAD_END_API_URL not configured');
    return { attempted: false, success: false, skipped: true };
  }

  if (!trackingId) {
    logger.info('Upload tracking end skipped: missing trackingId');
    return { attempted: false, success: false, skipped: true, reason: 'trackingId mancante' };
  }

  const url = new URL(uploadEndApiUrl);
  url.searchParams.set('id', String(trackingId));
  url.searchParams.set('numeroProcessatiCorrettamente', String(successCount));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), uploadTrackingTimeoutMs);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal
    });
    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${truncateForLog(bodyText)}`);
    }

    logger.info(`Upload tracking end OK. id=${trackingId}, successCount=${successCount}`);
    return {
      attempted: true,
      success: true,
      statusCode: response.status,
      response: truncateForLog(bodyText)
    };
  } catch (error) {
    logger.error(`Upload tracking end failed: ${error.message}`);
    return {
      attempted: true,
      success: false,
      error: error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeFileKeys(fileKeys = []) {
  if (!Array.isArray(fileKeys)) return [];
  return fileKeys
    .map((entry) => (entry && typeof entry.file === 'string' ? entry.file : null))
    .filter(Boolean);
}

function resolveFilesForUpload(fileKeys, selectionToken) {
  const fromPayload = sanitizeFileKeys(fileKeys);
  if (fromPayload.length > 0) {
    return { files: fromPayload, source: 'payload', folderPath: null };
  }

  if (!selectionToken) {
    throw new Error('Nessun file selezionato per l\'upload');
  }

  if (!selectedFolderState || selectedFolderState.token !== selectionToken) {
    throw new Error('Selezione cartella non valida o scaduta. Riesegui la selezione.');
  }

  return { files: selectedFolderState.files, source: 'cached-selection', folderPath: selectedFolderState.folderPath };
}

function buildS3Key(filePath, rifLavorazione, tipologiaFile) {
  const fileName = path.basename(filePath);
  const fileExt = path.extname(filePath);
  const md5Hash = crypto.createHash('md5').update(fileName).digest('hex');
  return {
    fileName,
    key: `${rifLavorazione}/${tipologiaFile}/${md5Hash}${fileExt}`
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) return;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function getResumeStateDir() {
  return path.join(app.getPath('userData'), 'upload-resume');
}

async function ensureResumeStateDir() {
  await fsp.mkdir(getResumeStateDir(), { recursive: true });
}

function computeUploadSessionId({ folderPath, files, rifLavorazione, tipologiaFile }) {
  const signature = folderPath
    ? `folder:${folderPath}`
    : `files:${files.length}:${crypto.createHash('sha1').update(files.join('|')).digest('hex')}`;
  const raw = `${bucketName}|${signature}|${rifLavorazione}|${tipologiaFile}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}

function getResumePaths(sessionId) {
  const base = path.join(getResumeStateDir(), sessionId);
  return {
    metaPath: `${base}.meta.json`,
    journalPath: `${base}.journal.ndjson`
  };
}

async function writeResumeMeta(metaPath, meta) {
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

async function readCompletedFromJournal(journalPath) {
  const completedMap = new Map();
  try {
    const content = await fsp.readFile(journalPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.type === 'completed' && entry.filePath) {
          completedMap.set(entry.filePath, {
            file: entry.file || path.basename(entry.filePath),
            key: entry.key,
            status: 'success',
            resumed: true,
            existedOnS3: Boolean(entry.existedOnS3)
          });
        }
      } catch (err) {
        logger.warn(`Invalid resume journal line skipped: ${err.message}`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Failed to read resume journal ${journalPath}: ${error.message}`);
    }
  }
  return completedMap;
}

function isPreconditionFailed(error) {
  const httpCode = error?.$metadata?.httpStatusCode;
  const errName = error?.name || error?.Code || '';
  return httpCode === 412 || errName === 'PreconditionFailed';
}

function createJournalWriter(journalPath) {
  let queue = Promise.resolve();

  async function append(entry) {
    const line = `${JSON.stringify(entry)}\n`;
    queue = queue.then(() => fsp.appendFile(journalPath, line, 'utf8'));
    try {
      await queue;
    } catch (error) {
      logger.error(`Failed to append resume journal ${journalPath}: ${error.message}`);
    }
  }

  async function flush() {
    try {
      await queue;
    } catch (error) {
      logger.error(`Failed to flush resume journal ${journalPath}: ${error.message}`);
    }
  }

  return { append, flush };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

ipcMain.handle('upload-to-s3', async (event, payload = {}, rifLavorazione, tipologiaFile) => {
  if (!rifLavorazione || !tipologiaFile) {
    throw new Error('Rif.Lavorazione e Tipologia File sono obbligatori');
  }

  const fileKeys = Array.isArray(payload) ? payload : payload.fileKeys;
  const selectionToken = Array.isArray(payload) ? undefined : payload.selectionToken;
  const { files, source, folderPath } = resolveFilesForUpload(fileKeys, selectionToken);
  const totalFiles = files.length;

  await ensureResumeStateDir();
  const sessionId = computeUploadSessionId({ folderPath, files, rifLavorazione, tipologiaFile });
  const { metaPath, journalPath } = getResumePaths(sessionId);
  await writeResumeMeta(metaPath, {
    sessionId,
    folderPath,
    rifLavorazione,
    tipologiaFile,
    totalFiles,
    updatedAt: new Date().toISOString()
  });

  const completedMap = await readCompletedFromJournal(journalPath);
  const results = new Array(totalFiles);
  let completed = 0;

  const pendingItems = [];
  for (let i = 0; i < files.length; i += 1) {
    const filePath = files[i];
    const resumedResult = completedMap.get(filePath);
    if (resumedResult) {
      results[i] = resumedResult;
      completed += 1;
    } else {
      pendingItems.push({ filePath, index: i });
    }
  }

  const resumeCount = completed;
  logger.info(`Starting upload of ${totalFiles} files to bucket ${bucketName} (source: ${source}, concurrency: ${uploadConcurrency}, resumed: ${resumeCount})`);
  let lastProgressTs = 0;
  const journal = createJournalWriter(journalPath);
  const startTracking = await callUploadStartApi(totalFiles);
  const trackingId = startTracking.success ? startTracking.trackingId : null;
  let successfulUploadsCounter = 0;

  const sendProgress = (currentFile, fileProgress, force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressTs < 120) return;
    lastProgressTs = now;

    event.sender.send('upload-progress', {
      currentFile,
      fileProgress,
      completed,
      total: totalFiles,
      overallProgress: totalFiles === 0 ? 100 : Math.round((completed / totalFiles) * 100)
    });
  };

  if (resumeCount > 0) {
    sendProgress(`Resume: ${resumeCount} file gia completati`, 100, true);
  } else {
    sendProgress('Preparazione upload...', 0, true);
  }

  const pendingResults = await runWithConcurrency(pendingItems, uploadConcurrency, async ({ filePath, index }) => {
    const { fileName, key } = buildS3Key(filePath, rifLavorazione, tipologiaFile);
    sendProgress(fileName, 0);

    try {
      let lastError = null;

      for (let attempt = 1; attempt <= uploadRetryMaxAttempts; attempt += 1) {
        try {
          const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fs.createReadStream(filePath),
            IfNoneMatch: '*'
          });

          await s3Client.send(command);
          logger.info(`Successfully uploaded ${fileName} with key ${key} (attempt ${attempt}/${uploadRetryMaxAttempts})`);
          successfulUploadsCounter += 1;
          const result = { file: fileName, key, status: 'success' };
          await journal.append({
            type: 'completed',
            filePath,
            file: fileName,
            key,
            existedOnS3: false,
            completedAt: new Date().toISOString()
          });
          return { index, result };
        } catch (error) {
          if (isPreconditionFailed(error)) {
            logger.info(`Skipped existing object for ${fileName} with key ${key}`);
            const result = { file: fileName, key, status: 'success', existedOnS3: true };
            await journal.append({
              type: 'completed',
              filePath,
              file: fileName,
              key,
              existedOnS3: true,
              completedAt: new Date().toISOString()
            });
            return { index, result };
          }

          lastError = error;
          const isLastAttempt = attempt >= uploadRetryMaxAttempts;
          if (isLastAttempt) break;

          const delayMs = uploadRetryBaseDelayMs * attempt;
          logger.warn(`Upload attempt ${attempt}/${uploadRetryMaxAttempts} failed for ${fileName}: ${error.message}. Retrying in ${delayMs}ms`);
          await wait(delayMs);
        }
      }

      const finalMessage = lastError ? lastError.message : 'Errore sconosciuto';
      logger.error(`Failed to upload ${fileName} after ${uploadRetryMaxAttempts} attempts: ${finalMessage}`);
      await journal.append({
        type: 'error',
        filePath,
        file: fileName,
        key,
        error: finalMessage,
        failedAt: new Date().toISOString()
      });
      return {
        index,
        result: { file: fileName, key, status: 'error', error: finalMessage }
      };
    } finally {
      completed += 1;
      sendProgress(fileName, 100, true);
    }
  });

  for (const item of pendingResults) {
    if (!item) continue;
    results[item.index] = item.result;
  }

  await callUploadEndApi(trackingId, successfulUploadsCounter);

  await journal.flush();
  await writeResumeMeta(metaPath, {
    sessionId,
    folderPath,
    rifLavorazione,
    tipologiaFile,
    totalFiles,
    completed: results.filter(Boolean).length,
    updatedAt: new Date().toISOString()
  });

  logger.info('Upload process completed');
  return results;
});

ipcMain.handle('export-csv', async (event, results, tipologiaFile) => {
  try {
    // Generate CSV content
    const headers = 'Nome File,Chiave S3\n';
    const rows = results
      .filter(r => r.status === 'success')
      .map(r => {
        const fileNameWithoutExt = path.parse(r.file).name;
        return `"${fileNameWithoutExt}","${r.key}"`;
      })
      .join('\n');

    const csvContent = headers + rows;

    // Generate timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const tempFileName = `result_S3_uploader_${timestamp}.csv`;
    const tempPath = path.join(os.tmpdir(), tempFileName);

    // Save to temp
    fs.writeFileSync(tempPath, csvContent);
    logger.info(`CSV exported to temp: ${tempPath}`);

    const apiUpload = await uploadCsvToApi(tempPath, csvContent, tipologiaFile);

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: tempPath,
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      // Copy file to final location
      fs.copyFileSync(tempPath, result.filePath);
      logger.info(`CSV saved to final location: ${result.filePath}`);
      return { success: true, filePath: result.filePath, tempPath: tempPath, apiUpload };
    } else {
      logger.info(`CSV export canceled by user. File remains in temp at: ${tempPath}`);
      return { success: false, filePath: tempPath, tempPath: tempPath, keepInTemp: true, apiUpload };
    }
  } catch (error) {
    logger.error(`Failed to export CSV: ${error.message}`);
    throw error;
  }
});

ipcMain.handle('upload-csv-after-upload', async (event, results, tipologiaFile) => {
  // Only trigger the CSV upload API when all files were uploaded successfully
  const allSuccessful = Array.isArray(results) && results.length > 0 && results.every(r => r.status === 'success');
  if (!allSuccessful) {
    logger.info('CSV API upload skipped: not all files were uploaded successfully');
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: 'Non tutti i file sono stati caricati con successo'
    };
  }

  // Generate CSV content (same format as export-csv)
  const headers = 'Nome File,Chiave S3\n';
  const rows = results
    .map(r => {
      const fileNameWithoutExt = path.parse(r.file).name;
      return `"${fileNameWithoutExt}","${r.key}"`;
    })
    .join('\n');

  const csvContent = headers + rows;

  // Write a temp file so the API sees a file name
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const tempFileName = `result_S3_uploader_${timestamp}.csv`;
  const tempPath = path.join(os.tmpdir(), tempFileName);
  fs.writeFileSync(tempPath, csvContent);
  logger.info(`CSV generated in temp for API upload: ${tempPath}`);

  const apiUpload = await uploadCsvToApi(tempPath, csvContent, tipologiaFile);
  return { success: true, filePath: tempPath, apiUpload };
});
