import React, { useState, useEffect } from "react";
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
import { useTranslation } from "../../i18n";

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
    description: "plugin_manager.lib_steam_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["plugin_manager.field_installed_games", "plugin_manager.field_playtime", "Cloud Sync"],
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
    description: "plugin_manager.lib_epic_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["plugin_manager.field_installed_games", "Manifest .item", "Cloud OAuth"],
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
    description: "plugin_manager.lib_gog_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["DRM-Free", "plugin_manager.field_windows_registry", "Cloud Galaxy"],
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
    description: "plugin_manager.lib_xbox_desc",
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
    description: "plugin_manager.meta_steam_desc",
    badges: ["plugin_manager.badge_posters", "plugin_manager.badge_backgrounds", "plugin_manager.badge_synopsis_tags", "plugin_manager.badge_metacritic"],
  },
  gog: {
    id: "gog",
    name: "GOG.com Catalog",
    description: "plugin_manager.meta_gog_desc",
    badges: ["plugin_manager.badge_posters", "plugin_manager.badge_hero_backgrounds", "plugin_manager.badge_drm_free_synopsis"],
  },
  steamgriddb: {
    id: "steamgriddb",
    name: "SteamGridDB",
    description: "plugin_manager.meta_sgdb_desc",
    badges: ["plugin_manager.badge_posters_hd", "plugin_manager.badge_hero_4k", "Community Art"],
  },
  opencritic: {
    id: "opencritic",
    name: "OpenCritic",
    description: "plugin_manager.meta_opencritic_desc",
    badges: ["Top Critic Score", "plugin_manager.badge_recommendation", "plugin_manager.badge_press_reviews"],
  },
  igdb: {
    id: "igdb",
    name: "IGDB (Internet Game Database)",
    description: "plugin_manager.meta_igdb_desc",
    badges: ["plugin_manager.badge_global_db", "Screenshot HD", "Total Rating"],
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
  const { t } = useTranslation();
  // Built-in descriptions and badges hold translation keys; external plugin text is shown as-is
  const tr = (text: string) => (text.startsWith("plugin_manager.") ? t(text) : text);
  const [pluginModalTab, setPluginModalTab] = useState<
    "providers" | "pipeline" | "enrich" | "marketplace"
  >("providers");
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory>("all");
  const [liveProgress, setLiveProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ current: number; total: number; title: string }>(
          "metadata-progress",
          (e) => setLiveProgress(e.payload)
        );
      } catch (err) {
        console.warn("Failed to attach metadata-progress listener in PluginManagerModal:", err);
      }
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

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
      description: tr(item.description),
      supported_fields: item.supported_fields?.map(tr),
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
                  {t("plugin_manager.disabled")}
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
                title={t("plugin_manager.uninstall_title")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.uninstall")}</span>
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
              <span>{t("plugin_manager.enable")}</span>
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
                  {t("plugin_manager.active")}
                </span>
                {prov.is_builtin !== false ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {t("plugin_manager.builtin")}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                    <Folder className="w-3 h-3 text-purple-400" />
                    <span>{t("plugin_manager.external", { version: prov.version || "1.0" })}</span>
                  </span>
                )}
                {prov.requires_api_key ? (
                  prov.has_configured_key ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{t("plugin_manager.authenticated")}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <Key className="w-3 h-3" />
                      <span>{t("plugin_manager.requires_key")}</span>
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
                title={t("plugin_manager.uninstall_title")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.uninstall")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggle(prov.id, false)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40"
            >
              {t("plugin_manager.disable")}
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
              {t("plugin_manager.fields_provided")}
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
                          <span>{t("plugin_manager.get_free_key")}</span>
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
                            t("plugin_manager.enter_value")
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
                    <span>{t("plugin_manager.testing")}</span>
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
                  <span>{t("plugins_modal.test_connection")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveProviderSettings(prov.id)}
                  className="px-4 py-1.5 rounded-lg text-xs font-black text-white shadow-md transition-all hover:brightness-110 active:opacity-90"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {t("common.save")}
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
                <span>{t("plugins_modal.title")}</span>
              </h3>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("plugins_modal.subtitle")}
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
              title={t("plugin_manager.scan_title")}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isRefreshingPlugins ? "animate-spin text-cyan-400" : ""
                }`}
              />
              <span className="hidden sm:inline">{t("plugins_modal.refresh_plugins")}</span>
            </button>
            <button
              onClick={() => handleOpenFolder("plugins")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-80"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-muted)",
              }}
              title={t("plugin_manager.open_folder_title")}
            >
              <Folder className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("plugins_modal.plugins_folder")}</span>
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
              <span>{t("plugin_manager.tab_installed", { count: allCombined.length })}</span>
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
              <span>{t("plugin_manager.tab_pipeline")}</span>
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
              <span>{t("plugin_manager.tab_enrich")}</span>
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
              <span>{t("plugin_manager.tab_marketplace")}</span>
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
                  <span>{t("plugin_manager.filter_all", { count: allCombined.length })}</span>
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
                  <span>{t("plugin_manager.libraries", { count: libraryList.length })}</span>
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
                  <span>{t("plugin_manager.metadata_sources", { count: metadataList.length })}</span>
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
                  <span>{t("plugin_manager.generic_short", { count: genericList.length })}</span>
                </button>
              </div>

              {/* SECTIONS RENDERING */}
              {(categoryFilter === "all" || categoryFilter === "libraries") && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <Library className="w-4 h-4 text-blue-400" />
                    <h4 className="text-xs font-black uppercase tracking-wider text-blue-300">
                      {t("plugin_manager.libraries", { count: libraryList.length })}
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
                      {t("plugin_manager.metadata_sources", { count: metadataList.length })}
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
                      {t("plugin_manager.generic_section", { count: genericList.length })}
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
                        {t("plugin_manager.no_generic")}
                      </p>
                      <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                        {t("plugin_manager.no_generic_hint")}
                      </p>
                      <div className="pt-2 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPluginModalTab("marketplace")}
                          className="px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-md transition-all"
                          style={{ backgroundColor: "var(--accent-primary)" }}
                        >
                          {t("plugin_manager.explore_hub")}
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
                      <span>{t("plugin_manager.priority_title")}</span>
                    </h4>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {t("plugin_manager.priority_desc")}
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
                        t("plugin_manager.external_provider_desc"),
                      badges: [t("plugin_manager.external_badge")],
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
                                  {t("plugin_manager.top_priority")}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate mt-0.5 max-w-lg">
                              {tr(meta.description)}
                            </p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {meta.badges.map((b) => (
                                <span
                                  key={b}
                                  className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/30 border border-white/5 text-slate-300"
                                >
                                  {tr(b)}
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
                            title={t("plugin_manager.move_up")}
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
                            title={t("plugin_manager.move_down")}
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
                    {t("plugin_manager.per_field_title")}
                  </h4>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {t("plugin_manager.per_field_desc")}
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
                      <span>{t("plugin_manager.covers")}</span>
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
                      <option value="steam">Steam Store CDN ({t("plugin_manager.opt_official_zero_config")})</option>
                      <option value="gog">GOG Catalog ({t("plugin_manager.opt_official_zero_config")})</option>
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
                      <span>{t("plugin_manager.backgrounds")}</span>
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
                      <option value="steam">Steam Store CDN ({t("plugin_manager.opt_official")})</option>
                      <option value="gog">GOG Catalog ({t("plugin_manager.opt_official_artwork")})</option>
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
                      <span>{t("plugin_manager.critic_scores")}</span>
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
                      <option value="steam">Steam Metacritic ({t("plugin_manager.opt_steam_metacritic")})</option>
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
                      <span>{t("plugin_manager.details")}</span>
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
                      <option value="steam">Steam Store Engine ({t("plugin_manager.opt_localized")})</option>
                      <option value="gog">GOG Catalog ({t("plugin_manager.opt_drm_free_catalog")})</option>
                      <option value="igdb">IGDB (Twitch / {t("plugin_manager.badge_global_db")})</option>
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
                    <span>{t("plugin_manager.preserve_title")}</span>
                  </div>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {t("plugin_manager.preserve_desc")}
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
                  {t("plugin_manager.save_pipeline")}
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
                      {t("plugin_manager.enrich_title")}
                    </h4>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {t("plugin_manager.enrich_desc", { count: gamesCount })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {t("plugin_manager.total_games")}
                    </span>
                    <p className="text-lg font-black text-white mt-0.5">{gamesCount}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {t("plugin_manager.covers_present")}
                    </span>
                    <p className="text-lg font-black text-emerald-400 mt-0.5">
                      {gamesWithCoverCount}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-slate-400">
                      {t("plugin_manager.critic_scores")}
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
                        <strong className="text-emerald-400 font-bold">{t("plugin_manager.protection_on")}</strong>{" "}
                        {t("plugin_manager.protection_on_desc")}
                      </>
                    ) : (
                      <>
                        <strong className="text-amber-400 font-bold">{t("plugin_manager.warning")}</strong> {t("plugin_manager.warning_desc")}
                      </>
                    )}
                  </span>
                </div>

                {/* REAL-TIME PROGRESS BAR */}
                {isPipelineEnriching && liveProgress && (
                  <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-indigo-300 truncate max-w-[320px]">
                        {t("plugin_manager.downloading_for", { title: liveProgress.title })}
                      </span>
                      <span className="font-bold text-white">
                        {liveProgress.current} / {liveProgress.total} ({liveProgress.total > 0 ? Math.round((liveProgress.current / liveProgress.total) * 100) : 0}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 via-purple-500 to-amber-400 shadow-sm"
                        style={{
                          width: `${liveProgress.total > 0 ? Math.round((liveProgress.current / liveProgress.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {pipelineProgress && !isPipelineEnriching && (
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
                        ? t("plugin_manager.downloading")
                        : t("plugin_manager.download_all")}
                    </span>
                  </button>

                  {isPipelineEnriching && handleCancelPipeline && (
                    <button
                      type="button"
                      onClick={handleCancelPipeline}
                      className="px-5 py-3 rounded-xl font-black text-xs text-white bg-red-600 hover:bg-red-500 shadow-lg shadow-red-500/25 transition-all flex items-center justify-center gap-2 active:scale-95 animate-pulse"
                      title={t("plugin_manager.stop_title")}
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>{t("plugin_manager.stop")}</span>
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
