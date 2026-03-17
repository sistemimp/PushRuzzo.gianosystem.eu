# Distribuzione dell'Applicazione

## Preparazione per la Distribuzione

Prima di condividere gli eseguibili con altri utenti, segui questi step:

### Step 1: Configurazione Precompilata (Opzionale)

Se desideri distribuire l'app con configurazione pre-impostata:

1. Modifica il file `.env` con i tuoi parametri
2. Ricompila con `npm run build`
3. Distribuisci gli eseguibili dalla cartella `dist/`

### Step 2: Preparazione del Pacchetto di Distribuzione

Crea una cartella di distribuzione con:

```
PushRuzzo_S3_Uploader/
├── PushRuzzo S3 Uploader Setup 1.0.0.exe
├── PushRuzzo S3 Uploader-1.0.0-portable.exe
├── .env.example
├── README.md
└── INSTALL_GUIDE.txt
```

### Step 3: Guida di Installazione (INSTALL_GUIDE.txt)

```
GUIDA DI INSTALLAZIONE - PushRuzzo S3 Uploader
==============================================

REQUISITI SISTEMA:
- Windows 7 o superiore
- 200 MB di spazio su disco
- Connessione internet

OPZIONE 1 - INSTALLER (Consigliato per gli utenti)
1. Esegui "PushRuzzo S3 Uploader Setup 1.0.0.exe"
2. Segui la procedura guidata
3. L'app sarà disponibile nel menu Start

OPZIONE 2 - PORTABLE (Per utilizzo temporaneo)
1. Esegui "PushRuzzo S3 Uploader-1.0.0-portable.exe"
2. Nessuna installazione necessaria
3. Perfetto per USB o utilizzo temporaneo

CONFIGURAZIONE:
1. Copia il file ".env.example" in ".env"
2. Modifica i parametri AWS:
   - AWS_REGION: regione AWS (es: eu-south-1)
   - AWS_ACCESS_KEY_ID: tua access key
   - AWS_SECRET_ACCESS_KEY: tua secret key
   - S3_BUCKET: nome del bucket S3

PRIMA ESECUZIONE:
1. Avvia l'applicazione
2. Clicca "Test Connessione" per verificare credenziali
3. Se tutto è OK, sei pronto ad usare l'app

SUPPORTO:
Per problemi o domande, consulta la documentazione
o contatta l'amministratore di sistema.
```

## Distribuzione via Email/Cloud

### Preparazione Zip per Download

```bash
# Crea una cartella dist_package
mkdir dist_package

# Copia i file necessari
copy "dist\PushRuzzo S3 Uploader Setup 1.0.0.exe" dist_package\
copy "dist\PushRuzzo S3 Uploader-1.0.0-portable.exe" dist_package\
copy ".env.example" dist_package\
copy "README.md" dist_package\
copy "BUILD_GUIDE.md" dist_package\

# Eventualmente crea un archivio ZIP
# Su Windows: seleziona tutto in dist_package e comprime
```

## Aggiornamenti Future

### Procedura di Update

1. **Sviluppo:** Modifica il codice
2. **Versioning:** Incrementa versione in `package.json`
   ```json
   "version": "1.1.0"
   ```
3. **Build:** `npm run build`
4. **Test:** Verifica i nuovi eseguibili
5. **Release:** Condividi i nuovi `.exe` dalla cartella `dist/`

### Changelog da Comunicare

Crea un file `CHANGELOG.md` per documentare i cambiamenti:

```markdown
# Changelog

## [1.1.0] - 2026-03-17
### Added
- Nuova funzionalità X
- Miglioramento Y

### Fixed
- Bug Z

## [1.0.0] - 2026-03-17
### Initial Release
- Caricamento file su S3
- Esportazione CSV
- Test connessione
```

## Note di Sicurezza per la Distribuzione

⚠️ **ATTENZIONE - CREDENZIALI SENSIBILI**

1. **NON includere** file `.env` con credenziali reali
2. Distribuisci solo `.env.example` template
3. Istruisci gli utenti a creare il loro `.env` locale
4. Usa credenziali con permessi AWS limitati
5. Considera di rigenerare le credenziali periodicamente

## Script di Deployment Automatico

Se desideri automatizzare la distribuzione, puoi aggiungere:

```bash
# npm script nel package.json
"deploy": "npm run build && (rmdir dist_package /s /q || true) && mkdir dist_package && copy dist\\*.exe dist_package\\ && copy .env.example dist_package\\ && copy README.md dist_package\\"
```

Quindi esegui: `npm run deploy`

## Verifica Finale

Prima di distribuire, verifica:

- ✅ Gli eseguibili si avviano correttamente
- ✅ Il file `.env.example` è incluso
- ✅ La documentazione è completa
- ✅ Il file di log viene creato correttamente
- ✅ L'esportazione CSV funziona
- ✅ Nessuna credenziale sensibile è inclusa
