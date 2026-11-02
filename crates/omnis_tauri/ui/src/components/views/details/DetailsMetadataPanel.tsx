import React from "react";
import {
  Clock,
  RefreshCw,
  Sparkles,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import { GameDto } from "../../../types";
import { Slot } from "../../common/Slot";
import { GameAchievementsGallery } from "../../achievements";
import GameStatisticsCard from "../../stats/GameStatisticsCard";
import { getCompletionStatusInfo } from "./helpers";

export interface DetailsMetadataPanelProps {
  selectedGame: GameDto;
  handleRefreshHltb?: (gameId: string) => void;
  handleEnrichSingleGame: (gameId: string) => void;
  isEnrichingSingle: boolean;
  t: (key: string, params?: Record<string, any>) => string;
  setGameToEdit: (game: GameDto) => void;
  setShowEditorModal: (show: boolean) => void;
  activeFilter?: string;
  setActiveFilter?: (filter: string) => void;
  isFilterActive?: (filterId: string) => boolean;
}

export const DetailsMetadataPanel: React.FC<DetailsMetadataPanelProps> = ({
  selectedGame,
  handleRefreshHltb,
  handleEnrichSingleGame,
  isEnrichingSingle,
  t,
  setGameToEdit,
  setShowEditorModal,
  activeFilter,
  setActiveFilter,
  isFilterActive,
}) => {
  const handleFilterByGenre = (genre: string) => {
    if (!setActiveFilter) return;
    const gLower = genre.toLowerCase().trim();
    let target = `genre:${genre.trim()}`;
    if (gLower === "azione" || gLower === "action") target = "action";
    else if (gLower === "gdr" || gLower === "rpg") target = "rpg";
    else if (gLower === "strategia" || gLower === "strategy") target = "strategy";
    else if (gLower === "indie") target = "indie";

    setActiveFilter(target);
  };

  const isGenreActive = (genre: string) => {
    const gLower = genre.toLowerCase().trim();
    let target = `genre:${genre.trim()}`;
    if (gLower === "azione" || gLower === "action") target = "action";
    else if (gLower === "gdr" || gLower === "rpg") target = "rpg";
    else if (gLower === "strategia" || gLower === "strategy") target = "strategy";
    else if (gLower === "indie") target = "indie";

    if (isFilterActive) {
      return isFilterActive(target) || isFilterActive(genre.trim());
    }
    if (!activeFilter) return false;
    if (activeFilter === target) return true;
    if (activeFilter === "action" && (gLower === "azione" || gLower === "action")) return true;
    if (activeFilter === "rpg" && (gLower === "gdr" || gLower === "rpg")) return true;
    if (activeFilter === "strategy" && (gLower === "strategia" || gLower === "strategy")) return true;
    if (activeFilter === "indie" && gLower === "indie") return true;
    return false;
  };

  const handleFilterByCompletion = (status?: string | null) => {
    if (!setActiveFilter) return;
    const target = `completion:${status || "NotPlayed"}`;
    setActiveFilter(target);
  };

  return (
    <div className="p-8 space-y-5">
      {/* HowLongToBeat call-to-action or refresh bar */}
      {!(selectedGame.extra_metadata && selectedGame.extra_metadata.includes("howlongtobeat")) ? (
        <div className="flex items-center justify-between p-3.5 px-4 rounded-xl border border-white/[0.06] bg-white/[0.02] text-xs transition-colors">
          <div className="flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">{t("game_details.hltb_title")}</span>
              <p className="text-[11px] text-slate-400">
                {t("game_details.hltb_not_downloaded")}
              </p>
            </div>
          </div>
          <button
            onClick={() => (handleRefreshHltb ? handleRefreshHltb(selectedGame.id) : handleEnrichSingleGame(selectedGame.id))}
            disabled={isEnrichingSingle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:brightness-110 active:opacity-90 shadow-sm shrink-0"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isEnrichingSingle ? "animate-spin" : ""}`} />
            <span>{isEnrichingSingle ? t("game_details.downloading") : t("game_details.download_source")}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-slate-300 text-xs">{t("game_details.hltb_title")}</span>
            </div>
            <button
              onClick={() => (handleRefreshHltb ? handleRefreshHltb(selectedGame.id) : handleEnrichSingleGame(selectedGame.id))}
              disabled={isEnrichingSingle}
              title={t("game_details.refresh_hltb_title")}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isEnrichingSingle ? "animate-spin text-amber-400" : ""}`} />
              <span>{isEnrichingSingle ? t("game_details.refreshing") : t("game_details.refresh_source")}</span>
            </button>
          </div>
          <Slot name="details.info" gameId={selectedGame.id} />
        </div>
      )}

      {/* Card 1: Synopsis & Description */}
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
          <span>{t("game_details.description")}</span>
        </span>
        <p className="text-sm leading-relaxed text-slate-300">
          {selectedGame.description || t("game_details.no_description")}
        </p>
      </div>

      {/* Card 2: Technical Parameters - Unified Specs Grid */}
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.developers")}
            </span>
            <p className="text-xs font-semibold text-white truncate">
              {selectedGame.developers.join(", ") || "N/A"}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.publishers")}
            </span>
            <p className="text-xs font-semibold text-white truncate">
              {(selectedGame.publishers && selectedGame.publishers.join(", ")) || "N/A"}
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.genres")}
            </span>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {selectedGame.genres && selectedGame.genres.length > 0 ? (
                selectedGame.genres.map((genre) => {
                  const active = isGenreActive(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => handleFilterByGenre(genre)}
                      className={`bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs px-2.5 py-1 rounded-lg hover:border-white/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                        active
                          ? "bg-[var(--accent-primary)]/20 border-[var(--accent-primary)] text-white shadow-xs"
                          : ""
                      }`}
                      title={t("tooltips.filter_genre", { genre })}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          active ? "bg-[var(--accent-primary)]" : "bg-slate-400"
                        }`}
                      />
                      <span>{genre}</span>
                    </button>
                  );
                })
              ) : (
                <span className="text-xs font-semibold text-slate-400">N/A</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.release_date")}
            </span>
            <p className="text-xs font-semibold text-white truncate">{selectedGame.release_date || "N/A"}</p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.playtime")}
            </span>
            <p className="text-xs font-semibold text-white truncate">
              {selectedGame.playtime_formatted}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("groups.completion_status")}
            </span>
            <div className="pt-0.5">
              {(() => {
                const statusInfo = getCompletionStatusInfo(selectedGame.completion_status, t);
                const isFiltered = isFilterActive
                  ? isFilterActive(`completion:${selectedGame.completion_status || "NotPlayed"}`)
                  : activeFilter === `completion:${selectedGame.completion_status || "NotPlayed"}`;
                return (
                  <button
                    type="button"
                    onClick={() => handleFilterByCompletion(selectedGame.completion_status)}
                    className={`bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs px-2.5 py-1 rounded-lg hover:border-white/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                      isFiltered ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)] text-white" : ""
                    }`}
                    title={t("tooltips.filter_status", { status: statusInfo.label })}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                    <span className="font-semibold">{statusInfo.label}</span>
                  </button>
                );
              })()}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[var(--text-muted)] tracking-wider uppercase block">
              {t("game_details.critic_score")}
            </span>
            <p className="text-xs font-semibold text-white truncate">
              {selectedGame.critic_score ? `★ ${selectedGame.critic_score}` : "N/A"}
            </p>
          </div>
        </div>
      </div>

      {/* Native Achievements Showcase */}
      <GameAchievementsGallery key={selectedGame.id} game={selectedGame} />

      {/* Game Statistics & Session Analytics */}
      <GameStatisticsCard game={selectedGame} />

      {/* Card 3: Key Features (Playnite Parity) */}
      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>{t("game_details.features")}</span>
          </span>
          <button
            onClick={() => {
              setGameToEdit(selectedGame);
              setShowEditorModal(true);
            }}
            className="text-[10px] font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {t("common.edit")}
          </button>
        </div>
        {selectedGame.features && selectedGame.features.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedGame.features.map((feature, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-slate-300 flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                <span>{feature}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-400">
            {t("game_details.no_features")}
          </p>
        )}
      </div>

      {/* Card 4: Custom Links */}
      {selectedGame.custom_links && selectedGame.custom_links.length > 0 && (
        <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
          <span className="text-xs font-semibold tracking-wider uppercase flex items-center gap-2 text-[var(--text-muted)]">
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            <span>{t("game_details.custom_links")}</span>
          </span>
          <div className="flex flex-wrap gap-2.5 pt-1">
            {selectedGame.custom_links.map((lnk, idx) => (
              <a
                key={idx}
                href={lnk.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-semibold text-slate-200 transition-all hover:bg-white/[0.08] hover:text-white hover:border-white/20 active:opacity-90 shadow-sm"
              >
                <span>{lnk.title}</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
