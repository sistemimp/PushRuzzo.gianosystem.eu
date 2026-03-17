# PushRuzzo S3 Uploader

Un'applicazione Electron moderna e sicura per caricare file su Amazon S3 con struttura organizzata.

## Features

- 🔗 Test S3 connection before uploading
- 📁 Select an entire folder to upload all its files (including subfolders)
- 🔑 Automatic S3 key generation: `Rif.Lavorazione/TipologiaFile/MD5(filename).extension`
- 📊 Dual progress bars: individual file progress and overall upload progress
- 💾 Export upload results to CSV with MD5(filename) and S3 key
- 🎨 Modern, responsive UI with real-time feedback
- 🖼️ App icon and logo loaded from `assets/favicon.ico` and `assets/logo.png`

## Prerequisites

- Node.js installed
- AWS credentials configured (see below)

## Installation

### Pre-built Installers (Windows)

Due file eseguibili sono disponibili nella cartella `dist`:

1. **PushRuzzo S3 Uploader Setup 1.0.0.exe** - Installer NSIS
   - Installa l'app nel Program Files
   - Crea shortcut su Desktop e Start Menu
   - Consigliato per gli utenti finali

2. **PushRuzzo S3 Uploader-1.0.0-portable.exe** - Portable version
   - No installation required
   - Esegui direttamente senza installazione
   - Perfetto per utilizzo temporaneo o su USB

### Development Setup

1. Clone or download this project
2. Run `npm install` to install dependencies
3. Configure AWS credentials in `.env` file (copy `.env.example` and fill in your values)
4. Run `npm start` to launch the app in development mode

### Building Installers

Per creare i propri installer eseguibili:

```bash
npm install
npm run build
```

I file compilati sono salvati nella cartella `dist/`.

### Auto Update (electron-updater)

L'app è configurata per cercare aggiornamenti da:

`https://gestionale.mediaprint.it/ElectronAppUpdate/ruzzo-electron-s3-uploader/`

Per funzionare correttamente in produzione:

1. Esegui `npm run build`
2. Pubblica nella cartella del sito sia l'installer NSIS (`*.exe`) sia il file `latest.yml` generati in `dist/`
3. Mantieni entrambi i file sempre allineati alla stessa versione

Note:
- L'auto-update è disponibile nella build installabile (NSIS)
- La build portable non supporta l'aggiornamento automatico in-place

## Configuration

1. Copy `.env.example` to `.env`
2. Fill in your actual AWS credentials and S3 bucket name in the `.env` file

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
S3_BUCKET=your_bucket_name_here
CSV_UPLOAD_API_URL=
CSV_UPLOAD_API_TOKEN=
CSV_UPLOAD_TIMEOUT_MS=30000
CSV_UPLOAD_FIELD_NAME=file
```

`CSV_UPLOAD_API_URL` is optional. If configured, every generated CSV is also uploaded via `POST multipart/form-data`.
The CSV file is sent in the field defined by `CSV_UPLOAD_FIELD_NAME` (default: `file`).

## Logging

The app logs all upload activities to a file located in your system's temporary directory (`%TEMP%\electron-s3-uploader.log` on Windows).

## Usage

1. Enter the "Rif.Lavorazione" and select "Tipologia File" (Avvisi or Scansioni)
2. Click "Test Connection" to verify S3 credentials and bucket access
3. Click "Select Folder" to choose a folder
4. The app will scan all files in the selected folder (including subfolders)
5. S3 keys will be automatically generated as: `Rif.Lavorazione/TipologiaFile/MD5(filename).extension`
6. Click "Upload to S3" to upload all files
7. Monitor the dual progress bars: one for the current file being uploaded, and one for overall progress
8. After upload completes, click "Export CSV" to save the results
9. A CSV file with filename and S3 keys will be saved to your chosen location
10. A copy is also kept in the system temp folder with a timestamp

The app will upload files to the bucket specified in the `.env` file.

## Development

- Main process: `main.js`
- Renderer process: `index.html` and `renderer.js`
- Preload script: `preload.js`

## Troubleshooting

- Ensure AWS credentials are properly configured
- Check that the S3 bucket exists and you have write permissions
- Verify the region in `main.js` matches your bucket's region
