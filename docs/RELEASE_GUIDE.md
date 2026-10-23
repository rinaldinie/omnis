# 🚀 Guida Operativa di Rilascio & Aggiornamento Automatico
*Omnis Game Library — Architettura di Distribuzione, Firma Crittografica e Manutenzione*

---

## 📌 Indice dei Contenuti
1. [Panoramica dell'Architettura](#1-panoramica-dellarchitettura)
2. [Gestione delle Chiavi Crittografiche (Ed25519 / Minisign)](#2-gestione-delle-chiavi-crittografiche-ed25519--minisign)
3. [Comandi Rapidi di Release](#3-comandi-rapidi-di-release)
4. [Procedura di Test in Locale (Server Mock)](#4-procedura-di-test-in-locale-server-mock)
5. [Procedura di Rilascio su Local/GitHub Interno (Gitea)](#5-procedura-di-rilascio-su-local-github-interno-gitea)
6. [Procedura di Migrazione Finale su GitHub](#6-procedura-di-migrazione-finale-su-github)
7. [Guida alla Risoluzione Problemi (Troubleshooting)](#7-guida-alla-risoluzione-problemi-troubleshooting)

---

## 1. Panoramica dell'Architettura

Omnis Game Library integra un sistema di aggiornamento automatico nativo basato su **Tauri v2** (`tauri-plugin-updater`) e un client reattivo in **React & TypeScript**.

### Flusso di Distribuzione ed Esecuzione

```
┌────────────────────────┐
│  Sviluppatore / CI-CD   │
└───────────┬────────────┘
            │  1. npm run release:patch
            │  2. Build & Firma con chiave privata
            ▼
┌────────────────────────┐
│  Asset di Release      │
│  - latest.json         │
│  - Installer (.zip/.gz)│
│  - Firme (.sig)        │
└───────────┬────────────┘
            │
            ├───────────────────────────────┐
            ▼                               ▼
┌────────────────────────┐      ┌────────────────────────┐
│ Local/GitHub Gitea Locale   │      │ GitHub Releases Pubb.  │
│ (Ambiente Intranet)    │      │ (Distribuzione Prod)   │
│ http://localhost:8080.. │      │ https://github.com/... │
└───────────┬────────────┘      └───────────┬────────────┘
            │                               │
            └───────────────┬───────────────┘
                            ▼
              ┌───────────────────────────┐
              │    Client Omnis Desktop   │
              │  - Check silenzioso all'avvio
              │  - Scheda Impostazioni    │
              │  - Verifica firma Minisign│
              │  - Download & Riavvio     │
              └───────────────────────────┘
```

### Componenti Chiave del Sistema
- **Manifest `latest.json`**: File JSON pubblico che definisce la versione corrente, le note di rilascio e gli URL di download con le rispettive firme digitali per ciascuna piattaforma (Windows, Linux, macOS).
- **Crittografia Minisign / Ed25519**: Nessun aggiornamento può essere installato se non firmato crittograficamente con la chiave privata corrispondente alla chiave pubblica memorizzata nell'applicazione.
- **Failover a Doppio Endpoint**: `tauri.conf.json` definisce una sequenza ordinata di endpoint:
  1. `https://github.com/rinaldinie/omins/releases/latest/download/latest.json` (server locale di sviluppo)
  2. `https://github.com/rinaldinie/omins/releases/latest/download/latest.json` (repository GitHub pubblico)
- **Frontend Hook (`useAppUpdater`)**: Gestisce gli stati del ciclo di vita (`idle`, `checking`, `upToDate`, `available`, `downloading`, `readyToInstall`, `error`), visualizza i byte scaricati in tempo reale e notifica l'utente tramite toast non invasivo o interfaccia in Impostazioni.

---

## 2. Gestione delle Chiavi Crittografiche (Ed25519 / Minisign)

Tauri v2 richiede una firma digitale asimmetrica per garantire che il binario scaricato non sia stato manomesso da terze parti o corrotto durante il trasferimento di rete.

### 2.1 Generazione di una Nuova Coppia di Chiavi
Se è necessario rigenerare le chiavi di firma, eseguire il comando da una console protetta:

```bash
# Eseguito dalla directory ui o root con il CLI di Tauri
npx @tauri-apps/cli signer generate -w ~/.tauri/omnis.key
```

Il comando genererà due file:
1. `~/.tauri/omnis.key`: **Chiave privata**. Deve rimanere segreta, non deve MAI essere inclusa nei commit git.
2. `~/.tauri/omnis.key.pub`: **Chiave pubblica**. Il suo contenuto va copiato in `crates/omnis_tauri/tauri.conf.json`.

> [!CAUTION]
> **Sicurezza della Chiave Privata:**  
> Non committare mai `omnis.key` nel repository Git. Conservala in un gestore di password sicuro o inseriscila come segreto nei repository remoti (`TAURI_SIGNING_PRIVATE_KEY`).

### 2.2 Chiave Pubblica Configurata
La chiave pubblica attiva per il progetto Omnis è registrata in `crates/omnis_tauri/tauri.conf.json`:

```json
"plugins": {
  "updater": {
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM4MkJFMTRFQzcxRjFFMDcKUldSZjYxRmd2a25WZXp1a1pMNEtEbmtJNW12QWJ3OUN0Ym5oR1ZBMzZ2dW5qUG14T25iRml3U2IK",
    "dangerousInsecureTransportProtocol": true,
    "endpoints": [
      "https://github.com/rinaldinie/omins/releases/latest/download/latest.json",
      "https://github.com/rinaldinie/omins/releases/latest/download/latest.json"
    ]
  }
}
```

### 2.3 Variabili d'Ambiente per la Compilazione Firmata
Durante la fase di compilazione (`tauri build`), Tauri verifica la presenza delle seguenti variabili d'ambiente per firmare automaticamente i pacchetti di rilascio:

```bash
# Linux / macOS / Bash
export TAURI_SIGNING_PRIVATE_KEY="il_contenuto_della_chiave_privata_oppure_path_al_file"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="password_se_impostata"

# Windows PowerShell
$env:TAURI_SIGNING_PRIVATE_KEY="il_contenuto_della_chiave_privata"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="password_se_impostata"
```

---

## 3. Comandi Rapidi di Release

Il repository include lo script unificato `scripts/release.js` per gestire l'incremento di versione SemVer in modo coordinato e privo di errori.

### 3.1 Comandi Disponibili

Dalla cartella principale del progetto o da `crates/omnis_tauri/ui`:

| Comando | Descrizione | Effetto |
| :--- | :--- | :--- |
| `npm --prefix crates/omnis_tauri/ui run release:patch` | Release di correzione bug | `0.1.0` ➔ `0.1.1` |
| `npm --prefix crates/omnis_tauri/ui run release:minor` | Nuove funzionalità retrocompatibili | `0.1.0` ➔ `0.2.0` |
| `npm --prefix crates/omnis_tauri/ui run release:major` | Modifiche architetturali incompatibili | `0.1.0` ➔ `1.0.0` |
| `node scripts/release.js 1.2.3` | Versione specifica personalizzata | Forza `1.2.3` |

### 3.2 Flag Aggiuntivi di Compilazione e Push

È possibile concatenare flag di automazione avanzata direttamente con Node:

```bash
# 1. Incrementa versione + Git commit + Tag + Compilazione firmata del bundle Tauri
node scripts/release.js patch --build

# 2. Incrementa versione + Git commit + Tag + Compilazione + Git push commit e tag su origin
node scripts/release.js minor --build --push
```

### 3.3 Cosa Fa Automaticamente lo Script
1. Legge la versione attuale da `Cargo.toml` (`[workspace.package].version`).
2. Calcola la nuova versione secondo le regole SemVer.
3. Sincronizza atomicamente i 3 file di progetto:
   - `Cargo.toml`
   - `crates/omnis_tauri/tauri.conf.json`
   - `crates/omnis_tauri/ui/package.json`
4. Esegue il commit git dedicato: `chore(release): vX.Y.Z`.
5. Crea il tag git annotato: `vX.Y.Z`.
6. (Se presente `--build`): Lancia `npm run build && npm run tauri build` in `crates/omnis_tauri/ui`.
7. (Se presente `--push`): Esegue `git push && git push --tags`.

---

## 4. Procedura di Test in Locale (Server Mock)

Prima di caricare file su Local/GitHub o GitHub, è buona prassi testare l'aggiornamento automatico in un ambiente controllato locale.

Per facilitare questo passaggio, è fornito lo script autonomo `scripts/serve-test-update.js`.

### 4.1 Architettura del Mock Server
- **Zero dipendenze esterne**: utilizza esclusivamente moduli nativi di Node.js (`http`, `fs`, `path`).
- **Porta predefinita**: `8080` (configurabile con la variabile d'ambiente `PORT`).
- **Supporto CORS**: include gli header `Access-Control-Allow-Origin: *` e `Access-Control-Allow-Methods: GET, OPTIONS, HEAD` necessari per le richieste IPC/fetch di WebView.
- **Cartella servita**: `dist-release/` nella radice del progetto.

### 4.2 Guida Passo-Passo al Test Locale

#### Passo 1: Creazione della Cartella di Test
Dalla radice del progetto:
```bash
mkdir -p dist-release
```

#### Passo 2: Creazione del Manifest `dist-release/latest.json`
Crea il file `dist-release/latest.json` simulando una nuova versione rispetto a quella attualmente in esecuzione (ad esempio, se l'app è alla `0.1.0`, imposta `0.2.0`):

```json
{
  "version": "0.2.0",
  "notes": "Test locale dell'aggiornamento automatico Omnis Game Library.\n- Nuove animazioni per la libreria\n- Miglioramento dei consumi energetici in fullscreen",
  "pub_date": "2026-10-23T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "CONTENUTO_FIRMA_SIG_BASE64",
      "url": "http://127.0.0.1:8080/Omnis_0.2.0_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "CONTENUTO_FIRMA_SIG_BASE64",
      "url": "http://127.0.0.1:8080/omnis_0.2.0_amd64.AppImage.tar.gz"
    }
  }
}
```

> [!NOTE]
> Per testare solo la schermata di notifica e il rilevamento della versione (senza procedere al download dell'eseguibile completo), la firma può essere una stringa arbitraria e il file binario non deve necessariamente essere presente. Se si desidera testare anche il download reale, copiare i file generati da `tauri build` con le rispettive firme `.sig`.

#### Passo 3: Avvio del Server Locale
```bash
node scripts/serve-test-update.js
```

Output atteso:
```text
======================================================
📡 Omnis Local Update Test Server
======================================================
URL:            http://127.0.0.1:8080
Endpoint:       http://127.0.0.1:8080/latest.json
Serving from:   /mnt/d/progetti/omnis/omnis/dist-release
======================================================
```

#### Passo 4: Temporaneo Puntamento del Client al Server Locale
In `crates/omnis_tauri/tauri.conf.json`, aggiungi temporaneamente l'indirizzo locale all'inizio dell'array `endpoints`:

```json
"endpoints": [
  "http://127.0.0.1:8080/latest.json",
  "https://github.com/rinaldinie/omins/releases/latest/download/latest.json"
]
```

#### Passo 5: Verifica del Client
1. Avvia l'app in modalità sviluppo:
   ```bash
   cd crates/omnis_tauri/ui && npm run dev
   # e in un terminale parallelo per il backend tauri se necessario:
   cargo run -p omnis_tauri
   ```
2. Entro 4 secondi dall'avvio, il componente `useAppUpdater` interrogherà il server mock:
   - Nel terminale del mock server vedrai la richiesta: `[200] Serving: latest.json`.
   - In basso a destra nell'interfaccia comparirà il toast: **"Aggiornamento disponibile: v0.2.0"**.
3. Cliccando sul toast o andando in **Impostazioni ➔ Generali**, vedrai la scheda **"Aggiornamenti & Versione"** con il pulsante per il download e le relative note di versione.

---

## 5. Procedura di Rilascio su Local/GitHub Interno (Gitea)

Il repository intranet primario è ospitato sull'istanza Gitea locale su Local/GitHub:
- **Repository**: `https://github.com/rinaldinie/omins.git`
- **Interfaccia Web**: `https://github.com/rinaldinie/omins`

### 5.1 Protocollo di Sicurezza Intranet
Poiché l'istanza Local/GitHub opera sulla rete locale senza certificato SSL pubblico (HTTP sulla porta 30142), la configurazione `tauri.conf.json` abilita esplicitamente:
```json
"dangerousInsecureTransportProtocol": true
```
Questo parametro è obbligatorio per consentire a Tauri di effettuare il download degli asset via HTTP non cifrato.

### 5.2 Passaggi per il Rilascio

#### 1. Creare la Release e il Tag Git
```bash
# Esegui il bump di versione desiderato (es. patch)
npm --prefix crates/omnis_tauri/ui run release:patch
```

#### 2. Compilare i Binari di Rilascio Firmati
Assicurati di aver esportato le chiavi di firma nell'ambiente:
```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/omnis.key)"

cd crates/omnis_tauri/ui
npm run build
npm run tauri build
```

I file generati si troveranno nelle directory:
- **Windows NSIS**: `target/release/bundle/nsis/`
  - Installer: `Omnis Game Library_<versione>_x64-setup.exe`
  - Archivio per updater: `Omnis Game Library_<versione>_x64-setup.nsis.zip`
  - Firma: `Omnis Game Library_<versione>_x64-setup.nsis.zip.sig`
- **Linux AppImage**: `target/release/bundle/appimage/`
  - Bundle: `omnis_<versione>_amd64.AppImage`
  - Archivio per updater: `omnis_<versione>_amd64.AppImage.tar.gz`
  - Firma: `omnis_<versione>_amd64.AppImage.tar.gz.sig`

Tauri genera automaticamente anche il file `target/release/bundle/updater/latest.json`.

#### 3. Caricare la Release su Gitea
1. Apri il browser all'indirizzo `https://github.com/rinaldinie/omins/releases`.
2. Fai clic su **"Nuova Release"** (New Release).
3. Seleziona il tag corrispondente appena inviato (es. `v0.1.1`).
4. Inserisci il titolo della release (es. `Omnis v0.1.1`) e la descrizione con il changelog.
5. Nella sezione allegati, trascina e rilascia:
   - `latest.json`
   - I file `.zip` e `.tar.gz` dell'updater
   - I relativi file di firma `.sig`
   - Gli installer standalone (`.exe` o `.AppImage`) per nuove installazioni
6. Pubblica la release.

L'endpoint configurato nel client risolverà automaticamente l'ultima release pubblicata:
```
https://github.com/rinaldinie/omins/releases/latest/download/latest.json
```

---

## 6. Procedura di Migrazione Finale su GitHub

Quando il progetto passerà alla fase di distribuzione pubblica, il repository principale sarà:
`https://github.com/rinaldinie/omins.git`

### 6.1 Configurazione dei Segreti su GitHub
Prima di attivare la compilazione remota, accedere alle impostazioni del repository GitHub:
`Settings > Secrets and variables > Actions > New repository secret`

Aggiungere i seguenti secret:

| Nome Secret | Valore |
| :--- | :--- |
| `TAURI_SIGNING_PRIVATE_KEY` | Il contenuto completo della chiave privata `omnis.key` (incluso `untrusted comment...`). |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | La passphrase scelta durante la generazione della chiave (se vuota, omettere). |

### 6.2 GitHub Actions Release Workflow
Crea il file `.github/workflows/release.yml` per automatizzare completamente la compilazione multipiattaforma e la pubblicazione della release alla creazione di un tag `v*`:

```yaml
name: Release Omnis Game Library

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'windows-latest'
            args: '--target x86_64-pc-windows-msvc'
          - platform: 'ubuntu-22.04'
            args: ''

    runs-on: ${{ matrix.platform }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          cache-dependency-path: crates/omnis_tauri/ui/package-lock.json

      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'windows-latest' && 'x86_64-pc-windows-msvc' || '' }}

      - name: Install Linux Dependencies (Ubuntu)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libasound2-dev

      - name: Install Frontend Dependencies
        working-directory: crates/omnis_tauri/ui
        run: npm ci

      - name: Build Frontend
        working-directory: crates/omnis_tauri/ui
        run: npm run build

      - name: Build and Sign Tauri App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: './crates/omnis_tauri'
          tagName: ${{ github.ref_name }}
          releaseName: 'Omnis Game Library ${{ github.ref_name }}'
          releaseBody: 'Consulta le note di rilascio per visualizzare tutte le novità di questa versione.'
          releaseDraft: false
          prerelease: false
          args: ${{ matrix.args }}
```

### 6.3 Aggiornamento Post-Migrazione
Dopo il passaggio a GitHub con certificati HTTPS standard:
1. In `crates/omnis_tauri/tauri.conf.json`:
   - Rimuovere o impostare su `false` l'opzione `"dangerousInsecureTransportProtocol": false`.
   - Lasciare l'endpoint GitHub come prioritario o unico.
2. Eseguire una commit di stabilizzazione: `chore: finalize production updater configuration for GitHub`.

---

## 7. Guida alla Risoluzione Problemi (Troubleshooting)

### Problema 1: `Signature verification failed`
- **Sintomo**: L'app rileva l'aggiornamento, ma durante l'installazione fallisce riportando un errore crittografico.
- **Causa**: Il pacchetto scaricato è stato firmato con una chiave privata diversa dalla chiave pubblica inserita in `tauri.conf.json` (`plugins.updater.pubkey`).
- **Soluzione**:
  1. Verifica che la variabile `TAURI_SIGNING_PRIVATE_KEY` usata durante `tauri build` sia la controparte esatta della `pubkey`.
  2. Verifica che il file `.sig` caricato insieme all'archivio contenga la firma corretta.

### Problema 2: `Insecure transport protocol not allowed`
- **Sintomo**: Impossibile interrogare l'endpoint `http://localhost:8080/...`. Errore di connessione immediato.
- **Causa**: Tauri v2 blocca per impostazione predefinita le connessioni HTTP non cifrate per gli aggiornamenti per prevenire attacchi man-in-the-middle.
- **Soluzione**:
  Verifica che in `crates/omnis_tauri/tauri.conf.json` sia presente:
  ```json
  "plugins": {
    "updater": {
      "dangerousInsecureTransportProtocol": true
    }
  }
  ```

### Problema 3: Errore 404 durante il download dell'aggiornamento
- **Sintomo**: L'applicazione trova la nuova versione, ma quando l'utente preme "Scarica e installa" compare un errore 404 o errore di download.
- **Causa**: Gli URL all'interno del manifest `latest.json` (sotto `platforms.<piattaforma>.url`) non corrispondono al nome del file caricato tra gli allegati della release o non sono raggiungibili dal client.
- **Soluzione**:
  1. Controlla il manifest `latest.json`.
  2. Assicurati che l'URL sia assoluto e accessibile (es. prova a scaricarlo con `curl -I <url>`).
  3. Controlla che le maiuscole/minuscole nel nome file corrispondano esattamente.

### Problema 4: `Permission denied (core:default / updater:default)`
- **Sintomo**: Nel browser o nei log della console Tauri compare un errore relativo ai permessi IPC del plugin updater.
- **Causa**: Mancata assegnazione dei permessi alla finestra `main` nella configurazione delle capabilities di Tauri v2.
- **Soluzione**:
  Verifica che il file `crates/omnis_tauri/capabilities/default.json` contenga:
  ```json
  {
    "permissions": [
      "core:default",
      "updater:default"
    ]
  }
  ```

### Problema 5: L'applicazione non si riavvia dopo l'aggiornamento
- **Sintomo**: Il download termina al 100%, l'utente fa clic su "Riavvia ora" ma la finestra non si riapre o rimane chiusa.
- **Causa**: Su Windows, se l'app è installata a livello di sistema (`allUsers`) potrebbero essere richiesti permessi di amministratore per sostituire i binari.
- **Soluzione**:
  1. La configurazione NSIS raccomandata in `tauri.conf.json` è impostata su `"installMode": "currentUser"`, che permette l'aggiornamento senza prompt UAC amministrativi.
  2. L'hook `useAppUpdater.ts` include una gestione di fallback a `window.location.reload()` nel caso in cui il comando nativo fallisca in ambiente di sviluppo.

---

## 8. Riepilogo dei File di Configurazione

| File | Percorso | Ruolo |
| :--- | :--- | :--- |
| **Configurazione Tauri** | `crates/omnis_tauri/tauri.conf.json` | Chiave pubblica, protocollo e URL degli endpoint |
| **Permessi Finestra** | `crates/omnis_tauri/capabilities/default.json` | Abilita i comandi IPC dell'updater (`updater:default`) |
| **Hook Frontend** | `crates/omnis_tauri/ui/src/hooks/useAppUpdater.ts` | Logica di stato, download e trigger riavvio |
| **UI Impostazioni** | `crates/omnis_tauri/ui/src/components/GeneralSettingsTab.tsx` | Scheda "Aggiornamenti & Versione" per l'utente |
| **Script di Release** | `scripts/release.js` | Incremento automatico versione, tag e commit git |
| **Server Locale di Test** | `scripts/serve-test-update.js` | Server HTTP zero-dipendenze per test su porta 8080 |
