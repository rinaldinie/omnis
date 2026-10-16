use omnis_sdk::PluginEvent;
use tokio::sync::broadcast;

/// Non-blocking reactive event bus for host and plugin communication
#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<PluginEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Broadcast an event to all active listeners
    pub fn publish(&self, event: PluginEvent) -> Result<usize, Box<broadcast::error::SendError<PluginEvent>>> {
        self.sender.send(event).map_err(Box::new)
    }


    /// Subscribe to the reactive event stream
    pub fn subscribe(&self) -> broadcast::Receiver<PluginEvent> {
        self.sender.subscribe()
    }
}
