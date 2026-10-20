import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Sparkles,
  ArrowUpCircle,
  ExternalLink,
  ShieldCheck,
  Check,
} from "lucide-react";

export interface MarketplacePlatformAsset {
  download_url: string;
  filename: string;
  sha256?: string;
  size_bytes?: number;
}

export interface MarketplacePluginItem {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  plugin_type: "metadata" | "library" | string;
  requires_api_key?: boolean;
  icon_url?: string;
  platforms?: Record<string, MarketplacePlatformAsset>;
  is_installed: boolean;
  installed_version?: string;
  has_update: boolean;
}

export interface MarketplaceCatalog {
  version: string;
  updated_at: string;
  plugins: MarketplacePluginItem[];
}

interface MarketplaceTabProps {
  onPluginInstalled?: () => void;
}

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`[Tauri Mock / Error] ${cmd}:`, err);
    throw err;
  }
  return null;
}

export const MarketplaceTab: React.FC<MarketplaceTabProps> = ({ onPluginInstalled }) => {
  const [catalog, setCatalog] = useState<MarketplaceCatalog | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "metadata" | "library" | "installed">("all");
  const [operatingPluginId, setOperatingPluginId] = useState<string | null>(null);
  const [statusNotification, setStatusNotification] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await invokeTauri<MarketplaceCatalog>("get_marketplace_catalog");
      if (res) {
        setCatalog(res);
      }
    } catch (err: any) {
      console.error("Errore recupero catalogo marketplace:", err);
      setStatusNotification({
        type: "error",
        text: `Impossibile caricare il catalogo: ${err?.message || err}`,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  const handleInstall = async (plugin: MarketplacePluginItem) => {
    setOperatingPluginId(plugin.id);
    setStatusNotification({
      type: "info",
      text: `Download e installazione a caldo di "${plugin.name}" in corso...`,
    });

    try {
      await invokeTauri("install_marketplace_plugin", { pluginId: plugin.id });
      setStatusNotification({
        type: "success",
        text: `"${plugin.name}" installato e attivato a caldo con successo!`,
      });
      await loadCatalog();
      if (onPluginInstalled) {
        onPluginInstalled();
      }
    } catch (err: any) {
      console.error("Installazione fallita:", err);
      setStatusNotification({
        type: "error",
        text: `Errore installazione per ${plugin.name}: ${err?.message || err}`,
      });
    } finally {
      setOperatingPluginId(null);
    }
  };

  const handleUninstall = async (plugin: MarketplacePluginItem) => {
    setOperatingPluginId(plugin.id);
    setStatusNotification({
      type: "info",
      text: `Disattivazione e rimozione di "${plugin.name}" in corso...`,
    });

    try {
      await invokeTauri("uninstall_marketplace_plugin", { pluginId: plugin.id });
      setStatusNotification({
        type: "success",
        text: `"${plugin.name}" disinstallato con successo.`,
      });
      await loadCatalog();
      if (onPluginInstalled) {
        onPluginInstalled();
      }
    } catch (err: any) {
      console.error("Disinstallazione fallita:", err);
      setStatusNotification({
        type: "error",
        text: `Errore disinstallazione per ${plugin.name}: ${err?.message || err}`,
      });
    } finally {
      setOperatingPluginId(null);
    }
  };

  const filteredPlugins = useMemo(() => {
    if (!catalog?.plugins) return [];
    return catalog.plugins.filter((p) => {
      // Category filter
      if (categoryFilter === "metadata" && p.plugin_type !== "metadata") return false;
      if (categoryFilter === "library" && p.plugin_type !== "library") return false;
      if (categoryFilter === "installed" && !p.is_installed) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesDesc = p.description.toLowerCase().includes(q);
        const matchesAuthor = p.author.toLowerCase().includes(q);
        const matchesId = p.id.toLowerCase().includes(q);
        return matchesName || matchesDesc || matchesAuthor || matchesId;
      }
      return true;
    });
  }, [catalog, categoryFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Banner di Benvenuto & Info Marketplace */}
      <div
        className="p-4 rounded-2xl border flex items-center justify-between gap-4 shadow-sm"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md"
            style={{
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              color: "var(--accent-primary)",
            }}
          >
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>Community Plugin Hub</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Hot-Reload Runtime
              </span>
            </h4>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Estendi Omnis con provider di metadati nativi (.dll / .so) e scanner di libreria con 1-click. Nessun riavvio richiesto!
            </p>
          </div>
        </div>

        <button
          onClick={loadCatalog}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 shrink-0"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Aggiorna catalogo marketplace"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} />
          <span className="hidden sm:inline">Aggiorna Catalogo</span>
        </button>
      </div>

      {/* Notifica di Stato Interazione */}
      {statusNotification && (
        <div
          className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all ${
            statusNotification.type === "success"
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : statusNotification.type === "error"
              ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
              : "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotification.type === "success" && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {statusNotification.type === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
            {statusNotification.type === "info" && <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />}
            <span>{statusNotification.text}</span>
          </div>
          <button
            onClick={() => setStatusNotification(null)}
            className="text-[11px] opacity-70 hover:opacity-100 font-normal px-1.5 py-0.5 rounded hover:bg-white/10"
          >
            ✕
          </button>
        </div>
      )}

      {/* Toolbar: Ricerca e Filtri Categoria */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
        {/* Barra di ricerca */}
        <div
          className="relative flex-1 w-full flex items-center rounded-xl border px-3 py-2 text-xs"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <Search className="w-3.5 h-3.5 mr-2" style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            placeholder="Cerca plugin community per nome, autore o descrizione..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none outline-none text-white text-xs placeholder:text-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded"
            >
              ✕
            </button>
          )}
        </div>

        {/* Categorie */}
        <div
          className="flex p-1 rounded-xl border shrink-0 text-xs font-bold"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            onClick={() => setCategoryFilter("all")}
            className="px-3 py-1 rounded-lg transition-all"
            style={{
              backgroundColor: categoryFilter === "all" ? "var(--accent-primary)" : "transparent",
              color: categoryFilter === "all" ? "#fff" : "var(--text-muted)",
            }}
          >
            Tutti ({catalog?.plugins.length || 0})
          </button>
          <button
            onClick={() => setCategoryFilter("metadata")}
            className="px-3 py-1 rounded-lg transition-all"
            style={{
              backgroundColor: categoryFilter === "metadata" ? "var(--accent-primary)" : "transparent",
              color: categoryFilter === "metadata" ? "#fff" : "var(--text-muted)",
            }}
          >
            Metadati
          </button>
          <button
            onClick={() => setCategoryFilter("library")}
            className="px-3 py-1 rounded-lg transition-all"
            style={{
              backgroundColor: categoryFilter === "library" ? "var(--accent-primary)" : "transparent",
              color: categoryFilter === "library" ? "#fff" : "var(--text-muted)",
            }}
          >
            Librerie
          </button>
          <button
            onClick={() => setCategoryFilter("installed")}
            className="px-3 py-1 rounded-lg transition-all"
            style={{
              backgroundColor: categoryFilter === "installed" ? "var(--accent-primary)" : "transparent",
              color: categoryFilter === "installed" ? "#fff" : "var(--text-muted)",
            }}
          >
            Installati ({catalog?.plugins.filter((p) => p.is_installed).length || 0})
          </button>
        </div>
      </div>

      {/* Griglia Schede Plugin */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Caricamento catalogo community in corso...
          </p>
        </div>
      ) : filteredPlugins.length === 0 ? (
        <div
          className="py-12 rounded-2xl border flex flex-col items-center justify-center space-y-2 text-center"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <Package className="w-8 h-8 opacity-30 text-gray-400 mb-1" />
          <p className="text-sm font-bold text-white">Nessun plugin trovato</p>
          <p className="text-xs max-w-sm" style={{ color: "var(--text-muted)" }}>
            Nessun plugin corrisponde ai criteri di ricerca o filtro selezionati. Prova a modificare i termini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredPlugins.map((plugin) => {
            const isOperating = operatingPluginId === plugin.id;

            return (
              <div
                key={plugin.id}
                className="p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all hover:border-indigo-500/50 shadow-md relative group"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: plugin.is_installed ? "rgba(16, 185, 129, 0.3)" : "var(--border-color)",
                }}
              >
                {/* Header Scheda */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md shrink-0"
                        style={{
                          backgroundColor:
                            plugin.plugin_type === "metadata"
                              ? "rgba(147, 51, 234, 0.2)"
                              : "rgba(59, 130, 246, 0.2)",
                          color:
                            plugin.plugin_type === "metadata" ? "#c084fc" : "#60a5fa",
                          border: `1px solid ${
                            plugin.plugin_type === "metadata"
                              ? "rgba(147, 51, 234, 0.35)"
                              : "rgba(59, 130, 246, 0.35)"
                          }`,
                        }}
                      >
                        {plugin.plugin_type === "metadata" ? (
                          <Layers className="w-5 h-5" />
                        ) : (
                          <Package className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors">
                          {plugin.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          <span>di {plugin.author}</span>
                          <span>•</span>
                          <span className="font-mono">v{plugin.version}</span>
                        </div>
                      </div>
                    </div>

                    {/* Badge Tipo & Stato */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                        style={{
                          backgroundColor:
                            plugin.plugin_type === "metadata"
                              ? "rgba(147, 51, 234, 0.2)"
                              : "rgba(59, 130, 246, 0.2)",
                          color:
                            plugin.plugin_type === "metadata" ? "#c084fc" : "#60a5fa",
                        }}
                      >
                        {plugin.plugin_type === "metadata" ? "Metadati" : "Libreria"}
                      </span>

                      {plugin.is_installed ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Installato
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                          Disponibile
                        </span>
                      )}

                      {plugin.requires_api_key ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Richiede API Key
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          Zero-Config
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Descrizione */}
                  <p
                    className="text-xs line-clamp-2 leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {plugin.description}
                  </p>
                </div>

                {/* Footer Scheda con Azioni */}
                <div
                  className="pt-2 border-t flex items-center justify-between gap-2"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <div className="flex items-center gap-1.5">
                    {plugin.is_installed && plugin.has_update && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <ArrowUpCircle className="w-3 h-3" />
                        Aggiornamento
                      </span>
                    )}
                    {plugin.is_installed && (
                      <span className="text-[10px] text-gray-400 font-mono">
                        v{plugin.installed_version || plugin.version}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {plugin.is_installed ? (
                      <>
                        {plugin.has_update && (
                          <button
                            onClick={() => handleInstall(plugin)}
                            disabled={isOperating}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all bg-amber-500 text-black hover:bg-amber-400 shadow-md disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3 h-3 ${isOperating ? "animate-spin" : ""}`} />
                            <span>Aggiorna</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleUninstall(plugin)}
                          disabled={isOperating}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all border text-rose-400 hover:bg-rose-500/15 border-rose-500/30 disabled:opacity-50"
                          title="Disinstalla plugin e rimuovi dalla memoria a caldo"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Disinstalla</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleInstall(plugin)}
                        disabled={isOperating}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all text-white shadow-md hover:brightness-110 disabled:opacity-50"
                        style={{
                          backgroundColor: "var(--accent-primary)",
                        }}
                      >
                        {isOperating ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Installazione...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Installa Plugin</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
