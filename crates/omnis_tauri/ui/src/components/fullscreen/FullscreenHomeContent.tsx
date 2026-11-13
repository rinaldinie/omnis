import React from "react";
import { Search, Play, CheckCircle2, Trophy } from "lucide-react";
import { GameDto, ActiveGameSession, TranslateFn } from "../../types";
import { StoreIcon } from "../common/StoreBadge";
import soundEffects from "../../utils/soundEffects";
import { Slot } from "../common/Slot";
import { Glyph } from "./ConsoleChrome";
import { useGameAchievements } from "../achievements";
import type { HomeFocusZone } from "../../hooks/useGamepadNavigation";
import {
  CARD_GAP_REM,
  GRID_GAP_REM,
  ShelfCard,
  RecentCard,
  GridCard,
} from "./FullscreenCards";
import { STORE_LABELS, duration } from "./constants";

export interface FullscreenHomeContentProps {
  filteredGames: GameDto[];
  layout: "shelf" | "grid";
  searchQuery: string;
  showRecentRow: boolean;
  recentGames: GameDto[];
  safeRecentIndex: number;
  setRecentIndex: (idx: number) => void;
  homeFocusZone?: HomeFocusZone;
  setHomeFocusZone?: (zone: HomeFocusZone) => void;
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  setShowFullscreenDetails: React.Dispatch<React.SetStateAction<boolean>>;
  handleLaunch: (gameId: string) => void;
  activeCategory: string;
  filterLabel: (id: string) => string;
  sortMode?: string;
  carouselRef: React.RefObject<HTMLDivElement>;
  gridRef: React.RefObject<HTMLDivElement>;
  gridColumns: number;
  activeGame?: ActiveGameSession | null;
  actualElapsed: number;
  playtimeLabel: (game: GameDto) => string;
  infoGame: GameDto | null;
  t: TranslateFn;
}

export const FullscreenHomeContent: React.FC<FullscreenHomeContentProps> = ({
  filteredGames,
  layout,
  searchQuery,
  showRecentRow,
  recentGames,
  safeRecentIndex,
  setRecentIndex,
  homeFocusZone,
  setHomeFocusZone,
  focusedIndex,
  setFocusedIndex,
  setShowFullscreenDetails,
  handleLaunch,
  activeCategory,
  filterLabel,
  sortMode,
  carouselRef,
  gridRef,
  gridColumns,
  activeGame,
  actualElapsed,
  playtimeLabel,
  infoGame,
  t,
}) => {
  const { summary: achievementsSummary } = useGameAchievements(layout === "shelf" ? infoGame : null);

  const renderHeroStats = (game: GameDto) => {
    const hasScore = typeof game.critic_score === "number" && game.critic_score > 0;
    const scoreTier =
      hasScore && game.critic_score! >= 90
        ? "Mighty"
        : hasScore && game.critic_score! >= 84
        ? "Strong"
        : hasScore && game.critic_score! >= 75
        ? "Fair"
        : "Weak";

    const hasAchievements =
      !!achievementsSummary &&
      achievementsSummary.game_id === game.id &&
      achievementsSummary.total_count > 0;
    const percent = hasAchievements ? Math.round(achievementsSummary.completion_percentage) : 0;

    if (!hasScore && !hasAchievements) return null;

    return (
      <div className="flex items-center gap-5 shrink-0 self-start">
        {hasScore && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-amber-500/15 text-amber-300 flex items-center justify-center font-bold text-xs shrink-0">
              ★
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-white/55 leading-none">
                OpenCritic
              </span>
              <span className="text-xs font-semibold text-white mt-0.5 whitespace-nowrap">
                {game.critic_score}{" "}
                <span className="text-amber-400/90 font-normal">· {scoreTier}</span>
              </span>
            </div>
          </div>
        )}

        {hasScore && hasAchievements && <div className="w-px h-7 bg-white/15" />}

        {hasAchievements && (
          <div className="flex items-center gap-2.5 min-w-[135px]">
            <div className="w-7 h-7 rounded-md bg-amber-400/15 text-amber-300 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex justify-between items-baseline text-[10px] text-white/60">
                <span className="uppercase tracking-wider truncate mr-2">
                  {t("achievements.title")}
                </span>
                <span className="font-bold text-amber-300 tabular-nums">{percent}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/15 rounded-full mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: "var(--omnis-accent, var(--accent-primary, #f59e0b))",
                  }}
                />
              </div>
              <span className="text-[9px] text-white/50 mt-0.5 tabular-nums">
                {achievementsSummary.unlocked_count} / {achievementsSummary.total_count}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMetaLine = (game: GameDto) => (
    <div className="flex items-center gap-4 h-6 mt-1.5 overflow-hidden whitespace-nowrap text-sm font-semibold uppercase tracking-wider text-white/65">
      {activeGame?.game_id === game.id ? (
        <span className="flex items-center gap-2 text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          {t("status.running")} · {duration(actualElapsed)}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 fill-emerald-400 text-emerald-400" />
          {t("game_details.playtime")}: {playtimeLabel(game)}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <StoreIcon library={game.library} className="w-3.5 h-3.5" />
        {STORE_LABELS[game.library] ?? game.library}
      </span>
      {game.is_installed && (
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t("sidebar.installed")}
        </span>
      )}
      {game.critic_score && <span className="text-amber-300">★ {game.critic_score}</span>}
    </div>
  );

  if (filteredGames.length === 0) {
    return (
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4 px-16 text-center omnis-fade-in">
        <Search className="w-12 h-12 text-white/40" />
        <h2 className="text-3xl font-semibold text-white">{t("console_ui.empty_title")}</h2>
        <p className="text-base max-w-xl" style={{ color: "var(--text-muted)" }}>
          {searchQuery
            ? t("console_ui.empty_search", { query: searchQuery })
            : t("console_ui.empty_category")}
        </p>
        <div className="flex items-center gap-8 pt-4 text-sm font-semibold uppercase tracking-wider text-white">
          <span className="flex items-center gap-2.5">
            <Glyph kind="y" />
            {t("console_ui.search")}
          </span>
          <span className="flex items-center gap-2.5">
            <Glyph kind="bumpers" />
            {t("console_ui.category")}
          </span>
        </div>
      </section>
    );
  }

  if (layout === "shelf") {
    return (
      <section className="relative z-10 flex-1 min-h-0 flex flex-col justify-end pb-8">
        {showRecentRow && (
          <div className="px-10 mb-8">
            <h3
              className={`mb-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
                homeFocusZone === "recent" ? "text-white" : "text-white/55"
              }`}
            >
              {t("console_ui.continue_playing")}
            </h3>
            <div className="flex gap-4 py-1">
              {recentGames.map((game, idx) => (
                <RecentCard
                  key={game.id}
                  game={game}
                  isFocused={homeFocusZone === "recent" && idx === safeRecentIndex}
                  onClick={() => {
                    setRecentIndex(idx);
                    setHomeFocusZone?.("recent");
                    soundEffects.playSelect();
                    const targetIdx = filteredGames.findIndex((g) => g.id === game.id);
                    if (targetIdx !== -1) {
                      setFocusedIndex(targetIdx);
                      setHomeFocusZone?.("carousel");
                      setShowFullscreenDetails(true);
                    } else {
                      handleLaunch(game.id);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <h2 className="px-10 mb-4 text-3xl font-semibold text-white tracking-tight drop-shadow">
          {filterLabel(activeCategory)}
          <span className="ml-3 text-lg font-normal text-white/50">{filteredGames.length}</span>
          {sortMode !== "default" && (
            <span className="ml-4 text-sm font-semibold uppercase tracking-wider text-white/45">
              {t(`console_ui.sort_${sortMode}`)}
            </span>
          )}
        </h2>

        {/* Shelf: cards must stay direct children of the ref */}
        <div
          ref={carouselRef}
          className="flex items-center overflow-x-auto no-scrollbar px-10 py-3"
          style={{ gap: `${CARD_GAP_REM}rem` }}
        >
          {filteredGames.map((game, idx) => (
            <ShelfCard
              key={game.id}
              game={game}
              isFocused={idx === focusedIndex}
              isRunning={activeGame?.game_id === game.id}
              hasFocusRing={homeFocusZone === "carousel"}
              liveLabel={t("console_ui.live")}
              onClick={() => {
                if (idx === focusedIndex) {
                  soundEffects.playSelect();
                  setShowFullscreenDetails(true);
                } else {
                  soundEffects.playNav();
                  setFocusedIndex(idx);
                  setHomeFocusZone?.("carousel");
                }
              }}
            />
          ))}
        </div>

        {infoGame && (
          <div data-omnis="fullscreen.hero" className="px-10 mt-3 max-w-5xl">
            <div key={infoGame.id} className="omnis-rise-in">
              <h1 data-omnis="fullscreen.title" className="h-8 text-2xl leading-8 font-semibold text-white truncate drop-shadow">
                {infoGame.title}
              </h1>
              {renderMetaLine(infoGame)}
              <div className="mt-2.5 flex items-start justify-between gap-6">
                <p className="h-[3.25rem] text-base leading-relaxed line-clamp-2 flex-1 max-w-3xl text-white/70">
                  {infoGame.description}
                </p>
                {renderHeroStats(infoGame)}
              </div>
            </div>
            <Slot name="fullscreen.hero" gameId={infoGame.id} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="relative z-10 flex-1 min-h-0 flex flex-col">
      <h2 className="px-10 pt-4 shrink-0 text-3xl font-semibold text-white tracking-tight drop-shadow">
        {filterLabel(activeCategory)}
        <span className="ml-3 text-lg font-normal text-white/50">{filteredGames.length}</span>
        {sortMode !== "default" && (
          <span className="ml-4 text-sm font-semibold uppercase tracking-wider text-white/45">
            {t(`console_ui.sort_${sortMode}`)}
          </span>
        )}
      </h2>

      {/* Grid: covers must stay direct children of the ref */}
      <div
        ref={gridRef}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar grid content-start px-10 py-5"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, gridColumns)}, minmax(0, 1fr))`,
          gap: `${GRID_GAP_REM}rem`,
          scrollPaddingBlock: "1.5rem",
        }}
      >
        {filteredGames.map((game, idx) => (
          <GridCard
            key={game.id}
            game={game}
            isFocused={idx === focusedIndex}
            isRunning={activeGame?.game_id === game.id}
            hasFocusRing={homeFocusZone === "carousel"}
            onClick={() => {
              if (idx === focusedIndex) {
                soundEffects.playSelect();
                setShowFullscreenDetails(true);
              } else {
                soundEffects.playNav();
                setFocusedIndex(idx);
                setHomeFocusZone?.("carousel");
              }
            }}
          />
        ))}
      </div>
    </section>
  );
};
