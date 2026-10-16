use crate::db::Database;
use crate::event_bus::EventBus;
use omnis_sdk::{LogLevel, PluginEvent, ReactivePlugin};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

pub struct PluginHost {
    plugins: HashMap<String, Arc<Mutex<Box<dyn ReactivePlugin>>>>,
    event_bus: EventBus,
    db: Arc<Database>,
}

impl PluginHost {
    pub fn new(event_bus: EventBus, db: Arc<Database>) -> Self {
        Self {
            plugins: HashMap::new(),
            event_bus,
            db,
        }
    }

    /// Register a reactive plugin instance
    pub fn register_plugin(&mut self, plugin: Box<dyn ReactivePlugin>) {
        let id = plugin.id().to_string();
        info!("Registering plugin: {} ({})", plugin.name(), id);
        self.plugins.insert(id, Arc::new(Mutex::new(plugin)));
    }

    /// Return list of currently loaded plugin IDs and names
    pub fn loaded_plugins(&self) -> Vec<(String, String)> {
        // Safe synchronous inspection: plugins map contains keys
        self.plugins
            .keys()
            .map(|id| (id.clone(), id.clone()))
            .collect()
    }

    /// Number of loaded plugins
    pub fn plugin_count(&self) -> usize {
        self.plugins.len()
    }

    /// Initialize all registered plugins
    pub async fn initialize_all(&self) -> Result<(), String> {
        for (id, plugin) in &self.plugins {
            let mut p = plugin.lock().await;
            info!("Initializing plugin {}", id);
            p.initialize("{}").await?;
        }
        Ok(())
    }

    /// Dispatch an event to a specific plugin or all plugins, handling emitted results
    pub async fn dispatch_event(&self, target_id: Option<&str>, event: PluginEvent) {
        let _ = self.event_bus.publish(event.clone());

        let targets: Vec<Arc<Mutex<Box<dyn ReactivePlugin>>>> = match target_id {
            Some(id) => self.plugins.get(id).cloned().into_iter().collect(),
            None => self.plugins.values().cloned().collect(),
        };

        for plugin_arc in targets {
            let event_clone = event.clone();
            let db = self.db.clone();
            let event_bus = self.event_bus.clone();

            tokio::spawn(async move {
                let mut plugin = plugin_arc.lock().await;
                match plugin.handle_event(event_clone).await {
                    Ok(emitted_events) => {
                        for ev in emitted_events {
                            match ev {
                                PluginEvent::BatchGamesDiscovered { library_id, games } => {
                                    info!(
                                        "Ingesting batch of {} discovered games from library '{}'",
                                        games.len(),
                                        library_id
                                    );
                                    if let Err(e) = db.ingest_discovered_batch(&games) {
                                        error!("Failed to commit game batch to SQLite: {}", e);
                                    }
                                }
                                PluginEvent::MetadataResolved { game_id, metadata } => {
                                    if let Err(e) = db.apply_metadata_patch(game_id, &metadata) {
                                        error!("Failed to update metadata in SQLite: {}", e);
                                    }
                                }
                                PluginEvent::NotificationEmitted { level, message } => {
                                    match level {
                                        LogLevel::Trace => tracing::trace!("[Plugin] {}", message),
                                        LogLevel::Debug => tracing::debug!("[Plugin] {}", message),
                                        LogLevel::Info => tracing::info!("[Plugin] {}", message),
                                        LogLevel::Warn => tracing::warn!("[Plugin] {}", message),
                                        LogLevel::Error => tracing::error!("[Plugin] {}", message),
                                    }
                                }
                                other => {
                                    let _ = event_bus.publish(other);
                                }
                            }
                        }
                    }
                    Err(err) => {
                        warn!("Plugin error handling event: {}", err);
                    }
                }
            });
        }
    }
}
