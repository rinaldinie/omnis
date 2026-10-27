use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use omnis_sdk::plugin::{CloudStorePlugin, StoreAccountSession};

use crate::store_manager::StoreAccountManager;

/// Handles launching OAuth webview popup windows, injecting authentication scripts, and capturing authorization codes
pub struct OAuthLoginService;

impl OAuthLoginService {
    /// Launch OAuth login popup window in Tauri webview
    pub fn start_login(&self, app_handle: &AppHandle, store_id: &str) -> Result<(), String> {
        let label = format!("store-login-{}", store_id);

        // Bring to focus if already open
        if let Some(window) = app_handle.get_webview_window(&label) {
            let _ = window.set_focus();
            return Ok(());
        }

        let plugin = self
            .get_plugin_sync(store_id)
            .ok_or_else(|| format!("Plugin non trovato per lo store {}", store_id))?;

        let login_url = plugin.login_url();
        let parsed_url: url::Url = login_url
            .parse()
            .map_err(|e: url::ParseError| format!("URL di login non valido: {}", e))?;

        let window_url = WebviewUrl::External(parsed_url);

        let manager = self.clone();
        let app_for_nav = app_handle.clone();
        let plugin_for_nav = plugin.clone();
        let store_id_for_nav = store_id.to_string();
        let label_for_nav = label.clone();

        let is_exchanging = Arc::new(AtomicBool::new(false));

        let mut builder = WebviewWindowBuilder::new(app_handle, &label, window_url)
            .title(format!("Accesso {}", plugin.name()))
            .inner_size(850.0, 700.0)
            .resizable(true)
            .center();

        if store_id == "epic" {
            let epic_script = r#"
                (function() {
                    function extractAndForwardEpicCode() {
                        try {
                            const bodyText = document.body ? document.body.innerText : '';
                            if (bodyText && (bodyText.includes('authorizationCode') || bodyText.includes('exchangeCode'))) {
                                const parsed = JSON.parse(bodyText);
                                const code = parsed.authorizationCode || parsed.exchangeCode;
                                if (code) {
                                    window.location.href = 'https://localhost/launcher/authorized?code=' + encodeURIComponent(code);
                                } else if (parsed.redirectUrl && parsed.redirectUrl.includes('code=')) {
                                    window.location.href = parsed.redirectUrl;
                                }
                            }
                        } catch (e) {}
                    }

                    if (document.readyState === 'complete' || document.readyState === 'interactive') {
                        extractAndForwardEpicCode();
                    } else {
                        window.addEventListener('DOMContentLoaded', extractAndForwardEpicCode);
                        window.addEventListener('load', extractAndForwardEpicCode);
                    }
                    const timer = setInterval(extractAndForwardEpicCode, 300);
                    setTimeout(() => clearInterval(timer), 30000);
                })();
            "#;
            builder = builder.initialization_script(epic_script);
        }

        let builder = builder.on_navigation(move |url| {
                if plugin_for_nav.is_redirect_url(url.as_str()) {
                    if is_exchanging.swap(true, Ordering::SeqCst) {
                        return false;
                    }

                    let manager = manager.clone();
                    let app = app_for_nav.clone();
                    let plugin = plugin_for_nav.clone();
                    let sid = store_id_for_nav.clone();
                    let lbl = label_for_nav.clone();
                    let url_str = url.as_str().to_string();

                    tokio::spawn(async move {
                        match plugin.exchange_code(&url_str).await {
                            Ok(session) => {
                                if let Err(e) = manager.save_session(&sid, &session) {
                                    tracing::error!(
                                        "Errore nel salvataggio della sessione {}: {}",
                                        sid,
                                        e
                                    );
                                }
                                if let Some(win) = app.get_webview_window(&lbl) {
                                    let _ = win.close();
                                }
                                let _ = app.emit(
                                    "store-account-connected",
                                    serde_json::json!({
                                        "store_id": sid,
                                        "username": session.username,
                                    }),
                                );
                                if let Err(e) = manager.sync_store(&app, &sid).await {
                                    tracing::error!(
                                        "Errore sincronizzazione iniziale store {}: {}",
                                        sid,
                                        e
                                    );
                                }
                            }
                            Err(e) => {
                                tracing::error!("Errore scambio codice OAuth per {}: {}", sid, e);
                                if let Some(win) = app.get_webview_window(&lbl) {
                                    let _ = win.close();
                                }
                                let _ = app.emit(
                                    "store-sync-progress",
                                    StoreSyncProgressPayload {
                                        store_id: sid,
                                        current: 0,
                                        total: 0,
                                        status: "error".to_string(),
                                        message: Some(format!("Errore autenticazione: {}", e)),
                                    },
                                );
                            }
                        }
                    });

                    false
                } else {
                    true
                }
            });

        match builder.build() {
            Ok(_) => Ok(()),
            Err(e) => {
                if let Some(existing) = app_handle.get_webview_window(&label) {
                    let _ = existing.set_focus();
                    Ok(())
                } else {
                    Err(e.to_string())
                }
            }
        }
    }
}
