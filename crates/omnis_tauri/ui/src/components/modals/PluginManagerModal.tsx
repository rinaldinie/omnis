import React, { useState } from "react";
import {
  Puzzle,
  RefreshCw,
  Folder,
  Sliders,
  Sparkles,
  Store,
  CheckCircle2,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle,
  ShieldCheck,
  Star,
  Scroll,
  Square,
} from "lucide-react";
import { ProviderInfo, MetadataPipelineConfig } from "../../types";
import { MarketplaceTab } from "../MarketplaceTab";

interface PluginManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  providers: ProviderInfo[];
  pipelineConfig: MetadataPipelineConfig;
  setPipelineConfig: React.Dispatch<React.SetStateAction<MetadataPipelineConfig>>;
  editingSettings: Record<string, Record<string, any>>;
  setEditingSettings: React.Dispatch<
    React.SetStateAction<Record<string, Record<string, any>>>
  >;
  showApiKey: Record<string, boolean>;
  setShowApiKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  testStatus: Record<
    string,
    { loading: boolean; success?: boolean; message?: string }
  >;
  isRefreshingPlugins: boolean;
  handleRefreshPlugins: () => void;
  handleOpenFolder: (folderType: string) => void;
  handleToggleProvider: (providerId: string, enabled: boolean) => void;
  handleTestConnection: (providerId: string) => void;
  handleSaveProviderSettings: (providerId: string) => void;
  handleSavePipelineConfig: () => void;
  gamesCount: number;
  gamesWithCoverCount: number;
  gamesWithScoreCount: number;
  pipelineProgress: string | null;
  isPipelineEnriching: boolean;
  handleRunMassivePipeline: () => void;
  handleCancelPipeline?: () => void;
  onPluginInstalled: () => void;
}

export default function PluginManagerModal({
  isOpen,
  onClose,
  providers,
  pipelineConfig,
  setPipelineConfig,
  editingSettings,
  setEditingSettings,
  showApiKey,
  setShowApiKey,
  testStatus,
  isRefreshingPlugins,
  handleRefreshPlugins,
  handleOpenFolder,
  handleToggleProvider,
  handleTestConnection,
  handleSaveProviderSettings,
  handleSavePipelineConfig,
  gamesCount,
  gamesWithCoverCount,
  gamesWithScoreCount,
  pipelineProgress,
  isPipelineEnriching,
  handleRunMassivePipeline,
  handleCancelPipeline,
  onPluginInstalled,
}: PluginManagerModalProps) {
  const [pluginModalTab, setPluginModalTab] = useState<
    "providers" | "pipeline" | "enrich" | "marketplace"
  >("providers");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
      <div
        className="relative max-w-3xl w-full rounded-3xl border p-6 space-y-6 shadow-2xl max-h-[92vh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center pb-3 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-lg"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Puzzle className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>Centro Plugin & Fonti Metadati</span>
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Gestisci fonti multiple, configura API Key personali e personalizza la cascata di
                fallback
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPlugins}
              disabled={isRefreshingPlugins}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: isRefreshingPlugins ? "var(--accent-primary)" : "var(--text-muted)",
              }}
              title="Esegui scansione della cartella per scoprire nuovi plugin esterni"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshingPlugins ? "animate-spin text-cyan-400" : ""
                }`}
              />
              <span className="hidden sm:inline">Ricarica Plugin</span>
            </button>
            <button
              onClick={() => handleOpenFolder("plugins")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
              title="Apri Cartella Plugins in Esplora Risorse"
            >
              <Folder className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cartella Plugins</span>
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border flex items-center justify-center font-bold"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* TAB SELECTOR: PROVIDERS vs PIPELINE vs ENRICH vs MARKETPLACE */}
        <div
          className="flex p-1 rounded-xl border shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            onClick={() => setPluginModalTab("providers")}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                pluginModalTab === "providers" ? "var(--accent-primary)" : "transparent",
              color: pluginModalTab === "providers" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            <Puzzle className="w-3.5 h-3.5" />
            <span>Fonti & Provider ({providers.length})</span>
          </button>
          <button
            onClick={() => setPluginModalTab("pipeline")}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                pluginModalTab === "pipeline" ? "var(--accent-primary)" : "transparent",
              color: pluginModalTab === "pipeline" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Priorità Pipeline</span>
          </button>
          <button
            onClick={() => setPluginModalTab("enrich")}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                pluginModalTab === "enrich" ? "var(--accent-primary)" : "transparent",
              color: pluginModalTab === "enrich" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Arricchimento Massivo</span>
          </button>
          <button
            onClick={() => setPluginModalTab("marketplace")}
            className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-2"
            style={{
              backgroundColor:
                pluginModalTab === "marketplace" ? "var(--accent-primary)" : "transparent",
              color: pluginModalTab === "marketplace" ? "#ffffff" : "var(--text-muted)",
            }}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Community Hub</span>
          </button>
        </div>

        {/* MODAL CONTENT AREA (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* TAB 1: PROVIDER LIST & CONFIG */}
          {pluginModalTab === "providers" && (
            <div className="space-y-4">
              {providers.map((prov) => {
                const settings = editingSettings[prov.id] || {};
                const isEyeOpen = showApiKey[prov.id] || false;
                const testInfo = testStatus[prov.id];

                return (
                  <div
                    key={prov.id}
                    className="p-5 rounded-2xl border space-y-4 transition-all"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    {/* Provider Header */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-md shrink-0"
                          style={{
                            backgroundColor:
                              prov.id === "igdb"
                                ? "#9146ff"
                                : prov.id === "steamgriddb"
                                ? "#00aaff"
                                : prov.id === "opencritic"
                                ? "#ff5900"
                                : prov.id === "steam"
                                ? "#10b981"
                                : "#8b5cf6",
                          }}
                        >
                          {prov.id === "igdb"
                            ? "IG"
                            : prov.id === "steamgriddb"
                            ? "SG"
                            : prov.id === "opencritic"
                            ? "OC"
                            : prov.id === "steam"
                            ? "ST"
                            : "EXT"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-black text-white">{prov.name}</h4>

                            {/* Built-in vs External Badge */}
                            {prov.is_builtin !== false ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm">
                                Integrato (Core)
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/25 text-purple-300 border border-purple-500/40 shadow-sm">
                                <Folder className="w-3 h-3 text-purple-400" />
                                <span>
                                  Plugin Esterno {prov.version ? `v${prov.version}` : ""}
                                </span>
                              </span>
                            )}

                            {prov.requires_api_key ? (
                              prov.has_configured_key ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Autenticato</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  <Key className="w-3 h-3" />
                                  <span>Richiede API Key</span>
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                Zero-Config
                              </span>
                            )}
                          </div>

                          <p
                            className="text-xs mt-1 leading-relaxed"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {prov.description}
                          </p>

                          {prov.plugin_path && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80 mt-1.5 truncate">
                              <Folder className="w-3 h-3 text-purple-400 shrink-0" />
                              <span className="truncate" title={prov.plugin_path}>
                                Percorso: {prov.plugin_path}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Enable/Disable Toggle */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleToggleProvider(prov.id, !prov.is_enabled)}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                            prov.is_enabled
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : "bg-slate-700/20 text-slate-400 border-slate-700/40"
                          }`}
                        >
                          {prov.is_enabled ? "Abilitato" : "Disabilitato"}
                        </button>
                      </div>
                    </div>

                    {/* Capabilities Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Campi forniti:
                      </span>
                      {prov.supported_fields.map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 rounded-md text-[10px] font-medium border"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>

                    {/* Provider Settings (if any) */}
                    {prov.settings_schema && (
                      <div
                        className="p-3.5 rounded-xl border space-y-3"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {prov.settings_schema.groups.map((group) => (
                          <div key={group.id} className="space-y-2">
                            {group.fields.map((field) => (
                              <div key={field.key} className="space-y-1">
                                <div className="flex justify-between items-center">
                                  <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                                    <Key className="w-3 h-3 text-indigo-400" />
                                    <span>{field.label}</span>
                                  </label>
                                  {prov.key_help_url && (
                                    <a
                                      href={prov.key_help_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[10px] font-bold flex items-center gap-1 hover:underline"
                                      style={{ color: "var(--accent-primary)" }}
                                    >
                                      <span>Ottieni API Key gratuita</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  )}
                                </div>

                                {/* Field input */}
                                {(field as any).type === "Enum" ||
                                field.field_type?.type === "Enum" ||
                                (field as any).options ? (
                                  <select
                                    value={
                                      settings[field.key] ||
                                      (field as any).default ||
                                      field.field_type?.default ||
                                      ""
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setEditingSettings((prev) => ({
                                        ...prev,
                                        [prov.id]: {
                                          ...(prev[prov.id] || {}),
                                          [field.key]: val,
                                        },
                                      }));
                                    }}
                                    className="w-full h-8 px-3 rounded-lg text-xs border font-sans focus:outline-none"
                                    style={{
                                      backgroundColor: "var(--bg-card)",
                                      borderColor: "var(--border-color)",
                                      color: "var(--text-primary)",
                                    }}
                                  >
                                    {(
                                      (field as any).options ||
                                      field.field_type?.options ||
                                      []
                                    ).map((opt: string) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="relative flex items-center">
                                    <input
                                      type={
                                        ((field as any).type === "SecretString" ||
                                          field.field_type?.type === "SecretString") &&
                                        !isEyeOpen
                                          ? "password"
                                          : "text"
                                      }
                                      placeholder={
                                        (field as any).placeholder ||
                                        field.field_type?.placeholder ||
                                        "Inserisci valore..."
                                      }
                                      value={settings[field.key] || ""}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditingSettings((prev) => ({
                                          ...prev,
                                          [prov.id]: {
                                            ...(prev[prov.id] || {}),
                                            [field.key]: val,
                                          },
                                        }));
                                      }}
                                      className="w-full h-8 px-3 pr-9 rounded-lg text-xs border font-mono focus:outline-none"
                                      style={{
                                        backgroundColor: "var(--bg-card)",
                                        borderColor: "var(--border-color)",
                                        color: "var(--text-primary)",
                                      }}
                                    />
                                    {((field as any).type === "SecretString" ||
                                      field.field_type?.type === "SecretString") && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setShowApiKey((prev) => ({
                                            ...prev,
                                            [prov.id]: !prev[prov.id],
                                          }))
                                        }
                                        className="absolute right-2.5 text-slate-400 hover:text-white"
                                      >
                                        {isEyeOpen ? (
                                          <EyeOff className="w-3.5 h-3.5" />
                                        ) : (
                                          <Eye className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                )}
                                {field.description && (
                                  <p
                                    className="text-[10px]"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    {field.description}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}

                        {/* Actions: Save Settings & Test Connection */}
                        <div
                          className="flex items-center justify-between pt-2 border-t"
                          style={{ borderColor: "var(--border-color)" }}
                        >
                          <div className="flex-1 mr-3">
                            {testInfo?.loading && (
                              <div className="flex items-center gap-2 text-xs text-indigo-400 animate-pulse">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Verifica connessione con le API in corso...</span>
                              </div>
                            )}
                            {!testInfo?.loading && testInfo?.message && (
                              <div
                                className={`flex items-center gap-1.5 text-xs font-medium ${
                                  testInfo.success ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {testInfo.success ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                ) : (
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span className="truncate">{testInfo.message}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleTestConnection(prov.id)}
                              disabled={testInfo?.loading}
                              className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5"
                              style={{
                                backgroundColor: "var(--bg-card)",
                                borderColor: "var(--border-color)",
                                color: "var(--text-primary)",
                              }}
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Test Connessione</span>
                            </button>
                            <button
                              onClick={() => handleSaveProviderSettings(prov.id)}
                              className="px-4 py-1.5 rounded-lg text-xs font-black text-white shadow-md transition-all"
                              style={{ backgroundColor: "var(--accent-primary)" }}
                            >
                              Salva
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: PIPELINE PRIORITY MATRIX */}
          {pluginModalTab === "pipeline" && (
            <div className="space-y-5">
              <div
                className="p-4 rounded-2xl border space-y-2"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Come funziona la Diamond Pipeline</span>
                </h4>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  A differenza dei vecchi launcher che si affidano a una sola fonte rigida, la
                  Diamond Pipeline interroga contemporaneamente o a cascata più servizi: assegna la
                  locandina verticale più bella da SteamGridDB, recupera il voto certificato della
                  critica globale da OpenCritic e popola la sinossi e i generi ufficiali tramite Steam
                  Store.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cover Art Priority */}
                <div
                  className="p-4 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Fonte Copertine Verticali (600x900)</span>
                  </label>
                  <select
                    value={pipelineConfig.cover_source}
                    onChange={(e) =>
                      setPipelineConfig({ ...pipelineConfig, cover_source: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="steamgriddb">SteamGridDB (Consigliato - Artwork 600x900 HD)</option>
                    <option value="igdb">IGDB (Cover Verticale Ufficiale)</option>
                    <option value="steam">Steam Store CDN (Ufficiale)</option>
                  </select>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Se SteamGridDB non restituisce risultati o non ha una chiave valida, verrà usato
                    Steam Store.
                  </p>
                </div>

                {/* Hero Background Priority */}
                <div
                  className="p-4 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-purple-400" />
                    <span>Fonte Sfondi Hero Panoramici (4K)</span>
                  </label>
                  <select
                    value={pipelineConfig.background_source}
                    onChange={(e) =>
                      setPipelineConfig({
                        ...pipelineConfig,
                        background_source: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="steamgriddb">
                      SteamGridDB (Consigliato - Hero 1920x1080 / 4K)
                    </option>
                    <option value="igdb">IGDB (Artwork / Screenshot HD)</option>
                    <option value="steam">Steam Store CDN (Ufficiale)</option>
                  </select>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Utilizzato come sfondo panoramico immersivo nel Game Drawer e in modalità Big
                    Picture.
                  </p>
                </div>

                {/* Critic Score Priority */}
                <div
                  className="p-4 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span>Fonte Punteggi della Critica</span>
                  </label>
                  <select
                    value={pipelineConfig.score_source}
                    onChange={(e) =>
                      setPipelineConfig({ ...pipelineConfig, score_source: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="opencritic">OpenCritic (Consigliato - Top Critic Score)</option>
                    <option value="igdb">IGDB (Total Rating / Critic Score)</option>
                    <option value="steam">Steam Metacritic (Punteggio Metacritic di Steam)</option>
                    {providers
                      .filter(
                        (p) =>
                          p.is_builtin === false && p.supported_fields.includes("critic_score")
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Plugin Esterno)
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Se OpenCritic non ha ancora recensioni per il gioco, interroga Steam Metacritic.
                  </p>
                </div>

                {/* Descriptions and Details Priority */}
                <div
                  className="p-4 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <label className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Scroll className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Fonte Sinossi, Generi & Sviluppatori</span>
                  </label>
                  <select
                    value={pipelineConfig.details_source}
                    onChange={(e) =>
                      setPipelineConfig({ ...pipelineConfig, details_source: e.target.value })
                    }
                    className="w-full h-9 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <option value="steam">Steam Store Engine (Localizzato in Italiano)</option>
                    <option value="igdb">IGDB (Twitch / Database Globale)</option>
                  </select>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Include tag, categorie, sviluppatori e data di rilascio ufficiale.
                  </p>
                </div>
              </div>

              {/* Preserve Existing Artwork Switch */}
              <div
                className="p-4 rounded-xl border flex items-center justify-between transition-colors"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="space-y-0.5 max-w-[80%]">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Preserva locandine e sfondi già esistenti (Consigliato)</span>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Quando attivo, l'arricchimento massivo scarica descrizioni, generi e voti senza sovrascrivere o corrompere le immagini già scaricate da Steam o presenti su disco.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setPipelineConfig({
                      ...pipelineConfig,
                      preserve_existing_artwork:
                        pipelineConfig.preserve_existing_artwork !== false ? false : true,
                    })
                  }
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    pipelineConfig.preserve_existing_artwork !== false
                      ? "bg-emerald-500"
                      : "bg-slate-700"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      pipelineConfig.preserve_existing_artwork !== false
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end pt-3">
                <button
                  onClick={handleSavePipelineConfig}
                  className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  Salva Configurazione Pipeline
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: MASSIVE ENRICHMENT */}
          {pluginModalTab === "enrich" && (
            <div className="space-y-5">
              <div
                className="p-5 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  >
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-white">
                      Sincronizzazione Massiva con la Pipeline
                    </h4>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Arricchisci tutti i {gamesCount} giochi della libreria applicando le priorità
                      definite
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Totale Giochi
                    </span>
                    <p className="text-lg font-black text-white mt-0.5">{gamesCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Cover Presenti
                    </span>
                    <p className="text-lg font-black text-emerald-400 mt-0.5">
                      {gamesWithCoverCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      Voti Critica
                    </span>
                    <p className="text-lg font-black text-amber-400 mt-0.5">
                      {gamesWithScoreCount}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-3 rounded-xl bg-black/30 border border-white/5 text-[11px]">
                  <ShieldCheck
                    className={`w-4 h-4 shrink-0 ${
                      pipelineConfig.preserve_existing_artwork !== false
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }`}
                  />
                  <span style={{ color: "var(--text-muted)" }}>
                    {pipelineConfig.preserve_existing_artwork !== false ? (
                      <>
                        <strong className="text-emerald-400 font-bold">Protezione attiva:</strong>{" "}
                        Le copertine e gli sfondi già scaricati da Steam o configurati localmente non verranno sovrascritti.
                      </>
                    ) : (
                      <>
                        <strong className="text-amber-400 font-bold">Attenzione:</strong> Le copertine e gli sfondi esistenti verranno sostituiti dai provider impostati nella pipeline.
                      </>
                    )}
                  </span>
                </div>

                {pipelineProgress && (
                  <div
                    className="p-3 rounded-xl border text-xs font-medium"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {pipelineProgress}
                  </div>
                )}

                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={handleRunMassivePipeline}
                    disabled={isPipelineEnriching}
                    className="flex-1 py-3 rounded-xl font-black text-xs text-white shadow-lg transition-all flex items-center justify-center gap-2 hover:brightness-110 active:opacity-90 disabled:opacity-75"
                    style={{
                      backgroundColor: "var(--accent-primary)",
                      boxShadow: `0 0 20px var(--accent-glow)`,
                    }}
                  >
                    <Sparkles
                      className={`w-4 h-4 ${
                        isPipelineEnriching ? "animate-spin text-amber-300" : ""
                      }`}
                    />
                    <span>
                      {isPipelineEnriching
                        ? "Arricchimento Massivo in Corso..."
                        : "Avvia Arricchimento di Tutta la Libreria"}
                    </span>
                  </button>

                  {isPipelineEnriching && handleCancelPipeline && (
                    <button
                      type="button"
                      onClick={handleCancelPipeline}
                      className="px-5 py-3 rounded-xl font-black text-xs text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 animate-pulse"
                      title="Interrompi l'arricchimento in corso"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Ferma</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: COMMUNITY MARKETPLACE HUB */}
          {pluginModalTab === "marketplace" && (
            <MarketplaceTab onPluginInstalled={onPluginInstalled} />
          )}
        </div>
      </div>
    </div>
  );
}
