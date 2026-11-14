import { useState, useCallback } from "react";
import { ProviderInfo, PluginSettingsMap, MetadataPipelineConfig, TranslateFn } from "../types";
import { api } from "../api";
import { getErrorMessage } from "../utils/errors";
import { useLibraryStore, useUiStore } from "../stores";
import {
  cancelBackgroundMetadataDownload,
  startAllMetadataEnrichment,
} from "../services/metadataBackgroundRunner";

export interface UsePluginManagerOptions {
  setStatusMessage?: (msg: string) => void;
  statusText: TranslateFn;
  refreshLibrary?: () => Promise<void>;
  t: TranslateFn;
}

export function usePluginManager({
  setStatusMessage: propSetStatusMessage,
  statusText,
  refreshLibrary: propRefreshLibrary,
  t,
}: UsePluginManagerOptions) {
  const storeSetStatusMessage = useUiStore((s) => s.setStatusMessage);
  const showPluginModal = useUiStore((s) => s.showPluginModal);
  const setShowPluginModal = useUiStore((s) => s.setShowPluginModal);
  const showBatchEnrichModal = useUiStore((s) => s.showBatchEnrichModal);
  const setShowBatchEnrichModal = useUiStore((s) => s.setShowBatchEnrichModal);
  const isPlayniteImportOpen = useUiStore((s) => s.isPlayniteImportOpen);
  const setIsPlayniteImportOpen = useUiStore((s) => s.setIsPlayniteImportOpen);
  const storeRefreshLibrary = useLibraryStore((s) => s.refreshLibrary);

  const setStatusMessage = propSetStatusMessage ?? storeSetStatusMessage;
  const refreshLibrary = propRefreshLibrary ?? storeRefreshLibrary;

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    cover_source: "steamgriddb",
    background_source: "steamgriddb",
    score_source: "opencritic",
    details_source: "steam",
    preserve_existing_artwork: true,
  });
  const [editingSettings, setEditingSettings] = useState<Record<string, PluginSettingsMap>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<
    Record<string, { loading: boolean; success?: boolean; message?: string }>
  >({});
  const metadataDownload = useUiStore((s) => s.metadataDownload);
  const isPipelineEnriching =
    metadataDownload?.status === "running" && metadataDownload.mode !== "single";
  const [pipelineProgress, setPipelineProgress] = useState<string | null>(null);

  const loadProvidersAndConfig = useCallback(async () => {
    try {
      const provs = await api.metadata.getProviders();
      if (provs) {
        setProviders(provs);
        const settingsMap: Record<string, PluginSettingsMap> = {};
        provs.forEach((p) => {
          settingsMap[p.id] = { ...(p.settings_values || {}) };
        });
        setEditingSettings(settingsMap);
      }
      const pipe = await api.metadata.getPipelineConfig();
      if (pipe) {
        setPipelineConfig(pipe);
      }
    } catch (err) {
      console.warn("Failed loading metadata providers/config:", err);
    }
  }, []);

  const handleSaveProviderSettings = async (providerId: string) => {
    const s = editingSettings[providerId] || {};
    await api.metadata.saveProviderSettings(providerId, s);
    setStatusMessage(statusText("provider_saved", { provider: providerId }));
    await loadProvidersAndConfig();
  };

  const handleToggleProvider = async (providerId: string, enabled: boolean) => {
    await api.metadata.toggleProvider(providerId, enabled);
    setStatusMessage(statusText(enabled ? "provider_enabled" : "provider_disabled", { provider: providerId }));
    await loadProvidersAndConfig();
  };

  const handleTestConnection = async (providerId: string) => {
    const s = editingSettings[providerId] || {};
    await api.metadata.saveProviderSettings(providerId, s);

    setTestStatus((prev) => ({ ...prev, [providerId]: { loading: true } }));
    try {
      const res = await api.metadata.testProviderConnection(providerId);
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { loading: false, success: true, message: res || "Connessione riuscita" },
      }));
    } catch (err: unknown) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: { loading: false, success: false, message: getErrorMessage(err) },
      }));
    }
    await loadProvidersAndConfig();
  };

  const handleSavePipelineConfig = async () => {
    await api.metadata.savePipelineConfig(pipelineConfig);
    setStatusMessage(statusText("pipeline_saved"));
    await loadProvidersAndConfig();
  };

  const handleRunMassivePipeline = async () => {
    const task = startAllMetadataEnrichment({
      preparingLabel: t("app_misc.pipeline_starting"),
      onComplete: refreshLibrary,
    });
    if (!task) return;
    setPipelineProgress(t("app_misc.pipeline_starting"));
    try {
      const count = await task;
      setPipelineProgress(`Completato! ${count || 0} titoli aggiornati.`);
    } catch (err: unknown) {
      setPipelineProgress(`Errore durante il download: ${getErrorMessage(err)}`);
    }
  };

  const handleCancelPipeline = async () => {
    try {
      setPipelineProgress(t("app_misc.pipeline_stopping"));
      await cancelBackgroundMetadataDownload();
      setStatusMessage(statusText("download_cancel_requested"));
    } catch (err: unknown) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  return {
    showPluginModal,
    setShowPluginModal,
    showBatchEnrichModal,
    setShowBatchEnrichModal,
    isPlayniteImportOpen,
    setIsPlayniteImportOpen,
    providers,
    setProviders,
    pipelineConfig,
    setPipelineConfig,
    editingSettings,
    setEditingSettings,
    showApiKey,
    setShowApiKey,
    testStatus,
    setTestStatus,
    isPipelineEnriching,
    pipelineProgress,
    setPipelineProgress,
    loadProvidersAndConfig,
    handleSaveProviderSettings,
    handleToggleProvider,
    handleTestConnection,
    handleSavePipelineConfig,
    handleRunMassivePipeline,
    handleCancelPipeline,
  };
}
