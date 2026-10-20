use std::path::Path;

/// Automatically generates README.txt documentation and example plugin scaffolds
pub fn scaffold_plugins_directory(dir: &Path) {
    let readme_path = dir.join("README.txt");
    if !readme_path.exists() {
        let readme_content = r#"================================================================================
 OMNIS GAME LIBRARY - CARTELLA PLUGINS & ESTENSIONI (PLAYNITE COMPATIBLE)
================================================================================

Questa cartella ospita i plugin, le estensioni e le configurazioni esterne 
riconosciute automaticamente a runtime dal motore di Omnis Game Library.

--- STRUTTURA DELLA CARTELLA ---
Ogni plugin esterno deve risiedere all'interno di una propria sottocartella contenente
obbligatoriamente un file di manifest denominato "manifest.json" (o "extension.yaml").

Esempio di struttura:
  plugins/
  ├── README.txt
  ├── pipeline_config.json
  └── metacritic_provider/
      ├── manifest.json
      ├── index.js (script o binario del plugin)
      └── settings.json (generato automaticamente per salvare le API Key / opzioni)

--- ESEMPIO DI MANIFEST.JSON ---
{
  "id": "metacritic_provider",
  "name": "Metacritic Community Scraper",
  "version": "1.0.0",
  "author": "Omnis Community / Playnite Bridge",
  "description": "Provider esterno per l'estrazione di voti e recensioni da Metacritic per titoli PC e console.",
  "type": "metadata",
  "website": "https://www.metacritic.com",
  "requires_api_key": false,
  "supported_fields": [
    "critic_score",
    "community_score",
    "description"
  ],
  "entry_point": "index.js"
}

--- COME INSTALLARE UN NUOVO PLUGIN ---
1. Scarica la cartella del plugin (o scompatta l'archivio ZIP).
2. Incolla la cartella all'interno di questa directory ("plugins").
3. Assicurati che contenga il file "manifest.json".
4. Nell'interfaccia di Omnis (Centro Plugin), clicca sul pulsante "Ricarica Plugin da Disco".
5. Il plugin apparirà immediatamente nell'elenco contrassegnato dal badge [PLUGIN ESTERNO]!
"#;
        let _ = std::fs::write(&readme_path, readme_content);

        // Scaffold an example Metacritic provider plugin folder if not exists on initial first run
        let sample_dir = dir.join("metacritic_provider");
        if !sample_dir.exists() {
            let _ = std::fs::create_dir_all(&sample_dir);
            let manifest_path = sample_dir.join("manifest.json");
            let manifest_content = r#"{
  "id": "metacritic_provider",
  "name": "Metacritic Community Scraper",
  "version": "1.0.0",
  "author": "Omnis Community / Playnite Bridge",
  "description": "Provider esterno per l'estrazione di voti e recensioni critiche globali da Metacritic.",
  "type": "metadata",
  "website": "https://www.metacritic.com",
  "requires_api_key": false,
  "supported_fields": [
    "critic_score",
    "community_score",
    "description"
  ],
  "entry_point": "index.js"
}"#;
            let _ = std::fs::write(&manifest_path, manifest_content);

            let index_path = sample_dir.join("index.js");
            let index_content = r#"// Omnis Game Library - Metacritic Community Scraper v1.0.0
// Script di esempio per estrazione metadati da fonti esterne
module.exports = {
  async fetchMetadata(query) {
    console.log(`[Metacritic Scraper] Ricerca voti per: ${query.title}`);
    return {
      critic_score: 92,
      description: `Metadati arricchiti da Metacritic per ${query.title}`
    };
  }
};
"#;
            let _ = std::fs::write(&index_path, index_content);
        }
    }
}
