use omnis_core::{Database, EventBus, PluginHost};
use omnis_sdk::PluginEvent;
use std::env;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
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
    let host = PluginHost::new(event_bus.clone(), db.clone());
    host.initialize_all().await?;

    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("list");

    match cmd {
        "sync" => {
            let plugin_count = host.plugin_count();
            if plugin_count == 0 {
                println!("\n⚠️ No external integration plugins are currently installed.");
                println!("To sync games, install external integration plugins into your plugins directory.");
            } else {
                info!("Starting library synchronization across {} plugins...", plugin_count);
                let t_sync = Instant::now();
                host.dispatch_event(
                    None,
                    PluginEvent::SyncRequested {
                        library_id: "all".to_string(),
                        force_full: false,
                    },
                )
                .await;

                // Allow async tasks to finish
                tokio::time::sleep(tokio::time::Duration::from_millis(300)).await;

                let total_games = db.count_games()?;
                println!(
                    "\n✅ Sync completed in {:.2}ms! Total games in database: {}",
                    t_sync.elapsed().as_secs_f64() * 1000.0,
                    total_games
                );
            }
        }
        "list" => {
            let games = db.get_all_games()?;
            println!("\n🎮 ================== OMNIS GAME LIBRARY ================== 🎮");
            println!("Database: {}\n", db_path.display());

            if games.is_empty() {
                println!("No games found in database. Connect an external integration plugin and run 'omnis sync'.");
            } else {
                println!("{:<36} | {:<8} | {:<40} | {:<9}", "ID", "STORE", "TITLE", "STATUS");
                println!("{:-<36}-+-{:-<8}-+-{:-<40}-+-{:-<9}", "", "", "", "");

                for g in &games {
                    let status = if g.is_installed { "Installed" } else { "Cloud" };
                    let truncated_title = if g.title.len() > 38 {
                        format!("{}...", &g.title[..35])
                    } else {
                        g.title.clone()
                    };
                    println!("{:<36} | {:<8} | {:<40} | {:<9}", g.id, g.library_id, truncated_title, status);
                }
            }

            println!("\nTotal titles: {} (Loaded in {:.2}ms)", games.len(), db_open_duration.as_secs_f64() * 1000.0);
        }
        "stats" => {
            let count = db.count_games()?;
            println!("\n📊 Omnis Game Library Engine Statistics:");
            println!("  Database Engine: SQLite 3 WAL Mode");
            println!("  Database Path: {}", db_path.display());
            println!("  Total Catalog Titles: {}", count);
            println!("  Installed Plugins: {}", host.plugin_count());
            println!("  Cold Startup Latency: {:.2}ms", start_total.elapsed().as_secs_f64() * 1000.0);
        }
        _ => {
            println!("Usage: omnis <sync | list | stats>");
        }
    }

    Ok(())
}

fn dirs_or_local() -> PathBuf {
    if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
        PathBuf::from(local_app_data).join("OmnisGameLibrary")
    } else {
        PathBuf::from("./data")
    }
}
