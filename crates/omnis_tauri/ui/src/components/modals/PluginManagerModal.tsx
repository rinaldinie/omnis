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
  Library,
  Database,
  Award,
  Image,
  Power,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react";
import { ProviderInfo, MetadataPipelineConfig, invokeTauri } from "../../types";
import { MarketplaceTab } from "../MarketplaceTab";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "../StoreBadge";

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

const BUILTIN_LIBRARIES: ProviderInfo[] = [
  {
    id: "steam_library",
    name: "Steam Library Scanner",
    description: "Rileva e scansiona automaticamente tutti i giochi Steam installati tramite manifest VDF locali e sincronizzazione cloud.",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["Giochi Installati", "Tempo di Gioco", "Cloud Sync"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "epic_library",
    name: "Epic Games Launcher Scanner",
    description: "Scansione dei manifest .item su disco e sincronizzazione automatica del catalogo con account Epic Games.",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["Giochi Installati", "Manifest .item", "Cloud OAuth"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "gog_library",
    name: "GOG Galaxy Scanner",
    description: "Rilevamento delle installazioni DRM-Free dal registro di Windows e integrazione cloud GOG.",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["DRM-Free", "Registro Windows", "Cloud Galaxy"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "xbox_library",
    name: "Xbox / PC Game Pass Scanner",
    description: "Rileva i pacchetti MSIX/UWP dei giochi scaricati dal Microsoft Store e l'abbonamento PC Game Pass.",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["MSIX Packages", "Microsoft Store", "Xbox Cloud"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
];

type PluginCategory = "all" | "libraries" | "metadata" | "generic";

function renderProviderIcon(provId: string, isEnabled: boolean) {
  const iconCls = isEnabled ? "w-4 h-4" : "w-4 h-4 opacity-50";
  switch (provId) {
    case "steam":
    case "steam_library":
      return <SteamIcon className={iconCls} />;
    case "epic":
    case "epic_library":
      return <EpicIcon className={iconCls} />;
    case "gog":
    case "gog_library":
      return <GogIcon className={iconCls} />;
    case "xbox":
    case "xbox_library":
      return <XboxIcon className={iconCls} />;
    case "steamgriddb":
      return <Image className={iconCls} />;
    case "opencritic":
      return <Award className={iconCls} />;
    case "igdb":
      return <Database className={iconCls} />;
    default:
      return <Puzzle className={iconCls} />;
  }
}

function getProviderColor(provId: string): string {
  switch (provId) {
    case "steam":
    case "steam_library":
      return "#1b2838";
    case "epic":
    case "epic_library":
      return "#2a2a2a";
    case "gog":
    case "gog_library":
      return "#5c2e91";
    case "xbox":
    case "xbox_library":
      return "#107c10";
    case "steamgriddb":
      return "#00aaff";
    case "opencritic":
      return "#ff5900";
    case "igdb":
      return "#9146ff";
    default:
      return "#6366f1";
  }
}

interface PriorityProviderMeta {
  id: string;
  name: string;
  description: string;
  badges: string[];
}

const PROVIDER_METAS: Record<string, PriorityProviderMeta> = {
  steam: {
    id: "steam",
    name: "Steam Store Engine",
    description: "Locandine verticali CDN, sinossi ufficiale in italiano, generi, sviluppatori e voti Metacritic.",
    badges: ["Locandine", "Sfondi", "Sinossi & Tag", "Voti Metacritic"],
  },
  gog: {
    id: "gog",
    name: "GOG.com Catalog",
    description: "Catalogo DRM-free ufficiale con artwork verticali, sfondi hero e descrizioni.",
    badges: ["Locandine", "Sfondi Hero", "Sinossi DRM-Free"],
  },
  steamgriddb: {
    id: "steamgriddb",
    name: "SteamGridDB",
    description: "Database di artwork curato dalla community: locandine verticali 600x900 HD e sfondi 4K.",
    badges: ["Locandine 600x900 HD", "Sfondi Hero 4K", "Community Art"],
  },
  opencritic: {
    id: "opencritic",
    name: "OpenCritic",
    description: "Punteggi aggregati della critica globale, % di raccomandazione e recensioni certificate.",
    badges: ["Top Critic Score", "% Raccomandazione", "Recensioni Stampa"],
  },
  igdb: {
    id: "igdb",
    name: "IGDB (Internet Game Database)",
    description: "Database globale Twitch con metadati esaustivi, storyline, screenshot e rating utente/critica.",
    badges: ["Database Globale", "Screenshot HD", "Total Rating"],
  },
};

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
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory>("all");

  const [libraryToggles, setLibraryToggles] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("omnis_library_plugins_enabled");
      return saved
        ? JSON.parse(saved)
        : {
            steam_library: true,
            epic_library: true,
            gog_library: true,
            xbox_library: true,
          };
    } catch {
      return {
        steam_library: true,
        epic_library: true,
        gog_library: true,
        xbox_library: true,
      };
    }
  });

  const handleToggleLibrary = (id: string, enabled: boolean) => {
    setLibraryToggles((prev) => {
      const next = { ...prev, [id]: enabled };
      try {
        localStorage.setItem("omnis_library_plugins_enabled", JSON.stringify(next));
      } catch (e) {
        console.error("Failed saving library toggles:", e);
      }
      return next;
    });
  };

  const handleUninstall = async (pluginId: string) => {
    try {
      await invokeTauri("uninstall_marketplace_plugin", { pluginId });
      if (onPluginInstalled) {
        onPluginInstalled();
      }
    } catch (err) {
      console.error("Failed to uninstall plugin:", err);
    }
  };

  if (!isOpen) return null;

  const safeProviders = Array.isArray(providers) ? providers : [];
  const safePipelineConfig = pipelineConfig || {
    cover_source: "steam",
    background_source: "steam",
    score_source: "opencritic",
    details_source: "steam",
    preserve_existing_artwork: true,
  };

  // Prepare full list of library plugins (built-in + any external library plugin)
  const externalLibraries = safeProviders.filter(
    (p) => p && (p.plugin_type === "library" || p.id.endsWith("_library"))
  );
  const libraryMap = new Map<string, ProviderInfo>();
  BUILTIN_LIBRARIES.forEach((item) => {
    libraryMap.set(item.id, {
      ...item,
      is_enabled: libraryToggles[item.id] ?? true,
    });
  });
  externalLibraries.forEach((item) => {
    libraryMap.set(item.id, item);
  });
  const libraryList = Array.from(libraryMap.values());

  // Metadata providers (ONLY installed metadata providers returned by backend)
  const metadataList = safeProviders.filter(
    (p) =>
      p &&
      (p.plugin_type === "metadata" ||
        ["steam", "gog"].includes(p.id) ||
        (!p.id.endsWith("_library") && p.plugin_type !== "library" && p.plugin_type !== "generic"))
  );

  // Generic / community / custom plugins
  const genericList = safeProviders.filter(
    (p) =>
      p &&
      (p.plugin_type === "generic" ||
        (!["steam", "gog"].includes(p.id) &&
          p.plugin_type !== "library" &&
          p.plugin_type !== "metadata" &&
          !p.id.endsWith("_library")))
  );

  const allCombined = [...libraryList, ...metadataList, ...genericList];

  // Pipeline priority order: only include installed and active metadata providers!
  const installedMetadataIds = metadataList.map((p) => p.id);
  const savedPriority = (safePipelineConfig.provider_priority || []).filter((id) =>
    installedMetadataIds.includes(id)
  );
  const missingInstalled = installedMetadataIds.filter((id) => !savedPriority.includes(id));
  const priorityOrder = [...savedPriority, ...missingInstalled];

  const movePriority = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= priorityOrder.length) return;

    const newOrder = [...priorityOrder];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    const topCover =
      newOrder.find((id) => ["steam", "gog", "steamgriddb", "igdb"].includes(id)) ||
      safePipelineConfig.cover_source;
    const topBg =
      newOrder.find((id) => ["steam", "gog", "steamgriddb", "igdb"].includes(id)) ||
      safePipelineConfig.background_source;
    const topScore =
      newOrder.find((id) => ["opencritic", "steam", "igdb"].includes(id)) ||
      safePipelineConfig.score_source;
    const topDetails =
      newOrder.find((id) => ["steam", "gog", "igdb"].includes(id)) ||
      safePipelineConfig.details_source;

    setPipelineConfig((prev) => ({
      ...prev,
      provider_priority: newOrder,
      cover_source: topCover,
      background_source: topBg,
      score_source: topScore,
      details_source: topDetails,
    }));
  };

  const onToggle = (provId: string, enabled: boolean) => {
    if (provId.endsWith("_library") || ["steam_library", "epic_library", "gog_library", "xbox_library"].includes(provId)) {
      handleToggleLibrary(provId, enabled);
    } else {
      handleToggleProvider(provId, enabled);
    }
  };

  const renderPluginCard = (prov: ProviderInfo) => {
    const isLibrary =
      prov.id.endsWith("_library") ||
      ["steam_library", "epic_library", "gog_library", "xbox_library"].includes(prov.id);
    const isEnabled = isLibrary ? (libraryToggles[prov.id] ?? true) : prov.is_enabled;

    // 1. INACTIVE / DISABLED COMPACT CARD (NO DETAILS, ULTRA CLEAN)
    if (!isEnabled) {
      return (
        <div
          key={prov.id}
          className="px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 bg-slate-900/30 border-white/5 hover:border-white/10"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-white/5 bg-slate-800/80">
              {renderProviderIcon(prov.id, false)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-300 truncate">{prov.name}</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/50">
                  Disattivato
                </span>
                {prov.version && (
                  <span className="text-[10px] font-mono text-slate-500">v{prov.version}</span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5 max-w-lg">
                {prov.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {prov.is_builtin === false && (
              <button
                type="button"
                onClick={() => handleUninstall(prov.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all text-rose-400 hover:text-white hover:border-rose-500/50 hover:bg-rose-500/10 flex items-center gap-1.5"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
                title="Disinstalla plugin e rimuovi da disco"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disinstalla</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggle(prov.id, true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all text-slate-300 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 flex items-center gap-1.5"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Power className="w-3 h-3 text-emerald-400" />
              <span>Attiva</span>
            </button>
          </div>
        </div>
      );
    }

    // 2. ACTIVE PLUGIN CARD (CLEAN & DETAILED)
    const settings = editingSettings[prov.id] || {};
    const isEyeOpen = showApiKey[prov.id] || false;
    const testInfo = testStatus[prov.id];

    return (
      <div
        key={prov.id}
        className="p-5 rounded-2xl border space-y-4 transition-all shadow-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-md shrink-0 border"
              style={{
                backgroundColor: getProviderColor(prov.id),
                borderColor: "rgba(255,255,255,0.15)",
              }}
            >
              {renderProviderIcon(prov.id, true)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-black text-white">{prov.name}</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Attivo
                </span>
                {prov.is_builtin !== false ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    Integrato (Core)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Folder className="w-3 h-3 text-purple-400" />
                    <span>Esterno v{prov.version || "1.0"}</span>
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

              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {prov.description}
              </p>

              {prov.plugin_path && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-purple-300/80 mt-1 truncate">
                  <Folder className="w-3 h-3 text-purple-400 shrink-0" />
                  <span className="truncate" title={prov.plugin_path}>
                    {prov.plugin_path}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {prov.is_builtin === false && (
              <button
                type="button"
                onClick={() => handleUninstall(prov.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all text-rose-400 hover:text-white hover:border-rose-500/50 hover:bg-rose-500/10 flex items-center gap-1.5"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
                title="Disinstalla plugin e rimuovi da disco"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disinstalla</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggle(prov.id, false)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40"
            >
              Disattiva
            </button>
          </div>
        </div>

        {/* Capabilities Chips */}
        {prov.supported_fields && prov.supported_fields.length > 0 && (
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
        )}

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
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
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
                  type="button"
                  onClick={() => handleTestConnection(prov.id)}
                  disabled={testInfo?.loading}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 hover:bg-white/5 active:opacity-80"
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
                  type="button"
                  onClick={() => handleSaveProviderSettings(prov.id)}
                  className="px-4 py-1.5 rounded-lg text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90"
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
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-4xl w-full rounded-3xl border shadow-2xl max-h-[88vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0"
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
                Gestisci librerie, fonti di arricchimento ed estensioni esterne della community
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshPlugins}
              disabled={isRefreshingPlugins}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-80"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-80"
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
              className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90"
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

        {/* Tab Selector Header */}
        <div className="px-6 pt-3 pb-2 shrink-0">
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
              <span>Plugin Installati ({allCombined.length})</span>
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
              <span>Marketplace (Hub)</span>
            </button>
          </div>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5 custom-scrollbar">
          {/* TAB 1: PLUGINS DIVIDED BY CATEGORIES */}
          {pluginModalTab === "providers" && (
            <div className="space-y-5">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/5">
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === "all"
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Tutti ({allCombined.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("libraries")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === "libraries"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>Plugin di Librerie ({libraryList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("metadata")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === "metadata"
                      ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Fonti Metadati ({metadataList.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryFilter("generic")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    categoryFilter === "generic"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Puzzle className="w-3.5 h-3.5" />
                  <span>Generici ({genericList.length})</span>
                </button>
              </div>

              {/* SECTIONS RENDERING */}
              {(categoryFilter === "all" || categoryFilter === "libraries") && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Library className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-300">
                      Plugin di Librerie ({libraryList.length})
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {libraryList.map(renderPluginCard)}
                  </div>
                </div>
              )}

              {(categoryFilter === "all" || categoryFilter === "metadata") && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2 px-1">
                    <Database className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-purple-300">
                      Fonti Metadati ({metadataList.length})
                    </h4>
                  </div>
                  <div className="space-y-2.5">
                    {metadataList.map(renderPluginCard)}
                  </div>
                </div>
              )}

              {(categoryFilter === "all" || categoryFilter === "generic") && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2 px-1">
                    <Puzzle className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                      Plugin Generici & Estensioni ({genericList.length})
                    </h4>
                  </div>
                  {genericList.length > 0 ? (
                    <div className="space-y-2.5">
                      {genericList.map(renderPluginCard)}
                    </div>
                  ) : (
                    <div
                      className="p-6 rounded-2xl border text-center space-y-2"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      <Puzzle className="w-7 h-7 text-slate-500 mx-auto" />
                      <p className="text-xs font-bold text-slate-400">
                        Nessun plugin generico esterno installato al momento
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        Puoi installare nuove estensioni direttamente dal Community Hub oppure
                        posizionando file nativi o manifest nella cartella plugins.
                      </p>
                      <div className="pt-2 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPluginModalTab("marketplace")}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-md transition-all"
                          style={{ backgroundColor: "var(--accent-primary)" }}
                        >
                          Esplora Community Hub
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PIPELINE PRIORITY MATRIX */}
          {pluginModalTab === "pipeline" && (
            <div className="space-y-6">
              {/* ORDERABLE PRIORITY LIST */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Ordine di Priorità delle Fonti (Fallback a Cascata)</span>
                    </h4>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      Omnis interroga le fonti attive in sequenza (dall'1° in giù). Usa le frecce per modificare l'ordine di priorità.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {priorityOrder.map((provId, idx) => {
                    const meta = PROVIDER_METAS[provId] || {
                      id: provId,
                      name: providers.find((p) => p.id === provId)?.name || provId,
                      description:
                        providers.find((p) => p.id === provId)?.description ||
                        "Plugin fornitore metadati esterno",
                      badges: ["Plugin Esterno"],
                    };
                    const isFirst = idx === 0;
                    const isLast = idx === priorityOrder.length - 1;

                    return (
                      <div
                        key={provId}
                        className={`p-3 px-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                          isFirst
                            ? "border-emerald-500/40 bg-emerald-500/10 shadow-md shadow-emerald-500/5"
                            : "border-white/5 bg-slate-900/40 hover:border-white/10"
                        }`}
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          {/* Rank number badge */}
                          <div
                            className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                              isFirst
                                ? "bg-emerald-500 text-black shadow-sm font-black"
                                : "bg-slate-800 text-slate-300 border border-slate-700/60"
                            }`}
                          >
                            {idx + 1}°
                          </div>

                          {/* Provider icon */}
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs text-white shadow-md shrink-0 border"
                            style={{
                              backgroundColor: getProviderColor(provId),
                              borderColor: "rgba(255,255,255,0.15)",
                            }}
                          >
                            {renderProviderIcon(provId, true)}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white truncate">
                                {meta.name}
                              </h4>
                              {isFirst && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                  Priorità Massima
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate mt-0.5 max-w-lg">
                              {meta.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {meta.badges.map((b) => (
                                <span
                                  key={b}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/30 border border-white/5 text-slate-300"
                                >
                                  {b}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Order Control Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isFirst}
                            onClick={() => movePriority(idx, "up")}
                            title="Sposta in alto (aumenta priorità)"
                            className="w-8 h-8 rounded-xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/10 active:scale-95"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={isLast}
                            onClick={() => movePriority(idx, "down")}
                            title="Sposta in basso (diminuisce priorità)"
                            className="w-8 h-8 rounded-xl border flex items-center justify-center transition-all disabled:opacity-20 disabled:cursor-not-allowed hover:bg-white/10 active:scale-95"
                            style={{
                              backgroundColor: "var(--bg-card)",
                              borderColor: "var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* GRANULAR SOURCE SELECTORS */}
              <div className="space-y-3 pt-1">
                <div className="px-1">
                  <h4 className="text-xs font-bold text-slate-300">
                    Sorgenti Preferite per Singolo Campo
                  </h4>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Personalizza ulteriormente quale fonte consultare prioritariamente per ciascun tipo di asset
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Cover Art Priority */}
                  <div
                    className="p-3.5 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Copertine Verticali (600x900)</span>
                    </label>
                    <select
                      value={pipelineConfig.cover_source}
                      onChange={(e) =>
                        setPipelineConfig({ ...pipelineConfig, cover_source: e.target.value })
                      }
                      className="w-full h-8 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="steam">Steam Store CDN (Zero-Config Ufficiale)</option>
                      <option value="gog">GOG Catalog (Zero-Config Ufficiale)</option>
                      <option value="steamgriddb">SteamGridDB (Artwork HD 600x900)</option>
                      <option value="igdb">IGDB (Twitch Database)</option>
                    </select>
                  </div>

                  {/* Hero Background Priority */}
                  <div
                    className="p-3.5 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Folder className="w-3.5 h-3.5 text-purple-400" />
                      <span>Sfondi Hero Panoramici (4K)</span>
                    </label>
                    <select
                      value={pipelineConfig.background_source}
                      onChange={(e) =>
                        setPipelineConfig({
                          ...pipelineConfig,
                          background_source: e.target.value,
                        })
                      }
                      className="w-full h-8 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="steam">Steam Store CDN (Ufficiale)</option>
                      <option value="gog">GOG Catalog (Artwork Ufficiale)</option>
                      <option value="steamgriddb">SteamGridDB (Hero 1920x1080 / 4K)</option>
                      <option value="igdb">IGDB (Screenshot HD)</option>
                    </select>
                  </div>

                  {/* Critic Score Priority */}
                  <div
                    className="p-3.5 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                      <span>Voti della Critica</span>
                    </label>
                    <select
                      value={pipelineConfig.score_source}
                      onChange={(e) =>
                        setPipelineConfig({ ...pipelineConfig, score_source: e.target.value })
                      }
                      className="w-full h-8 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="steam">Steam Metacritic (Punteggio Metacritic di Steam)</option>
                      <option value="opencritic">OpenCritic (Top Critic Score)</option>
                      <option value="igdb">IGDB (Total Rating / Critic Score)</option>
                    </select>
                  </div>

                  {/* Descriptions and Details Priority */}
                  <div
                    className="p-3.5 rounded-xl border space-y-1.5"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Scroll className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Sinossi, Generi & Sviluppatori</span>
                    </label>
                    <select
                      value={pipelineConfig.details_source}
                      onChange={(e) =>
                        setPipelineConfig({ ...pipelineConfig, details_source: e.target.value })
                      }
                      className="w-full h-8 px-3 rounded-lg text-xs border font-medium focus:outline-none"
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="steam">Steam Store Engine (Localizzato in Italiano)</option>
                      <option value="gog">GOG Catalog (Catalogo DRM-Free)</option>
                      <option value="igdb">IGDB (Twitch / Database Globale)</option>
                    </select>
                  </div>
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
                    Quando attivo, l'arricchimento massivo scarica descrizioni, generi e voti senza sovrascrivere o corrompere le immagini già salvate su disco.
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

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSavePipelineConfig}
                  className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all hover:brightness-110 active:opacity-90"
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
                      Arricchisci tutti i {gamesCount} giochi della libreria applicando le priorità definite
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
