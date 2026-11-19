use crate::db::Database;
use crate::event_bus::EventBus;
use omnis_sdk::{LogLevel, PluginEvent, ReactivePlugin};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{error, info, warn};

pub struct PluginHost {
    plugins: HashMap<String, Arc<Mutex<Box<dyn ReactivePlugin>>>>,
    plugin_names: HashMap<String, String>,
    event_bus: EventBus,
    db: Arc<Database>,
}

impl PluginHost {
    pub fn new(event_bus: EventBus, db: Arc<Database>) -> Self {
        Self {
            plugins: HashMap::new(),
            plugin_names: HashMap::new(),
            event_bus,
            db,
        }
    }

    /// Register a reactive plugin instance
    pub fn register_plugin(&mut self, plugin: Box<dyn ReactivePlugin>) {
        let id = plugin.id().to_string();
        let name = plugin.name().to_string();
        info!("Registering plugin: {} ({})", name, id);
        self.plugin_names.insert(id.clone(), name);
        self.plugins.insert(id, Arc::new(Mutex::new(plugin)));
    }

    /// Return list of currently loaded plugin IDs and names
    pub fn loaded_plugins(&self) -> Vec<(String, String)> {
        // Safe synchronous inspection: return pairs of (id, display_name)
        self.plugins
            .keys()
            .map(|id| {
                let name = self
                    .plugin_names
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| id.clone());
                (id.clone(), name)
            })
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

    /// Dispatch an event to a specific plugin or all plugins, handling emitted results asynchronously
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
                Self::process_plugin_event(plugin_arc, event_clone, db, event_bus).await;
            });
        }
    }

    /// Dispatch an event and await full completion across all plugin targets without race conditions
    pub async fn dispatch_event_and_wait(&self, target_id: Option<&str>, event: PluginEvent) {
        self.dispatch_event_filtered_and_wait(|id| target_id.is_none_or(|t| t == id), event)
            .await;
    }

    /// Dispatch an event to plugins matching a predicate and await full completion in parallel
    pub async fn dispatch_event_filtered_and_wait<F>(&self, predicate: F, event: PluginEvent)
    where
        F: Fn(&str) -> bool,
    {
        let _ = self.event_bus.publish(event.clone());

        let targets: Vec<Arc<Mutex<Box<dyn ReactivePlugin>>>> = self
            .plugins
            .iter()
            .filter(|(id, _)| predicate(id.as_str()))
            .map(|(_, p)| p.clone())
            .collect();

        let mut handles = Vec::new();
        for plugin_arc in targets {
            let event_clone = event.clone();
            let db = self.db.clone();
            let event_bus = self.event_bus.clone();

            handles.push(tokio::spawn(async move {
                Self::process_plugin_event(plugin_arc, event_clone, db, event_bus).await;
            }));
        }

        for handle in handles {
            let _ = handle.await;
        }
    }

    async fn process_plugin_event(
        plugin_arc: Arc<Mutex<Box<dyn ReactivePlugin>>>,
        event: PluginEvent,
        db: Arc<Database>,
        event_bus: EventBus,
    ) {
        let mut plugin = plugin_arc.lock().await;
        match plugin.handle_event(event).await {
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
                        PluginEvent::NotificationEmitted { level, message } => match level {
                            LogLevel::Trace => tracing::trace!("[Plugin] {}", message),
                            LogLevel::Debug => tracing::debug!("[Plugin] {}", message),
                            LogLevel::Info => tracing::info!("[Plugin] {}", message),
                            LogLevel::Warn => tracing::warn!("[Plugin] {}", message),
                            LogLevel::Error => tracing::error!("[Plugin] {}", message),
                        },
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use omnis_sdk::PluginSettingsSchema;

    struct MockTestPlugin {
        id: &'static str,
        name: &'static str,
        dispatched_count: Arc<std::sync::atomic::AtomicUsize>,
    }

    #[async_trait]
    impl ReactivePlugin for MockTestPlugin {
        fn id(&self) -> &'static str {
            self.id
        }
        fn name(&self) -> &'static str {
            self.name
        }
        fn settings_schema(&self) -> Option<PluginSettingsSchema> {
            None
        }
        async fn initialize(&mut self, _config_json: &str) -> Result<(), String> {
            Ok(())
        }
        async fn handle_event(&mut self, _event: PluginEvent) -> Result<Vec<PluginEvent>, String> {
            self.dispatched_count
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            Ok(Vec::new())
        }
    }

    #[tokio::test]
    async fn test_dispatch_event_filtered_and_wait() {
        let db = Arc::new(Database::new_in_memory().unwrap());
        let event_bus = EventBus::new(16);
        let mut host = PluginHost::new(event_bus, db);

        let count_steam = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count_epic = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let count_gog = Arc::new(std::sync::atomic::AtomicUsize::new(0));

        host.register_plugin(Box::new(MockTestPlugin {
            id: "steam",
            name: "Steam",
            dispatched_count: count_steam.clone(),
        }));
        host.register_plugin(Box::new(MockTestPlugin {
            id: "epic",
            name: "Epic",
            dispatched_count: count_epic.clone(),
        }));
        host.register_plugin(Box::new(MockTestPlugin {
            id: "gog",
            name: "GOG",
            dispatched_count: count_gog.clone(),
        }));

        let connected = ["steam", "gog"];

        // Filter out connected stores: only epic should receive the event
        host.dispatch_event_filtered_and_wait(
            |plugin_id| !connected.contains(&plugin_id),
            PluginEvent::SyncRequested {
                library_id: "all".to_string(),
                force_full: false,
            },
        )
        .await;

        assert_eq!(count_steam.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert_eq!(count_gog.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert_eq!(count_epic.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

