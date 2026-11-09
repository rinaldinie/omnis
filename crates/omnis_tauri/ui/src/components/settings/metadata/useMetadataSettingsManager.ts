import { useState, useEffect, useCallback } from "react";
import { api } from "../../../api";
import { useTranslation } from "../../../i18n";
import { soundEffects } from "../../../utils/soundEffects";
import { ProviderInfo, MetadataPipelineConfig } from "../../../types";
import {
  ALL_METADATA_SOURCES,
  getDefaultFieldRules,
  normalizeProviderPriority,
} from "./types";

export function useMetadataSettingsManager() {
  const { t } = useTranslation();

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [pipelineConfig, setPipelineConfig] = useState<MetadataPipelineConfig>({
    fields: getDefaultFieldRules(),
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
        const defaultRules = getDefaultFieldRules();
        const mergedFields = { ...defaultRules, ...(pipe.fields || {}) };
        setPipelineConfig({
          ...pipe,
          fields: mergedFields,
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

  const handleToggleField = (fieldId: string, enabled: boolean) => {
    soundEffects.playSelect();
    const fields = { ...(pipelineConfig.fields || getDefaultFieldRules()) };
    const currentRule = fields[fieldId] || { enabled: true, sources: ["official_store"] };
    fields[fieldId] = { ...currentRule, enabled };
    setPipelineConfig({ ...pipelineConfig, fields });
  };

  const handleMoveFieldSource = (
    fieldId: string,
    sourceIndex: number,
    direction: -1 | 1
  ) => {
    const fields = { ...(pipelineConfig.fields || getDefaultFieldRules()) };
    const rule = fields[fieldId];
    if (!rule || !rule.sources) return;
    const nextIndex = sourceIndex + direction;
    if (nextIndex < 0 || nextIndex >= rule.sources.length) return;
    soundEffects.playNav();
    const nextSources = [...rule.sources];
    const [moved] = nextSources.splice(sourceIndex, 1);
    nextSources.splice(nextIndex, 0, moved);
    fields[fieldId] = { ...rule, sources: nextSources };
    setPipelineConfig({ ...pipelineConfig, fields });
  };

  const handleAddFieldSource = (fieldId: string, sourceId: string) => {
    const fields = { ...(pipelineConfig.fields || getDefaultFieldRules()) };
    const rule = fields[fieldId] || { enabled: true, sources: [] };
    if (rule.sources.includes(sourceId)) return;
    soundEffects.playSelect();
    fields[fieldId] = { ...rule, sources: [...rule.sources, sourceId] };
    setPipelineConfig({ ...pipelineConfig, fields });
  };

  const handleRemoveFieldSource = (fieldId: string, sourceIndex: number) => {
    const fields = { ...(pipelineConfig.fields || getDefaultFieldRules()) };
    const rule = fields[fieldId];
    if (!rule || !rule.sources) return;
    soundEffects.playSelect();
    const nextSources = rule.sources.filter((_, idx) => idx !== sourceIndex);
    fields[fieldId] = { ...rule, sources: nextSources };
    setPipelineConfig({ ...pipelineConfig, fields });
  };

  const handleApplyPreset = (preset: "official_first" | "community_first" | "reset_defaults") => {
    soundEffects.playSelect();
    if (preset === "reset_defaults") {
      setPipelineConfig({
        ...pipelineConfig,
        fields: getDefaultFieldRules(),
        preserve_existing_artwork: true,
      });
      showBannerMessage("info", t("metadata_settings.preset_reset_msg", { defaultValue: "Regole pipeline reimpostate sui valori predefiniti." }));
      return;
    }

    const currentFields = { ...(pipelineConfig.fields || getDefaultFieldRules()) };
    const updatedFields: Record<string, any> = {};

    Object.entries(currentFields).forEach(([fieldKey, rule]) => {
      let sources = [...rule.sources];
      if (preset === "official_first") {
        if (!sources.includes("official_store")) {
          sources.unshift("official_store");
        } else {
          sources = ["official_store", ...sources.filter((s) => s !== "official_store")];
        }
      } else if (preset === "community_first") {
        // Prefer specialized universal databases
        if (fieldKey.includes("cover") || fieldKey.includes("background")) {
          sources = ["steamgriddb", ...sources.filter((s) => s !== "steamgriddb")];
        } else if (fieldKey.includes("score")) {
          sources = ["opencritic", "igdb", ...sources.filter((s) => s !== "opencritic" && s !== "igdb")];
        } else {
          sources = ["igdb", ...sources.filter((s) => s !== "igdb")];
        }
        if (!sources.includes("official_store")) {
          sources.push("official_store");
        }
      }
      updatedFields[fieldKey] = { ...rule, sources };
    });

    setPipelineConfig({
      ...pipelineConfig,
      fields: updatedFields,
    });

    showBannerMessage(
      "success",
      preset === "official_first"
        ? t("metadata_settings.preset_official_msg", { defaultValue: "Preset 'Official Store First' applicato." })
        : t("metadata_settings.preset_community_msg", { defaultValue: "Preset 'Community & DB First' applicato." })
    );
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
    handleToggleField,
    handleMoveFieldSource,
    handleAddFieldSource,
    handleRemoveFieldSource,
    handleApplyPreset,
  };
}
