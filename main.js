const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
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

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC handlers
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
  if (result.canceled || result.filePaths.length === 0) return [];
  
  const folderPath = result.filePaths[0];
  const files = getAllFiles(folderPath);
  logger.info(`Selected folder ${folderPath} with ${files.length} files`);
  return files.map(file => ({
    fullPath: file,
    relativePath: path.relative(folderPath, file).replace(/\\/g, '/')
  }));
});

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

ipcMain.handle('upload-to-s3', async (event, fileKeys, rifLavorazione, tipologiaFile) => {
  if (!rifLavorazione || !tipologiaFile) {
    throw new Error('Rif.Lavorazione e Tipologia File sono obbligatori');
  }

  logger.info(`Starting upload of ${fileKeys.length} files to bucket ${bucketName}`);
  const results = [];
  const totalFiles = fileKeys.length;
  let completed = 0;

  for (const { file: filePath } of fileKeys) {
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const md5Hash = crypto.createHash('md5').update(fileName).digest('hex');
    const key = `${rifLavorazione}/${tipologiaFile}/${md5Hash}${fileExt}`;

    event.sender.send('upload-progress', { 
      currentFile: fileName, 
      fileProgress: 0, 
      completed, 
      total: totalFiles, 
      overallProgress: Math.round((completed / totalFiles) * 100) 
    });

    try {
      const fileContent = fs.readFileSync(filePath);

      // Simulate file progress (since PutObject is atomic, we'll just set to 50% then 100%)
      event.sender.send('upload-progress', { 
        currentFile: fileName, 
        fileProgress: 50, 
        completed, 
        total: totalFiles, 
        overallProgress: Math.round((completed / totalFiles) * 100) 
      });

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
      });

      await s3Client.send(command);
      logger.info(`Successfully uploaded ${fileName} with key ${key}`);
      results.push({ file: fileName, key: key, status: 'success' });

      event.sender.send('upload-progress', { 
        currentFile: fileName, 
        fileProgress: 100, 
        completed: completed + 1, 
        total: totalFiles, 
        overallProgress: Math.round(((completed + 1) / totalFiles) * 100) 
      });

    } catch (error) {
      logger.error(`Failed to upload ${fileName}: ${error.message}`);
      results.push({ file: fileName, key: key, status: 'error', error: error.message });

      event.sender.send('upload-progress', { 
        currentFile: fileName, 
        fileProgress: 100, 
        completed: completed + 1, 
        total: totalFiles, 
        overallProgress: Math.round(((completed + 1) / totalFiles) * 100) 
      });
    }

    completed++;
  }
  logger.info(`Upload process completed`);
  return results;
});

ipcMain.handle('export-csv', async (event, results) => {
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
      return { success: true, filePath: result.filePath, tempPath: tempPath };
    } else {
      logger.info(`CSV export canceled by user. File remains in temp at: ${tempPath}`);
      return { success: false, filePath: tempPath, tempPath: tempPath, keepInTemp: true };
    }
  } catch (error) {
    logger.error(`Failed to export CSV: ${error.message}`);
    throw error;
  }
});