# Omnis Native Plugin Reference Template

Questo repository/cartella contiene l'implementazione di riferimento e il template iniziale per lo sviluppo di **Plugin Nativi C-ABI** per **Omnis Game Library**.

---

## 🛠️ Architettura

I plugin nativi di Omnis sono compilati come librerie dinamiche condivise (`cdylib`):
- Su **Windows**: `.dll`
- Su **Linux**: `.so`
- Su **macOS**: `.dylib`

Omnis carica le librerie a caldo in runtime tramite `libloading` e comunica con esse attraverso l'ABI C definita in `omnis_sdk`.

---

## 📋 Struttura del Progetto

```text
sample_plugin/
├── Cargo.toml      # Configurazione cdylib e dipendenze
├── README.md       # Questa guida
└── src/
    └── lib.rs      # Implementazione del trait MetadataProvider ed export macro
```

---

## 🚀 Come Compilare e Testare

1. **Compilazione in release**:
   ```bash
   cargo build --release
   ```
   Il file binario risultante si troverà in `target/release/sample_dynamic_provider.dll` (su Windows) o `libsample_dynamic_provider.so` (su Linux).

2. **Creazione del Manifest `manifest.json`**:
   Crea un file `manifest.json` nella stessa cartella:
   ```json
   {
     "id": "mio_plugin",
     "name": "Mio Plugin Custom",
     "version": "1.0.0",
     "author": "Autore",
     "description": "Recupera punteggi e descrizioni personalizzate",
     "plugin_type": "metadata",
     "requires_api_key": false,
     "supported_fields": [
       "critic_score",
       "community_score",
       "description"
     ]
   }
   ```

3. **Installazione locale per test**:
   Copia il binario compilato e il `manifest.json` nella cartella `plugins/mio_plugin/` dei dati applicativi di Omnis (`%APPDATA%/omnis/plugins/mio_plugin` su Windows).
   Al successivo avvio o apertura del Plugin Manager, il plugin verrà rilevato e caricato automaticamente.

4. **Pubblicazione nel Marketplace**:
   Per pubblicare il plugin nel Marketplace della community, segui le istruzioni nel repository ufficiale dei plugin su GitHub: [`omins-plugins`](https://github.com/rinaldinie/omins).
