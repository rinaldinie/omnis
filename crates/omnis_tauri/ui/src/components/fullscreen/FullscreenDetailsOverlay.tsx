import React from "react";
import { Play } from "lucide-react";
import { GameDto, ActiveGameSession } from "../../types";
import { ArtImage } from "./FullscreenCards";
import { GameAchievementsGallery } from "../achievements";

export interface HeroActionDefinition {
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}

export interface FullscreenDetailsOverlayProps {
  showFullscreenDetails: boolean;
  activeDetailGame: GameDto | null;
  detailsScrollRef: React.RefObject<HTMLDivElement>;
  isFocusedGameRunning: boolean;
  activeGame?: ActiveGameSession | null;
  elapsedSeconds?: number;
  duration: (seconds: number) => string;
  handleLaunch: (gameId: string) => void;
  handleKillRunningGame?: () => void;
  setShowFullscreenDetails: (show: boolean) => void;
  detailsFocusedSection: "hero" | "achievements";
  heroFocusedButton: string;
  heroButtons: string[];
  heroActions: Record<string, HeroActionDefinition>;
  onGameAction?: (action: any, gameId: string) => void;
  openConfirm: (kind: "uninstall", game: GameDto) => void;
  setNotice: (message: string) => void;
  soundEffects: { playSelect: () => void };
  playtimeLabel: (game: GameDto) => string;
  achievementsFocusedIndex: number;
  setAchievementsFocusedIndex: (idx: number) => void;
  setTotalAchievements: (total: number) => void;
  storeLabels: Record<string, string>;
  renderStoreIcon: (library: string) => React.ReactNode;
  t: (key: string, params?: Record<string, any>) => string;
}

export const FullscreenDetailsOverlay: React.FC<FullscreenDetailsOverlayProps> = ({
  showFullscreenDetails,
  activeDetailGame,
  detailsScrollRef,
  isFocusedGameRunning,
  activeGame,
  elapsedSeconds,
  duration,
  handleLaunch,
  handleKillRunningGame,
  setShowFullscreenDetails,
  detailsFocusedSection,
  heroFocusedButton,
  heroButtons,
  heroActions,
  onGameAction,
  openConfirm,
  setNotice,
  soundEffects,
  playtimeLabel,
  achievementsFocusedIndex,
  setAchievementsFocusedIndex,
  setTotalAchievements,
  storeLabels,
  renderStoreIcon,
  t,
}) => {
  if (!showFullscreenDetails || !activeDetailGame) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col omnis-fade-in" style={{ backgroundColor: "var(--bg-base)" }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-[75vh]">
          <ArtImage
            sources={[activeDetailGame.background_image, activeDetailGame.cover_image]}
            title={activeDetailGame.title}
            library={activeDetailGame.library}
          />
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.35) 35%, var(--bg-base) 75%), linear-gradient(to right, rgba(0, 0, 0, 0.6) 0%, transparent 60%)",
          }}
        />
      </div>

      <div ref={detailsScrollRef} className="relative z-10 flex-1 overflow-y-auto no-scrollbar pb-24">
        {/* Hero */}
        <section className="min-h-[62vh] flex flex-col justify-end px-16 pb-10 gap-5">
          <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-white/70">
            {renderStoreIcon(activeDetailGame.library)}
            <span>{storeLabels[activeDetailGame.library] ?? activeDetailGame.library}</span>
            {activeDetailGame.genres.length > 0 && <span>· {activeDetailGame.genres.slice(0, 3).join(" · ")}</span>}
          </div>

          <div>
            <h1 className="text-6xl font-bold text-white tracking-tight leading-tight drop-shadow-lg max-w-5xl">
              {activeDetailGame.title}
            </h1>
            {activeDetailGame.developers.length > 0 && (
              <p className="mt-2 text-lg text-white/70">
                {activeDetailGame.developers.join(", ")}
                {activeDetailGame.publishers && activeDetailGame.publishers.length > 0 && (
                  <span className="text-white/45"> · {activeDetailGame.publishers.join(", ")}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {(() => {
              const isFocused = detailsFocusedSection === "hero" && heroFocusedButton === "launch";
              const isStop = isFocusedGameRunning && !!handleKillRunningGame;
              return (
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    if (isFocusedGameRunning && handleKillRunningGame) {
                      handleKillRunningGame();
                    } else {
                      handleLaunch(activeDetailGame.id);
                    }
                    setShowFullscreenDetails(false);
                  }}
                  className="cursor-pointer flex items-center gap-3 px-10 py-4 rounded-md text-lg font-semibold uppercase tracking-wider transition-all duration-150 border-none"
                  style={{
                    backgroundColor: isStop ? "#e11d48" : "var(--accent-primary)",
                    color: "#ffffff",
                    boxShadow: isFocused ? "0 0 0 0.2rem #ffffff, 0 0 2.5rem var(--accent-glow)" : "none",
                    transform: isFocused ? "scale(1.04)" : "none",
                    opacity: isFocused ? 1 : 0.75,
                  }}
                >
                  {isStop ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                      {activeGame?.state === "launching" ? t("fullscreen.cancel_launch") : t("console_ui.stop")}
                      <span className="text-sm font-medium opacity-80">{duration(elapsedSeconds || 0)}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-white" />
                      {activeDetailGame.is_installed ? t("console_ui.play") : t("console_ui.install")}
                    </>
                  )}
                </button>
              );
            })()}

            {heroButtons.map((button) => {
              if (button === "launch" || button === "back") return null;
              const action = heroActions[button];
              if (!action) return null;
              const Icon = action.icon;
              const isFocused = detailsFocusedSection === "hero" && heroFocusedButton === button;
              return (
                <button
                  type="button"
                  key={button}
                  onClick={() => {
                    soundEffects.playSelect();
                    if (button === "uninstall") {
                      openConfirm("uninstall", activeDetailGame);
                    } else if (onGameAction) {
                      onGameAction(button, activeDetailGame.id);
                      setNotice(t(`console_ui.notice_${button}`));
                    }
                  }}
                  className="cursor-pointer flex items-center gap-2.5 px-5 py-4 rounded-md text-base font-semibold transition-all duration-150 border-none"
                  style={
                    isFocused
                      ? {
                          backgroundColor: action.danger ? "#e11d48" : "#ffffff",
                          color: action.danger ? "#ffffff" : "#0b0f19",
                          transform: "scale(1.04)",
                        }
                      : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
                  }
                >
                  <Icon className="w-5 h-5" />
                  {t(action.labelKey)}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setShowFullscreenDetails(false);
              }}
              className="cursor-pointer px-8 py-4 rounded-md text-lg font-semibold uppercase tracking-wider transition-all duration-150 border-none"
              style={
                detailsFocusedSection === "hero" && heroFocusedButton === "back"
                  ? { backgroundColor: "#ffffff", color: "#0b0f19", transform: "scale(1.04)" }
                  : { backgroundColor: "rgba(255, 255, 255, 0.1)", color: "rgba(255, 255, 255, 0.85)" }
              }
            >
              {t("console_ui.back")}
            </button>
          </div>

          <dl className="flex items-start gap-12 pt-2">
            {[
              { label: t("game_details.playtime"), value: playtimeLabel(activeDetailGame) },
              { label: t("game_details.release_date"), value: activeDetailGame.release_date },
              {
                label: "Metacritic",
                value: activeDetailGame.critic_score ? `★ ${activeDetailGame.critic_score}` : null,
              },
            ]
              .filter((stat) => stat.value)
              .map((stat) => (
                <div key={stat.label}>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-white/50">{stat.label}</dt>
                  <dd className="mt-1 text-xl font-medium text-white">{stat.value}</dd>
                </div>
              ))}
          </dl>
        </section>

        {/* About */}
        <section className="px-16 pb-10 max-w-5xl">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-white/50 mb-3">
            {t("console_ui.about")}
          </h3>
          <p className="text-lg leading-relaxed whitespace-pre-line text-white/85">
            {activeDetailGame.description || t("fullscreen.no_desc")}
          </p>
        </section>

        {/* Achievements */}
        <section
          className="mx-16 p-6 rounded-lg transition-shadow duration-200"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            boxShadow: detailsFocusedSection === "achievements" ? "0 0 0 0.15rem rgba(255, 255, 255, 0.6)" : "none",
          }}
        >
          <GameAchievementsGallery
            key={activeDetailGame.id}
            game={activeDetailGame}
            isFullscreen={true}
            focusedIndex={achievementsFocusedIndex}
            onFocusIndexChange={setAchievementsFocusedIndex}
            onTotalAchievementsChange={setTotalAchievements}
          />
        </section>
      </div>
    </div>
  );
};
