import React, { useState } from "react";
import {
  SlidersHorizontal,
  RefreshCw,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Database,
  Image,
  Award,
  Clock,
  Sparkles,
  Plus,
  X,
  Zap,
  Globe,
  RotateCcw,
  CheckSquare,
  Square,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "../../../i18n";
import { ProviderInfo, MetadataPipelineConfig } from "../../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "../SettingsControls";
import { StoreIcon } from "../../StoreBadge";
import {
  ALL_METADATA_SOURCES,
  METADATA_FIELDS_DEFINITIONS,
  getDefaultFieldRules,
} from "./types";

export interface PipelineSectionProps {
  pipelineConfig: MetadataPipelineConfig;
  setPipelineConfig: React.Dispatch<React.SetStateAction<MetadataPipelineConfig>>;
  providers: ProviderInfo[];
  onMovePriority: (index: number, direction: -1 | 1) => void;
  onSavePipeline: () => void;
  isSaving: boolean;
  onToggleField?: (fieldId: string, enabled: boolean) => void;
  onMoveFieldSource?: (fieldId: string, sourceIndex: number, direction: -1 | 1) => void;
  onAddFieldSource?: (fieldId: string, sourceId: string) => void;
  onRemoveFieldSource?: (fieldId: string, sourceIndex: number) => void;
  onApplyPreset?: (preset: "official_first" | "community_first" | "reset_defaults") => void;
}

export const PipelineSection: React.FC<PipelineSectionProps> = ({
  pipelineConfig,
  setPipelineConfig,
  providers,
  onMovePriority,
  onSavePipeline,
  isSaving,
  onToggleField,
  onMoveFieldSource,
  onAddFieldSource,
  onRemoveFieldSource,
  onApplyPreset,
}) => {
  const { t } = useTranslation();
  const [addingSourceForField, setAddingSourceForField] = useState<string | null>(null);

  const fieldRules = pipelineConfig.fields || getDefaultFieldRules();

  const renderProviderIcon = (provId: string, className = "w-3.5 h-3.5") => {
    switch (provId) {
      case "official_store":
        return <Sparkles className={`${className} text-amber-300`} />;
      case "steamgriddb":
        return <Image className={`${className} text-emerald-400`} />;
      case "steam":
        return <StoreIcon library="steam" className={`${className} text-sky-400`} />;
      case "igdb":
        return <Database className={`${className} text-purple-400`} />;
      case "opencritic":
        return <Award className={`${className} text-amber-400`} />;
      case "howlongtobeat":
        return <Clock className={`${className} text-indigo-400`} />;
      case "gog":
        return <StoreIcon library="gog" className={`${className} text-purple-300`} />;
      default:
        return <SlidersHorizontal className={`${className} text-slate-400`} />;
    }
  };

  const getSourceDisplayName = (id: string) => {
    switch (id) {
      case "official_store":
        return t("metadata_settings.source_official_store", {
          defaultValue: "Official Store",
        });
      case "steamgriddb":
        return "SteamGridDB";
      case "steam":
        return "Steam Store";
      case "igdb":
        return "IGDB";
      case "opencritic":
        return "OpenCritic";
      case "howlongtobeat":
        return "HowLongToBeat";
      case "gog":
        return "GOG Store";
      default:
        return id.toUpperCase();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div
        className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              color: "var(--accent-primary)",
            }}
          >
            <SlidersHorizontal className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">
              {t("metadata_settings.pipeline_title", {
                defaultValue: "Metadata Resolution & Priorities",
              })}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              {t("metadata_settings.pipeline_desc_granular", {
                defaultValue:
                  "Configure whether to automatically download each metadata field and set the source fallback order.",
              })}
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        {onApplyPreset && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onApplyPreset("official_first")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              title={t("metadata_settings.preset_official_title", {
                defaultValue: "Official Store prioritized for all data",
              })}
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Official First</span>
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset("community_first")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              title={t("metadata_settings.preset_community_title", {
                defaultValue: "Priority to universal databases (IGDB, SteamGridDB, OpenCritic)",
              })}
            >
              <Globe className="w-3.5 h-3.5 text-purple-400" />
              <span>Community & DB First</span>
            </button>
            <button
              type="button"
              onClick={() => onApplyPreset("reset_defaults")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
              title={t("metadata_settings.preset_reset_title", {
                defaultValue: "Reset to recommended default settings",
              })}
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>{t("common.reset", { defaultValue: "Defaults" })}</span>
            </button>
          </div>
        )}
      </div>

      {/* Playnite-Parity Granular Field Priorities Table */}
      <SettingGroup
        title={t("metadata_settings.granular_fields_title", {
          defaultValue: "Preferred Sources per Field",
        })}
        description={t("metadata_settings.granular_fields_desc", {
          defaultValue:
            "Enable or disable download for each field and configure the ordered fallback sequence.",
        })}
        icon={<SlidersHorizontal className="w-4 h-4" />}
      >
        <div className="space-y-1.5 p-1">
          {METADATA_FIELDS_DEFINITIONS.map((fieldDef) => {
            const rule = fieldRules[fieldDef.id] || {
              enabled: true,
              sources: ["official_store"],
            };
            const availableToAdd = ALL_METADATA_SOURCES.filter(
              (src) => !rule.sources.includes(src)
            );

            return (
              <div
                key={fieldDef.id}
                className={`p-2.5 sm:px-3 sm:py-2 transition-all rounded-xl border ${
                  rule.enabled
                    ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.10] hover:bg-white/[0.03]"
                    : "bg-white/[0.005] border-white/[0.03] opacity-60"
                }`}
              >
                {/* RIGA 1: Header del Campo (Checkbox, Titolo, Categoria, Descrizione, Conteggio) */}
                <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        onToggleField && onToggleField(fieldDef.id, !rule.enabled)
                      }
                      className="p-0.5 rounded text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
                      title={
                        rule.enabled
                          ? t("metadata_settings.disable_field", { defaultValue: "Disable this field" })
                          : t("metadata_settings.enable_field", { defaultValue: "Enable this field" })
                      }
                    >
                      {rule.enabled ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-600" />
                      )}
                    </button>

                    <span
                      className={`text-xs font-bold truncate ${
                        rule.enabled ? "text-slate-100" : "text-slate-400 line-through"
                      }`}
                    >
                      {t(fieldDef.labelKey, { defaultValue: fieldDef.defaultLabel })}
                    </span>

                    <span className="text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.06] shrink-0">
                      {fieldDef.category}
                    </span>

                    <p className="text-[11px] text-slate-400 truncate hidden md:block max-w-sm pl-1">
                      {t(fieldDef.descriptionKey, {
                        defaultValue: fieldDef.defaultDescription,
                      })}
                    </p>
                  </div>

                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                      rule.enabled
                        ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20"
                        : "bg-slate-800 text-slate-500 border-slate-700"
                    }`}
                  >
                    {rule.enabled
                      ? `${rule.sources.length} ${
                          rule.sources.length === 1
                            ? t("metadata_settings.source_singular", { defaultValue: "source" })
                            : t("metadata_settings.source_plural", { defaultValue: "sources" })
                        }`
                      : t("common.disabled", { defaultValue: "Disabled" })}
                  </span>
                </div>

                {/* RIGA 2: Sequenza di Priorità Fallback Compatta */}
                <div className="pt-1.5 flex items-center gap-1.5 flex-wrap">
                  {rule.sources.map((srcId, srcIdx) => {
                    const isFirst = srcIdx === 0;
                    const isLast = srcIdx === rule.sources.length - 1;

                    return (
                      <React.Fragment key={`${srcId}-${srcIdx}`}>
                        <div
                          className={`flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border text-xs font-semibold backdrop-blur-md transition-all group ${
                            isFirst ? "ring-1 ring-amber-400/20 shadow-xs" : ""
                          }`}
                          style={{
                            backgroundColor:
                              isFirst
                                ? "color-mix(in srgb, var(--accent-primary) 15%, rgba(255,255,255,0.03))"
                                : "rgba(255,255,255,0.03)",
                            borderColor:
                              isFirst
                                ? "color-mix(in srgb, var(--accent-primary) 40%, rgba(255,255,255,0.12))"
                                : "rgba(255,255,255,0.08)",
                            color: isFirst ? "white" : "#cbd5e1",
                          }}
                        >
                          {/* Priority number badge */}
                          <span
                            className={`text-[9px] font-mono font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                              isFirst
                                ? "bg-amber-400/20 text-amber-300 border border-amber-400/30"
                                : "bg-white/10 text-slate-300"
                            }`}
                            title={
                              isFirst
                                ? t("metadata_settings.primary_choice", { defaultValue: "1st Choice (Primary)" })
                                : `${t("metadata_settings.priority_prefix", { defaultValue: "Priority" })} #${srcIdx + 1}`
                            }
                          >
                            {srcIdx + 1}
                          </span>

                          {/* Provider Icon & Name */}
                          <div className="shrink-0 flex items-center gap-1">
                            {renderProviderIcon(srcId, "w-3 h-3")}
                            <span className="text-[11px] font-medium">
                              {getSourceDisplayName(srcId)}
                            </span>
                          </div>

                          {/* Reorder and remove mini buttons */}
                          <div className="flex items-center gap-0.5 ml-1 border-l border-white/10 pl-0.5">
                            {onMoveFieldSource && (
                              <>
                                <button
                                  type="button"
                                  disabled={isFirst}
                                  onClick={() =>
                                    onMoveFieldSource(fieldDef.id, srcIdx, -1)
                                  }
                                  className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
                                  title={t("metadata_settings.move_up", { defaultValue: "Move up" })}
                                >
                                  <ArrowLeft className="w-2.5 h-2.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isLast}
                                  onClick={() =>
                                    onMoveFieldSource(fieldDef.id, srcIdx, 1)
                                  }
                                  className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
                                  title={t("metadata_settings.move_down", { defaultValue: "Move down" })}
                                >
                                  <ArrowRight className="w-2.5 h-2.5" />
                                </button>
                              </>
                            )}

                            {onRemoveFieldSource && rule.sources.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRemoveFieldSource(fieldDef.id, srcIdx)
                                }
                                className="p-0.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-colors cursor-pointer ml-0.5"
                                title={t("metadata_settings.remove_source", { defaultValue: "Remove this provider" })}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Fallback arrow connector between sources */}
                        {!isLast && (
                          <ChevronRight className="w-3 h-3 text-slate-500/70 shrink-0" />
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* Add Source button/popover */}
                  {onAddFieldSource && availableToAdd.length > 0 && (
                    <div className="relative inline-block ml-0.5">
                      {addingSourceForField === fieldDef.id ? (
                        <div className="flex items-center gap-1 bg-slate-900 border border-white/20 rounded-lg px-2 py-0.5 shadow-xl animate-in fade-in">
                          <select
                            autoFocus
                            onChange={(e) => {
                              if (e.target.value) {
                                onAddFieldSource(fieldDef.id, e.target.value);
                                setAddingSourceForField(null);
                              }
                            }}
                            defaultValue=""
                            className="bg-transparent text-[11px] text-white focus:outline-none cursor-pointer py-0.5"
                          >
                            <option value="" disabled>
                              {t("metadata_settings.select_source", { defaultValue: "Select source..." })}
                            </option>
                            {availableToAdd.map((src) => (
                              <option
                                key={src}
                                value={src}
                                className="bg-slate-900 text-white"
                              >
                                {getSourceDisplayName(src)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setAddingSourceForField(null)}
                            className="p-0.5 rounded text-slate-400 hover:text-white"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAddingSourceForField(fieldDef.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-white/20 hover:border-white/40 bg-white/[0.02] hover:bg-white/[0.06] text-[11px] font-medium text-slate-400 hover:text-white transition-all cursor-pointer"
                          title={t("metadata_settings.add_fallback_source", { defaultValue: "Add fallback provider to this field" })}
                        >
                          <Plus className="w-3 h-3" />
                          <span>{t("common.add", { defaultValue: "Add" })}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SettingGroup>

      {/* Preserve Existing Artwork Protection */}
      <SettingGroup
        title={t("metadata_settings.pipeline_preserve_title", {
          defaultValue: "Preserve Existing Media & Data",
        })}
        description={t("metadata_settings.pipeline_preserve_desc", {
          defaultValue:
            "Prevent accidental overwriting of already downloaded covers, backgrounds, and metadata.",
        })}
      >
        <SettingRow
          title={t("metadata_settings.pipeline_preserve_row_title", {
            defaultValue: "Preserve Existing Artwork",
          })}
          description={t("metadata_settings.pipeline_preserve_row_desc", {
            defaultValue:
              "When enabled, sync only enriches titles that are missing media, preserving your custom artwork.",
          })}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold text-slate-300">
              {pipelineConfig.preserve_existing_artwork !== false
                ? t("metadata_settings.pipeline_preserve_protected", {
                    defaultValue: "Protected",
                  })
                : t("metadata_settings.pipeline_preserve_overwrite", {
                    defaultValue: "Overwrite",
                  })}
            </span>
            <ToggleSwitch
              checked={pipelineConfig.preserve_existing_artwork !== false}
              onChange={(val) =>
                setPipelineConfig({
                  ...pipelineConfig,
                  preserve_existing_artwork: val,
                })
              }
              ariaLabel={t("metadata_settings.pipeline_preserve_row_title", {
                defaultValue: "Preserve Existing Artwork",
              })}
            />
          </div>
        </SettingRow>
      </SettingGroup>

      {/* Global Provider Priority Fallback ranking */}
      <SettingGroup
        title={t("metadata_settings.ranking_title", {
          defaultValue: "Metadata Sources Priority Ranking",
        })}
        description={t("metadata_settings.ranking_desc", {
          defaultValue:
            "Order sources from preferred (#1) to lowest priority. Used as fallback for search and metadata resolution.",
        })}
        icon={<SlidersHorizontal className="w-4 h-4" />}
      >
        {(pipelineConfig.provider_priority || []).map((provId, index) => {
          const priorityList = pipelineConfig.provider_priority || [];
          const isFirst = index === 0;
          const isLast = index === priorityList.length - 1;
          const provMeta = providers.find(
            (p) => p.id === provId || (provId === "howlongtobeat" && p.id === "hltb")
          );
          const isEnabled = provMeta ? provMeta.is_enabled : true;

          return (
            <div
              key={provId}
              className="flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="w-5 text-[11px] font-mono font-bold text-slate-500">
                  #{index + 1}
                </span>
                <div className="w-6 h-6 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
                  {renderProviderIcon(provId)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">
                    {getSourceDisplayName(provId)}
                  </span>
                  {!isEnabled && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                      {t("common.disabled", { defaultValue: "Disabled" })}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isFirst}
                  onClick={() => onMovePriority(index, -1)}
                  className="p-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-20 transition-colors cursor-pointer"
                  title={t("metadata_settings.move_up", { defaultValue: "Move up" })}
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => onMovePriority(index, 1)}
                  className="p-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 disabled:opacity-20 transition-colors cursor-pointer"
                  title={t("metadata_settings.move_down", { defaultValue: "Move down" })}
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </SettingGroup>

      {/* Save Action */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          disabled={isSaving}
          onClick={onSavePipeline}
          className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer"
          style={{ backgroundColor: "var(--accent-primary)" }}
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span>
            {t("metadata_settings.btn_save_pipeline", {
              defaultValue: "Save Pipeline Rules",
            })}
          </span>
        </button>
      </div>
    </div>
  );
};
