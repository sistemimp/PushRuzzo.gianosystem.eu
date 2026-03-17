# Guida all'Utilizzo dei Build

## Eseguibili Disponibili

Nella cartella `dist/` troverai due versioni dell'applicazione:

### 1. Installer NSIS (Setup)
- **File:** `PushRuzzo S3 Uploader Setup 1.0.0.exe`
- **Dimensione:** ~71 MB
- **Utilizzo:** Esegui il file e segui la procedura di installazione guidata
- **Installazione:** Crea un'app nel menu Start e sul Desktop
- **Disinstallazione:** Disponibile tramite Programmi e Funzionalità di Windows

### 2. Versione Portable
- **File:** `PushRuzzo S3 Uploader-1.0.0-portable.exe`
- **Dimensione:** ~71 MB
- **Utilizzo:** Esegui direttamente senza installazione
- **Vantaggio:** Nessuna traccia nel sistema, ideale per USB
- **Disinstallazione:** Basta eliminare l'eseguibile

## Configurazione Iniziale

Prima di utilizzare l'applicazione, devi configurare le credenziali AWS:

### Opzione 1: Configurazione Locale (**Consigliato**)

1. Individua il file `.env` nella cartella dell'app:
   - **Versione Installed:** `C:\Users\[username]\AppData\Local\PushRuzzo S3 Uploader\resources\app\.env`
   - **Versione Portable:** La stessa cartella del .exe

2. Modifica `.env` con le tue credenziali:
   ```
   AWS_REGION=eu-south-1
   AWS_ACCESS_KEY_ID=your_key_here
   AWS_SECRET_ACCESS_KEY=your_secret_here
   S3_BUCKET=your_bucket_name
   ```

### Opzione 2: Variabili d'Ambiente di Sistema

Imposta le variabili di ambiente Windows:
- `AWS_REGION=eu-south-1`
- `AWS_ACCESS_KEY_ID=your_key_here`
- `AWS_SECRET_ACCESS_KEY=your_secret_here`
- `S3_BUCKET=your_bucket_name`

## Utilizzo dell'App

1. **Avvia l'applicazione**
   - Click sul shortcut Desktop o Start Menu (versione Installed)
   - Esegui il .exe (versione Portable)

2. **Inserisci i dati**
   - Rif.Lavorazione (es: LAV-2024-001)
   - Seleziona Tipologia File (Avvisi o Scansioni)

3. **Verifica Connessione**
   - Clicca "🔗 Test Connessione"
   - Verifica che le credenziali AWS siano corrette

4. **Seleziona Cartella**
   - Clicca "📁 Seleziona Cartella"
   - Scegli una cartella con i file da caricare

5. **Upload**
   - Clicca "🚀 Upload su S3"
   - Monitora il progresso con le barre

6. **Esporta Risultati**
   - Clicca "📊 Esporta CSV" al completo
   - Scegli dove salvare il file dei risultati

## Log e Diagnostica

I log dell'app sono salvati in:
`C:\Users\[username]\AppData\Local\Temp\electron-s3-uploader.log`

Usa questo file per debug in caso di problemi.

## Nota sulla Sicurezza

⚠️ **IMPORTANTE:** Le credenziali AWS nel file `.env` non sono crittografate. 

- Non condividere il file `.env` con altri
- Non commitare il file `.env` in repository pubblici
- Usa IAM users con permessi limitati specifici per S3
- Considera di rigenerare le credenziali periodicamente

## Aggiornamenti e Ricompilazione

Per aggiornare l'app:

1. Modifica il codice sorgente
2. Incrementa la versione in `package.json`
3. Esegui `npm run build`
4. I nuovi installer saranno generati in `dist/`

## Troubleshooting

### Errore "Connessione fallita"
- Verifica credenziali AWS nel file `.env`
- Controlla la regione AWS corretta
- Verifica permessi IAM per il bucket S3

### Errore durante l'upload
- Consulta il file di log in `%TEMP%\electron-s3-uploader.log`
- Verifica che il bucket S3 esista
- Controlla lo spazio disponibile

### L'app non si avvia
- Prova la versione Portable
- Reinstalla la versione Installed
- Verifica che il file `.env` esista

## Supporto

Per problemi o suggerimenti, contatta l'amministratore di sistema.
