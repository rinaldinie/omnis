import React, { useState, useEffect } from "react";
import {
  Puzzle,
  RefreshCw,
  Folder,
  Sliders,
  Sparkles,
  Store,
} from "lucide-react";
import { ProviderInfo, MetadataPipelineConfig } from "../../types";
import { api } from "../../api";
import { listenTauri } from "../../api/client";
import { MarketplaceTab } from "../MarketplaceTab";
import { useTranslation } from "../../i18n";
import { BUILTIN_LIBRARIES, PluginCategory } from "./plugins/constants";
import { PluginCard } from "./plugins/PluginCard";
import { ProvidersTab } from "./plugins/ProvidersTab";
import { PipelinePriorityTab } from "./plugins/PipelinePriorityTab";
import { MassiveEnrichTab } from "./plugins/MassiveEnrichTab";

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
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await listenTauri<{ current: number; total: number; title: string }>(
          "metadata-progress",
          (payload) => setLiveProgress(payload)
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
      await api.marketplace.uninstallPlugin(pluginId);
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

  const handleSettingChange = (provId: string, key: string, val: any) => {
    setEditingSettings((prev) => ({
      ...prev,
      [provId]: {
        ...(prev[provId] || {}),
        [key]: val,
      },
    }));
  };

  const handleToggleApiKey = (provId: string) => {
    setShowApiKey((prev) => ({
      ...prev,
      [provId]: !prev[provId],
    }));
  };

  const renderPluginCard = (prov: ProviderInfo) => {
    const isLibrary =
      prov.id.endsWith("_library") ||
      ["steam_library", "epic_library", "gog_library", "xbox_library"].includes(prov.id);
    const isEnabled = isLibrary ? (libraryToggles[prov.id] ?? true) : prov.is_enabled;

    return (
      <PluginCard
        key={prov.id}
        prov={prov}
        isEnabled={isEnabled}
        onToggle={onToggle}
        onUninstall={handleUninstall}
        settings={editingSettings[prov.id] || {}}
        onSettingChange={handleSettingChange}
        isApiKeyVisible={showApiKey[prov.id] || false}
        onToggleApiKeyVisibility={handleToggleApiKey}
        testInfo={testStatus[prov.id]}
        onTestConnection={handleTestConnection}
        onSaveSettings={handleSaveProviderSettings}
      />
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
          {pluginModalTab === "providers" && (
            <ProvidersTab
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              libraryList={libraryList}
              metadataList={metadataList}
              genericList={genericList}
              allCount={allCombined.length}
              renderPluginCard={renderPluginCard}
              onNavigateToMarketplace={() => setPluginModalTab("marketplace")}
            />
          )}

          {pluginModalTab === "pipeline" && (
            <PipelinePriorityTab
              priorityOrder={priorityOrder}
              movePriority={movePriority}
              providers={providers}
              pipelineConfig={pipelineConfig}
              setPipelineConfig={setPipelineConfig}
              onSavePipelineConfig={handleSavePipelineConfig}
              tr={tr}
            />
          )}

          {pluginModalTab === "enrich" && (
            <MassiveEnrichTab
              gamesCount={gamesCount}
              gamesWithCoverCount={gamesWithCoverCount}
              gamesWithScoreCount={gamesWithScoreCount}
              pipelineConfig={pipelineConfig}
              isPipelineEnriching={isPipelineEnriching}
              liveProgress={liveProgress}
              pipelineProgress={pipelineProgress}
              onRunMassivePipeline={handleRunMassivePipeline}
              onCancelPipeline={handleCancelPipeline}
            />
          )}

          {pluginModalTab === "marketplace" && (
            <MarketplaceTab onPluginInstalled={onPluginInstalled} />
          )}
        </div>
      </div>
    </div>
  );
}
