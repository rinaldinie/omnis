import React from "react";
import { SlidersHorizontal, RefreshCw, Check, ArrowUp, ArrowDown, Database, Image, Award, Clock } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { ProviderInfo, MetadataPipelineConfig } from "../../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "../SettingsControls";
import { StoreIcon } from "../../StoreBadge";

export interface PipelineSectionProps {
  pipelineConfig: MetadataPipelineConfig;
  setPipelineConfig: React.Dispatch<React.SetStateAction<MetadataPipelineConfig>>;
  providers: ProviderInfo[];
  onMovePriority: (index: number, direction: -1 | 1) => void;
  onSavePipeline: () => void;
  isSaving: boolean;
}

export const PipelineSection: React.FC<PipelineSectionProps> = ({
  pipelineConfig,
  setPipelineConfig,
  providers,
  onMovePriority,
  onSavePipeline,
  isSaving,
}) => {
  const { t } = useTranslation();

  const renderProviderIcon = (provId: string) => {
    switch (provId) {
      case "steamgriddb":
        return <Image className="w-4 h-4 text-emerald-400" />;
      case "steam":
        return <StoreIcon library="steam" className="w-4 h-4 text-sky-400" />;
      case "igdb":
        return <Database className="w-4 h-4 text-purple-400" />;
      case "opencritic":
        return <Award className="w-4 h-4 text-amber-400" />;
      case "howlongtobeat":
        return <Clock className="w-4 h-4 text-indigo-400" />;
      case "gog":
        return <StoreIcon library="gog" className="w-4 h-4 text-purple-300" />;
      default:
        return <SlidersHorizontal className="w-4 h-4 text-slate-400" />;
    }
  };

  const getSourceDisplayName = (id: string) => {
    switch (id) {
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
        className="p-6 rounded-2xl border flex items-center justify-between"
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
              {t("metadata_settings.pipeline_title", { defaultValue: "Regole e Priorità Pipeline" })}
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              {t("metadata_settings.pipeline_desc", {
                defaultValue: "Configura la priorità di interrogazione e le sorgenti preferite per cover, banner e dettagli.",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Provider Priority Ranking Reorder List */}
      <SettingGroup
        title={t("metadata_settings.ranking_title", { defaultValue: "Ordine Priorità Provider" })}
        description={t("metadata_settings.ranking_desc", {
          defaultValue: "Trascina o usa le frecce per definire l'ordine con cui i provider arricchiscono i campi mancanti del gioco.",
        })}
      >
        <div className="p-4 space-y-2">
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
                className="flex items-center justify-between p-3 rounded-xl border bg-slate-900/40 transition-colors"
                style={{ borderColor: "var(--border-color)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-mono text-xs font-bold text-slate-500">
                    #{index + 1}
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                    {renderProviderIcon(provId)}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white">
                      {getSourceDisplayName(provId)}
                    </span>
                    {!isEnabled && (
                      <span className="ml-2 text-[10px] text-amber-400 font-semibold">
                        ({t("common.disabled", { defaultValue: "Disattivato" })})
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onMovePriority(index, -1)}
                    disabled={isFirst}
                    aria-label={`Sposta su ${provId}`}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMovePriority(index, 1)}
                    disabled={isLast}
                    aria-label={`Sposta giù ${provId}`}
                    className="p-1.5 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SettingGroup>

      {/* Field Level Preferred Sources */}
      <SettingGroup
        title={t("metadata_settings.preferred_sources_title", { defaultValue: "Sorgenti Preferite per Campo" })}
        description={t("metadata_settings.preferred_sources_desc", {
          defaultValue: "Scegli la sorgente primaria a cui dare precedenza per specifici asset visivi.",
        })}
      >
        <SettingRow
          title={t("metadata_settings.cover_source_title", { defaultValue: "Copertina Verticale" })}
          description={t("metadata_settings.cover_source_desc", {
            defaultValue: "Provider preferito per le cover 600x900 della libreria.",
          })}
        >
          <select
            value={pipelineConfig.cover_source}
            onChange={(e) =>
              setPipelineConfig((prev) => ({
                ...prev,
                cover_source: e.target.value,
              }))
            }
            className="bg-slate-900/90 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            style={{ borderColor: "var(--border-color)" }}
          >
            <option value="steamgriddb">SteamGridDB</option>
            <option value="steam">Steam Store</option>
            <option value="igdb">IGDB</option>
            <option value="gog">GOG Store</option>
          </select>
        </SettingRow>

        <SettingRow
          title={t("metadata_settings.background_source_title", { defaultValue: "Sfondo & Hero Banner" })}
          description={t("metadata_settings.background_source_desc", {
            defaultValue: "Provider preferito per gli sfondi panoramici in Fullscreen e Vista Dettagli.",
          })}
        >
          <select
            value={pipelineConfig.background_source}
            onChange={(e) =>
              setPipelineConfig((prev) => ({
                ...prev,
                background_source: e.target.value,
              }))
            }
            className="bg-slate-900/90 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            style={{ borderColor: "var(--border-color)" }}
          >
            <option value="steamgriddb">SteamGridDB</option>
            <option value="steam">Steam Store</option>
            <option value="igdb">IGDB</option>
          </select>
        </SettingRow>

        <SettingRow
          title={t("metadata_settings.preserve_artwork_title", { defaultValue: "Conserva Artwork Esistente" })}
          description={t("metadata_settings.preserve_artwork_desc", {
            defaultValue: "Evita di sovrascrivere immagini locali o personalizzate durante i batch di arricchimento.",
          })}
        >
          <ToggleSwitch
            checked={pipelineConfig.preserve_existing_artwork ?? true}
            onChange={(val) =>
              setPipelineConfig((prev) => ({
                ...prev,
                preserve_existing_artwork: val,
              }))
            }
            ariaLabel="Conserva Artwork Esistente"
          />
        </SettingRow>
      </SettingGroup>

      {/* Save Pipeline Config Footer */}
      <div
        className="p-4 rounded-2xl border flex items-center justify-between gap-3 bg-black/20"
        style={{ borderColor: "var(--border-color)" }}
      >
        <span className="text-xs text-slate-400">
          {t("metadata_settings.pipeline_footer_note", {
            defaultValue: "I salvataggi modificano immediatamente il comportamento di scansione",
          })}
        </span>
        <button
          type="button"
          onClick={onSavePipeline}
          disabled={isSaving}
          className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)" }}
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>{t("common.save", { defaultValue: "Salva Configurazione" })}</span>
        </button>
      </div>
    </div>
  );
};
