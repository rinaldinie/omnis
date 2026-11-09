import { useState, useEffect, useCallback } from "react";
import { api } from "../../../api";
import { useTranslation } from "../../../i18n";
import { soundEffects } from "../../../utils/soundEffects";
import { ProviderInfo, MetadataPipelineConfig } from "../../../types";
import { ALL_METADATA_SOURCES, normalizeProviderPriority } from "./types";

export function useMetadataSettingsManager() {
  const { t } = useTranslation();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    cover_source: "steamgriddb",
    background_source: "steamgriddb",
    score_source: "opencritic",
    details_source: "steam",
    preserve_existing_artwork: true,
    provider_priority: ALL_METADATA_SOURCES,
  });

  const [settingsValues, setSettingsValues] = useState<Record<string, Record<string, any>>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testStatus, setTestStatus] = useState<
    Record<string, { loading: boolean; success?: boolean; message?: string }>
  >({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [isSavingPipeline, setIsSavingPipeline] = useState<boolean>(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [provList, pipe] = await Promise.all([
        api.metadata.getProviders(),
        api.metadata.getPipelineConfig(),
      ]);

      if (provList && Array.isArray(provList)) {
        setProviders(provList);
        const map: Record<string, Record<string, any>> = {};
        provList.forEach((p) => {
          map[p.id] = { ...(p.settings_values || {}) };
        });
        setSettingsValues((prev) => ({ ...map, ...prev }));
      }

      if (pipe) {
        setPipelineConfig({
          ...pipe,
          provider_priority: normalizeProviderPriority(pipe.provider_priority),
        });
      }
    } catch (err) {
      console.warn("Failed loading metadata settings data:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showBannerMessage = (type: "success" | "error" | "info", message: string) => {
    setBanner({ type, message });
    setTimeout(() => {
      setBanner((cur) => (cur?.message === message ? null : cur));
    }, 4500);
  };

  const getProvider = (id: string): ProviderInfo | undefined => {
    return providers.find(
      (p) => p.id === id || (id === "hltb" && (p.id === "howlongtobeat" || p.id === "hltb"))
    );
  };

  const handleSettingChange = (providerId: string, key: string, value: string) => {
    setSettingsValues((prev) => ({
      ...prev,
      [providerId]: {
        ...(prev[providerId] || {}),
        [key]: value,
      },
    }));
  };

  const handleToggle = async (providerId: string, enabled: boolean) => {
    try {
      soundEffects.playSelect();
      await api.metadata.toggleProvider(providerId, enabled);
      showBannerMessage(
        "success",
        enabled
          ? t("metadata_settings.provider_enabled", {
              provider: providerId.toUpperCase(),
              defaultValue: `Provider ${providerId.toUpperCase()} enabled.`,
            })
          : t("metadata_settings.provider_disabled", {
              provider: providerId.toUpperCase(),
              defaultValue: `Provider ${providerId.toUpperCase()} disabled.`,
            })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage("error", String(err?.message || err));
    }
  };

  const handleSaveSettings = async (providerId: string) => {
    setIsSaving((prev) => ({ ...prev, [providerId]: true }));
    try {
      soundEffects.playSelect();
      const s = settingsValues[providerId] || {};
      await api.metadata.saveProviderSettings(providerId, s);
      showBannerMessage(
        "success",
        t("metadata_settings.saved_success", {
          provider: providerId.toUpperCase(),
          defaultValue: `${providerId.toUpperCase()} settings saved successfully.`,
        })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage("error", String(err?.message || err));
    } finally {
      setIsSaving((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const handleTestConnection = async (providerId: string) => {
    setTestStatus((prev) => ({
      ...prev,
      [providerId]: { loading: true },
    }));

    try {
      soundEffects.playSelect();
      const s = settingsValues[providerId] || {};
      await api.metadata.saveProviderSettings(providerId, s);

      const res = await api.metadata.testProviderConnection(providerId);
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: true,
          message: res || t("metadata_settings.test_success", { defaultValue: "Connection successful!" }),
        },
      }));
      await loadData();
    } catch (err: any) {
      setTestStatus((prev) => ({
        ...prev,
        [providerId]: {
          loading: false,
          success: false,
          message: String(err?.message || err),
        },
      }));
    }
  };

  const handleSavePipeline = async () => {
    setIsSavingPipeline(true);
    try {
      soundEffects.playSelect();
      await api.metadata.savePipelineConfig(pipelineConfig);
      showBannerMessage(
        "success",
        t("metadata_settings.pipeline_saved", {
          defaultValue: "Pipeline configuration saved successfully.",
        })
      );
      await loadData();
    } catch (err: any) {
      showBannerMessage("error", String(err?.message || err));
    } finally {
      setIsSavingPipeline(false);
    }
  };

  const handleMovePriority = async (index: number, direction: -1 | 1) => {
    const currentList = normalizeProviderPriority(pipelineConfig.provider_priority);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= currentList.length) return;
    soundEffects.playNav();
    const nextPriority = [...currentList];
    const [moved] = nextPriority.splice(index, 1);
    nextPriority.splice(nextIndex, 0, moved);
    const updated: MetadataPipelineConfig = {
      ...pipelineConfig,
      provider_priority: nextPriority,
    };
    setPipelineConfig(updated);
    try {
      await api.metadata.savePipelineConfig(updated);
    } catch (err) {
      console.warn("Failed auto-saving provider priority:", err);
    }
  };

  const toggleShowSecret = (providerId: string) => {
    setShowSecret((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  return {
    providers,
    pipelineConfig,
    setPipelineConfig,
    settingsValues,
    showSecret,
    toggleShowSecret,
    testStatus,
    isSaving,
    isSavingPipeline,
    banner,
    getProvider,
    handleSettingChange,
    handleToggle,
    handleSaveSettings,
    handleTestConnection,
    handleSavePipeline,
    handleMovePriority,
  };
}
