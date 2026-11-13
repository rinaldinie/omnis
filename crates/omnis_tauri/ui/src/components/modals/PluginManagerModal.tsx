import React, { useState, useEffect } from "react";
import {
  Puzzle,
  RefreshCw,
  Folder,
  Sliders,
  Sparkles,
  X,
} from "lucide-react";
import { ProviderInfo, MetadataPipelineConfig, TAURI_EVENTS } from "../../types";
import { listenTauri } from "../../api/client";
import { useTranslation } from "../../i18n";
import { BUILTIN_LIBRARIES, PluginCategory } from "./plugins/constants";
import { PluginCard } from "./plugins/PluginCard";
import { ProvidersTab } from "./plugins/ProvidersTab";
import { PipelinePriorityTab } from "./plugins/PipelinePriorityTab";
import { MassiveEnrichTab } from "./plugins/MassiveEnrichTab";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";

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
  onPluginInstalled: _onPluginInstalled,
}: PluginManagerModalProps) {
  const { t } = useTranslation();
  // Built-in descriptions and badges hold translation keys; external plugin text is shown as-is
  const tr = (text: string) => (text.startsWith("plugin_manager.") ? t(text) : text);
  const [pluginModalTab, setPluginModalTab] = useState<
    "providers" | "pipeline" | "enrich"
  >("providers");
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory>("all");
  const [liveProgress, setLiveProgress] = useState<{ current: number; total: number; title: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let unlisten: (() => void) | null = null;
    (async () => {
      try {
        unlisten = await listenTauri<{ current: number; total: number; title: string }>(
          TAURI_EVENTS.METADATA_PROGRESS,
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

  const handleUninstall = async (_pluginId: string) => {
    // Tutti i provider sono integrati nativamente
  };

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl w-full rounded-3xl max-h-[88vh] p-0 flex flex-col overflow-hidden gap-0"
      >
        <DialogHeader className="flex-row justify-between items-center px-6 py-4 border-b border-border space-y-0 text-left shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-border bg-card shadow-lg shrink-0">
              <Puzzle className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                <span>{t("plugins_modal.title")}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("plugins_modal.subtitle")}
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ActionTooltip label={t("plugin_manager.scan_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRefreshPlugins}
                disabled={isRefreshingPlugins}
                className="gap-1.5 px-3 py-1.5 h-auto rounded-lg text-xs font-bold"
                style={{
                  color: isRefreshingPlugins ? "var(--accent-primary)" : "var(--text-muted)",
                }}
                aria-label={t("plugin_manager.scan_title")}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    isRefreshingPlugins ? "animate-spin text-cyan-400" : ""
                  }`}
                />
                <span className="hidden sm:inline">{t("plugins_modal.refresh_plugins")}</span>
              </Button>
            </ActionTooltip>
            <ActionTooltip label={t("plugin_manager.open_folder_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenFolder("plugins")}
                className="gap-1.5 px-3 py-1.5 h-auto rounded-lg text-xs font-bold text-muted-foreground"
                aria-label={t("plugin_manager.open_folder_title")}
              >
                <Folder className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("plugins_modal.plugins_folder")}</span>
              </Button>
            </ActionTooltip>
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="w-8 h-8 rounded-full text-muted-foreground"
                aria-label={t("common.close", { defaultValue: "Close" })}
              >
                <X className="w-4 h-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <Tabs
          value={pluginModalTab}
          onValueChange={(v) => setPluginModalTab(v as "providers" | "pipeline" | "enrich")}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="px-6 pt-3 pb-2 shrink-0">
            <TabsList className="w-full h-auto p-1 rounded-xl border border-border bg-card grid grid-cols-3">
              <TabsTrigger
                value="providers"
                className="py-2 rounded-lg text-xs font-bold border-0 gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground"
              >
                <Puzzle className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.tab_installed", { count: allCombined.length })}</span>
              </TabsTrigger>
              <TabsTrigger
                value="pipeline"
                className="py-2 rounded-lg text-xs font-bold border-0 gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.tab_pipeline")}</span>
              </TabsTrigger>
              <TabsTrigger
                value="enrich"
                className="py-2 rounded-lg text-xs font-bold border-0 gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:text-muted-foreground"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("plugin_manager.tab_enrich")}</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4 space-y-5">
              <TabsContent value="providers" className="mt-0">
                <ProvidersTab
                  categoryFilter={categoryFilter}
                  setCategoryFilter={setCategoryFilter}
                  libraryList={libraryList}
                  metadataList={metadataList}
                  genericList={genericList}
                  allCount={allCombined.length}
                  renderPluginCard={renderPluginCard}
                />
              </TabsContent>

              <TabsContent value="pipeline" className="mt-0">
                <PipelinePriorityTab
                  priorityOrder={priorityOrder}
                  movePriority={movePriority}
                  providers={providers}
                  pipelineConfig={pipelineConfig}
                  setPipelineConfig={setPipelineConfig}
                  onSavePipelineConfig={handleSavePipelineConfig}
                  tr={tr}
                />
              </TabsContent>

              <TabsContent value="enrich" className="mt-0">
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
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
