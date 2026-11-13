import React from "react";
import { Sliders, ArrowUp, ArrowDown, Folder, Star, Scroll, ShieldCheck } from "lucide-react";
import { ProviderInfo, MetadataPipelineConfig } from "../../../types";
import { useTranslation } from "../../../i18n";
import { PROVIDER_METAS, renderProviderIcon, getProviderColor } from "./constants";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PipelinePriorityTabProps {
  priorityOrder: string[];
  movePriority: (index: number, direction: "up" | "down") => void;
  providers: ProviderInfo[];
  pipelineConfig: MetadataPipelineConfig;
  setPipelineConfig: React.Dispatch<React.SetStateAction<MetadataPipelineConfig>>;
  onSavePipelineConfig: () => void;
  tr: (text: string) => string;
}

export const PipelinePriorityTab: React.FC<PipelinePriorityTabProps> = ({
  priorityOrder,
  movePriority,
  providers,
  pipelineConfig,
  setPipelineConfig,
  onSavePipelineConfig,
  tr: _tr,
}) => {
  const { t } = useTranslation();

  return (
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
                className={`py-2 px-3.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                  isFirst
                    ? "border-emerald-500/40 bg-emerald-500/10 shadow-xs"
                    : "border-white/5 bg-slate-900/40 hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* Rank number badge */}
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0 ${
                      isFirst
                        ? "bg-emerald-500 text-black shadow-xs font-black"
                        : "bg-slate-800 text-slate-300 border border-slate-700/60"
                    }`}
                  >
                    #{idx + 1}
                  </div>

                  {/* Provider icon */}
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-xs text-white shadow-xs shrink-0 border"
                    style={{
                      backgroundColor: getProviderColor(provId),
                      borderColor: "rgba(255,255,255,0.15)",
                    }}
                  >
                    {renderProviderIcon(provId, true)}
                  </div>

                  <div className="min-w-0 flex items-center gap-2">
                    <h4 className="text-xs font-bold text-white truncate">
                      {meta.name}
                    </h4>
                    {isFirst && (
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shrink-0"
                      >
                        {t("plugin_manager.top_priority")}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Order Control Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <ActionTooltip label={t("plugin_manager.move_up")}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      disabled={isFirst}
                      onClick={() => movePriority(idx, "up")}
                      aria-label={t("plugin_manager.move_up")}
                      className="h-auto w-auto p-1 rounded-md border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-20"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                  </ActionTooltip>
                  <ActionTooltip label={t("plugin_manager.move_down")}>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      disabled={isLast}
                      onClick={() => movePriority(idx, "down")}
                      aria-label={t("plugin_manager.move_down")}
                      className="h-auto w-auto p-1 rounded-md border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-20"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                  </ActionTooltip>
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
            <Select
              value={pipelineConfig.cover_source || "steam"}
              onValueChange={(value) =>
                setPipelineConfig({ ...pipelineConfig, cover_source: value })
              }
            >
              <SelectTrigger
                className="w-full h-8 px-3 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steam">Steam Store CDN ({t("plugin_manager.opt_official_zero_config")})</SelectItem>
                <SelectItem value="gog">GOG Catalog ({t("plugin_manager.opt_official_zero_config")})</SelectItem>
                <SelectItem value="steamgriddb">SteamGridDB (Artwork HD 600x900)</SelectItem>
                <SelectItem value="igdb">IGDB (Twitch Database)</SelectItem>
              </SelectContent>
            </Select>
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
            <Select
              value={pipelineConfig.background_source || "steam"}
              onValueChange={(value) =>
                setPipelineConfig({
                  ...pipelineConfig,
                  background_source: value,
                })
              }
            >
              <SelectTrigger
                className="w-full h-8 px-3 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steam">Steam Store CDN ({t("plugin_manager.opt_official")})</SelectItem>
                <SelectItem value="gog">GOG Catalog ({t("plugin_manager.opt_official_artwork")})</SelectItem>
                <SelectItem value="steamgriddb">SteamGridDB (Hero 1920x1080 / 4K)</SelectItem>
                <SelectItem value="igdb">IGDB (Screenshot HD)</SelectItem>
              </SelectContent>
            </Select>
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
            <Select
              value={pipelineConfig.score_source || "steam"}
              onValueChange={(value) =>
                setPipelineConfig({ ...pipelineConfig, score_source: value })
              }
            >
              <SelectTrigger
                className="w-full h-8 px-3 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steam">Steam Metacritic ({t("plugin_manager.opt_steam_metacritic")})</SelectItem>
                <SelectItem value="opencritic">OpenCritic (Top Critic Score)</SelectItem>
                <SelectItem value="igdb">IGDB (Total Rating / Critic Score)</SelectItem>
              </SelectContent>
            </Select>
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
            <Select
              value={pipelineConfig.details_source || "steam"}
              onValueChange={(value) =>
                setPipelineConfig({ ...pipelineConfig, details_source: value })
              }
            >
              <SelectTrigger
                className="w-full h-8 px-3 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steam">Steam Store Engine ({t("plugin_manager.opt_localized")})</SelectItem>
                <SelectItem value="gog">GOG Catalog ({t("plugin_manager.opt_drm_free_catalog")})</SelectItem>
                <SelectItem value="igdb">IGDB (Twitch / {t("plugin_manager.badge_global_db")})</SelectItem>
              </SelectContent>
            </Select>
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
        <Switch
          checked={pipelineConfig.preserve_existing_artwork !== false}
          onCheckedChange={(checked) =>
            setPipelineConfig({
              ...pipelineConfig,
              preserve_existing_artwork: checked,
            })
          }
          aria-label={t("plugin_manager.preserve_title")}
          className="h-6 w-11 data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-700"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={onSavePipelineConfig}
          className="h-auto px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg hover:brightness-110 active:opacity-90"
          style={{ backgroundColor: "var(--accent-primary)" }}
        >
          {t("plugin_manager.save_pipeline")}
        </Button>
      </div>
    </div>
  );
};
