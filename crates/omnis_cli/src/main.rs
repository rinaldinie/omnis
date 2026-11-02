use clap::{Parser, Subcommand};
use omnis_core::{Database, EventBus, PluginHost};
use omnis_plugin_epic::EpicLibraryPlugin;
use omnis_plugin_steam::SteamPlugin;
use omnis_sdk::PluginEvent;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

#[derive(Parser)]
#[command(
    name = "omnis-cli",
    about = "CLI driver for Omnis Game Library",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Synchronize game library from installed plugins
    Sync {
        /// Store/library to sync, or 'all' for all registered plugins
        #[arg(long, default_value = "all")]
        library: String,
        /// Force full scan rather than incremental
        #[arg(long)]
        force: bool,
    },
    /// List all games in the database catalog
    List,
    /// Display Omnis engine and database statistics
    Stats,
    /// Import games from a Playnite 10 JSON export
    ImportPlaynite {
        /// Path to the exported JSON file
        file: PathBuf,
        /// Validate and simulate without writing to database
        #[arg(long)]
        dry_run: bool,
    },
    /// Print PowerShell / C# script to export Playnite library
    PlayniteExporterScript,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    let cmd = cli.command.unwrap_or(Commands::List);

    // Fast-path commands that do not need DB, plugins, or logging
    if matches!(cmd, Commands::PlayniteExporterScript) {
        println!("{}", omnis_core::export_csharp_script());
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let start_total = Instant::now();
    let app_dir = dirs_or_local();
    std::fs::create_dir_all(&app_dir)?;
    let db_path = app_dir.join("library.db");

    let t_db = Instant::now();
    let db = Arc::new(Database::open(&db_path)?);
    let db_open_duration = t_db.elapsed();

    let event_bus = EventBus::new(256);
    let mut host = PluginHost::new(event_bus.clone(), db.clone());
    // Register built-in first-party integration plugins (Tier 0)
    host.register_plugin(Box::new(SteamPlugin::new()));
    host.register_plugin(Box::new(EpicLibraryPlugin::new()));
    host.initialize_all().await?;

    match cmd {
        Commands::Sync { library, force } => {
            let plugin_count = host.plugin_count();
            if plugin_count == 0 {
                eprintln!("\n⚠️ No library integration plugins are registered.");
                return Err("No plugins registered".into());
            }

            let supported_libraries = ["all", "steam", "epic"];
            if !supported_libraries.contains(&library.as_str()) {
                eprintln!(
                    "\n❌ Store '{}' is not supported for local CLI sync.",
                    library
                );
                eprintln!("Currently supported local stores: steam, epic.");
                eprintln!("Cloud stores (GOG, Xbox) require OAuth authentication: please sync them via the Omnis desktop app.");
                return Err(format!("Unsupported library '{}'", library).into());
            }

            info!(
                "Starting library synchronization across {} plugins...",
                plugin_count
            );
            let t_sync = Instant::now();
            host.dispatch_event_and_wait(
                None,
                PluginEvent::SyncRequested {
                    library_id: library,
                    force_full: force,
                },
            )
            .await;

            let total_games = db.count_games()?;
            println!(
                "\n✅ Sync completed in {:.2}ms! Total games in database: {}",
                t_sync.elapsed().as_secs_f64() * 1000.0,
                total_games
            );
        }
        Commands::List => {
            let games = db.get_all_games()?;
            println!("\n🎮 ================== OMNIS GAME LIBRARY ================== 🎮");
            println!("Database: {}\n", db_path.display());

            if games.is_empty() {
                println!("No games found in database. Sync your games with 'omnis-cli sync' or launch the Omnis desktop app.");
            } else {
                println!(
                    "{:<36} | {:<8} | {:<40} | {:<9}",
                    "ID", "STORE", "TITLE", "STATUS"
                );
                println!("{:-<36}-+-{:-<8}-+-{:-<40}-+-{:-<9}", "", "", "", "");

                for g in &games {
                    let status = if g.is_installed { "Installed" } else { "Cloud" };
                    let truncated_title = truncate_title(&g.title);
                    println!(
                        "{:<36} | {:<8} | {:<40} | {:<9}",
                        g.id, g.library_id, truncated_title, status
                    );
                }
            }

            println!(
                "\nTotal titles: {} (Loaded in {:.2}ms)",
                games.len(),
                db_open_duration.as_secs_f64() * 1000.0
            );
        }
        Commands::Stats => {
            let count = db.count_games()?;
            println!("\n📊 Omnis Game Library Engine Statistics:");
            println!("  Database Engine: SQLite 3 WAL Mode");
            println!("  Database Path: {}", db_path.display());
            println!("  Total Catalog Titles: {}", count);
            println!("  Installed Plugins: {}", host.plugin_count());
            println!(
                "  Cold Startup Latency: {:.2}ms",
                start_total.elapsed().as_secs_f64() * 1000.0
            );
        }
        Commands::ImportPlaynite { file, dry_run } => {
            let file_path = file.to_string_lossy().to_string();
            let cache_dir = app_dir.join("cache").join("images");

            let options = omnis_core::PlayniteImportOptions {
                dry_run,
                image_cache_dir: Some(cache_dir),
            };

            info!(
                "Starting Playnite 10 library import from '{}' (dry_run: {})...",
                file_path, dry_run
            );
            let t_import = Instant::now();

            match db.import_playnite_from_file(&file_path, &options) {
                Ok(stats) => {
                    println!(
                        "\n🎮 ================== PLAYNITE IMPORT REPORT ================== 🎮"
                    );
                    println!("Source File:          {}", file_path);
                    println!("Dry-Run Mode:         {}", dry_run);
                    println!("Total Games Read:     {}", stats.total_read);
                    println!("New Games Created:    {}", stats.games_created);
                    println!("Existing Merged:      {}", stats.games_merged);
                    println!("Playtime Updated:     {}", stats.playtime_updated);
                    println!("Images Cached:        {}", stats.images_cached);
                    println!("Tags Associated:      {}", stats.tags_added);
                    println!("Categories Linked:    {}", stats.categories_added);
                    println!(
                        "Elapsed Duration:     {:.2}ms",
                        t_import.elapsed().as_secs_f64() * 1000.0
                    );
                    println!("===============================================================");
                    if dry_run {
                        println!("ℹ️ Dry-run completed: No modifications were committed to the database.");
                    } else {
                        println!("✅ Playnite library successfully imported and indexed!");
                    }
                }
                Err(e) => {
                    eprintln!("\n❌ Failed to import Playnite library: {}", e);
                }
            }
        }
        Commands::PlayniteExporterScript => {
            println!("{}", omnis_core::export_csharp_script());
        }
    }

    Ok(())
}

fn dirs_or_local() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let local_data = exe_dir.join("data");
            if local_data.is_dir() || exe_dir.join("portable.txt").exists() {
                return local_data;
            }
        }
    }

    #[cfg(windows)]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let canonical = PathBuf::from(&appdata).join("Omnis Game Library");
            if canonical.exists() {
                return canonical;
            }
        }
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let tauri_path = PathBuf::from(&local_app_data).join("com.omnis.gamelibrary");
            let legacy_path = PathBuf::from(&local_app_data).join("OmnisGameLibrary");
            if tauri_path.exists() {
                return tauri_path;
            } else if legacy_path.exists() {
                return legacy_path;
            }
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            return PathBuf::from(&appdata).join("Omnis Game Library");
        }
    }

    PathBuf::from("./data")
}

fn truncate_title(title: &str) -> String {
    let char_count = title.chars().count();
    if char_count > 38 {
        let prefix: String = title.chars().take(35).collect();
        format!("{}...", prefix)
    } else {
        title.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_multibyte_title() {
        let ascii = "The Legend of Zelda: Breath of the Wild";
        assert_eq!(
            truncate_title(ascii),
            "The Legend of Zelda: Breath of the ..."
        );

        let japanese =
            "ペルソナ5 ザ・ロイヤル (Persona 5 Royal Japanese Edition with Extra Long Title)";
        let truncated = truncate_title(japanese);
        assert!(truncated.ends_with("..."));
        assert_eq!(truncated.chars().count(), 38);

        let accented = "Pokémon Épée et Bouclier Édition Spéciale Version Complète";
        let truncated_accented = truncate_title(accented);
        assert!(truncated_accented.ends_with("..."));
        assert_eq!(truncated_accented.chars().count(), 38);

        let short = "Short Title";
        assert_eq!(truncate_title(short), "Short Title");
    }

    #[test]
    fn test_cli_parse() {
        use clap::CommandFactory;
        Cli::command().debug_assert();
    }
}
