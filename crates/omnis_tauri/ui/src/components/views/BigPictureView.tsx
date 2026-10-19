import React from "react";
import {
  Gamepad2,
  Search,
  Volume2,
  VolumeX,
  Palette,
  Puzzle,
  Minimize2,
  Minus,
  X,
  Play,
  Download,
  Info,
  RefreshCw,
  CheckCircle2,
  Tv,
} from "lucide-react";
import { GameDto, LibraryCounts, ThemeConfig } from "../../types";
import { StoreBadge, StoreIcon } from "../StoreBadge";
import soundEffects from "../../utils/soundEffects";

interface BigPictureViewProps {
  focusedGame: GameDto | null;
  filteredGames: GameDto[];
  focusedIndex: number;
  setFocusedIndex: (idx: number) => void;
  setSelectedGame: (game: GameDto) => void;
  counts: LibraryCounts;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  gamepadConnected: boolean;
  gamepadName: string;
  searchQuery: string;
  setShowVirtualKeyboard: (show: boolean) => void;
  soundEnabled: boolean;
  handleToggleSound: () => void;
  currentTheme: ThemeConfig;
  setShowThemeModal: (show: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (show: boolean) => void;
  toggleBigPicture: () => void;
  handleMinimize: () => void;
  handleClose: () => void;
  handleToggleMaximize: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  handleLaunch: (gameId: string) => void;
  handleSync: () => void;
  isSyncing: boolean;
  showFullscreenDetails: boolean;
  setShowFullscreenDetails: React.Dispatch<React.SetStateAction<boolean>>;
  carouselRef: React.RefObject<HTMLDivElement>;
  t: (key: string, params?: Record<string, any>) => string;
}

export default function BigPictureView({
  focusedGame,
  filteredGames,
  focusedIndex,
  setFocusedIndex,
  setSelectedGame,
  counts,
  activeFilter,
  setActiveFilter,
  gamepadConnected,
  gamepadName,
  searchQuery,
  setShowVirtualKeyboard,
  soundEnabled,
  handleToggleSound,
  currentTheme,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  toggleBigPicture,
  handleMinimize,
  handleClose,
  handleToggleMaximize,
  handleStartDragging,
  handleLaunch,
  handleSync,
  isSyncing,
  showFullscreenDetails,
  setShowFullscreenDetails,
  carouselRef,
  t,
}: BigPictureViewProps) {
  return (
    <div
      className="relative flex flex-col h-screen w-screen overflow-hidden transition-colors duration-500"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {/* Ambient Cinema Backdrop */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {focusedGame?.background_image ? (
          <img
            src={focusedGame.background_image}
            alt="Backdrop"
            className="w-full h-full object-cover opacity-25 filter blur-2xl scale-110 transition-all duration-700"
          />
        ) : focusedGame?.cover_image ? (
          <img
            src={focusedGame.cover_image}
            alt="Backdrop"
            className="w-full h-full object-cover opacity-20 filter blur-3xl scale-125 transition-all duration-700"
          />
        ) : (
          <div
            className="w-full h-full opacity-20"
            style={{
              background: `radial-gradient(circle at 50% 30%, var(--accent-primary), transparent 70%)`,
            }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, var(--bg-base) 0%, transparent 80%)`,
          }}
        />
      </div>

      {/* 10-FOOT TOP BAR */}
      <header
        onMouseDown={handleStartDragging}
        onDoubleClick={handleToggleMaximize}
        data-tauri-drag-region
        className="relative z-20 flex items-center justify-between px-10 py-5 border-b cursor-default select-none"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 20px var(--accent-glow)`,
            }}
          >
            <Tv className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-lg tracking-wider text-white">OMNIS BIG PICTURE</span>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
              Modalità Fullscreen & Controller TV
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Gamepad Connection Badge */}
          <div
            className={`flex items-center gap-2.5 px-4 py-2 rounded-full border text-xs font-bold transition-all ${
              gamepadConnected
                ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                : "border-slate-700/40 text-slate-400"
            }`}
            style={{ backgroundColor: !gamepadConnected ? "var(--bg-card)" : undefined }}
          >
            <Gamepad2 className={`w-4 h-4 ${gamepadConnected ? "animate-pulse" : ""}`} />
            <span>{gamepadConnected ? gamepadName : "Controller pronto (Gamepad API)"}</span>
          </div>

          {/* Virtual Keyboard / Search Shortcut */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              setShowVirtualKeyboard(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md group hover:border-white/40"
            style={{
              backgroundColor: searchQuery ? "var(--accent-primary)" : "var(--bg-card)",
              borderColor: searchQuery ? "var(--accent-primary)" : "var(--border-color)",
              boxShadow: searchQuery ? `0 0 15px var(--accent-glow)` : undefined,
            }}
            title="Apri Tastiera Virtuale / Cerca nella Libreria (Y)"
          >
            <Search className="w-4 h-4" />
            <span>{searchQuery ? `Ricerca: "${searchQuery}"` : "Cerca"}</span>
            <span className="w-5 h-5 rounded-full bg-black/40 border border-white/20 flex items-center justify-center text-[10px] font-black text-amber-300">
              Y
            </span>
          </button>

          {/* Sound Effects Toggle Button */}
          <button
            onClick={handleToggleSound}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md hover:bg-white/10"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
            }}
            title={
              soundEnabled
                ? "Effetti sonori UI attivi (Clicca per silenziare)"
                : "Effetti sonori UI mutati (Clicca per attivare)"
            }
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
            <span>{soundEnabled ? "Audio ON" : "Audio OFF"}</span>
          </button>

          {/* Theme Shortcut */}
          <button
            onClick={() => {
              soundEffects.playSelect();
              setShowThemeModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <Palette className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
            <span>Tema: {currentTheme.name}</span>
          </button>

          {/* Plugin Shortcut */}
          <button
            onClick={() => {
              loadProvidersAndConfig();
              setShowPluginModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold text-white transition-all shadow-md"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <Puzzle className="w-4 h-4 text-indigo-400" />
            <span>Plugin Metadati</span>
          </button>

          {/* Exit Fullscreen */}
          <button
            type="button"
            onClick={toggleBigPicture}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 15px var(--accent-glow)`,
            }}
          >
            <Minimize2 className="w-4 h-4" />
            <span>{t("big_picture.exit_hint")}</span>
          </button>

          {/* Big Picture Window Controls */}
          <div
            className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l border-white/10 z-50"
            data-no-drag="true"
          >
            <button
              type="button"
              onClick={handleMinimize}
              className="w-8 h-8 rounded-lg hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-white"
              title="Riduci a icona"
              data-no-drag="true"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer text-slate-400"
              title="Chiudi applicazione"
              data-no-drag="true"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* CATEGORY SELECTOR PILLS (LB / RB SWITCHABLE) */}
      <div className="relative z-20 flex items-center justify-center gap-2 px-10 my-4">
        <span
          className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          LB
        </span>
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {[
            { id: "all", label: "Tutti i Giochi", count: counts.total },
            { id: "installed", label: "Installati", count: counts.installed },
            { id: "recent", label: "Giocati di Recente", count: counts.recent },
            { id: "favorites", label: "Preferiti (90+)", count: counts.favorites },
            { id: "steam", label: "Steam", count: counts.steam },
            { id: "epic", label: "Epic Games", count: counts.epic },
            { id: "gog", label: "GOG Galaxy", count: counts.gog },
            { id: "xbox", label: "Xbox", count: counts.xbox || 0 },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                soundEffects.playNav();
                setActiveFilter(f.id);
                setFocusedIndex(0);
              }}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition-all border"
              style={{
                backgroundColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--bg-card)",
                borderColor: activeFilter === f.id ? "var(--accent-primary)" : "var(--border-color)",
                color: activeFilter === f.id ? "#ffffff" : "var(--text-muted)",
                boxShadow: activeFilter === f.id ? `0 0 15px var(--accent-glow)` : undefined,
              }}
            >
              {(f.id === "steam" || f.id === "epic" || f.id === "gog" || f.id === "xbox") && (
                <StoreIcon library={f.id} className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{f.label}</span>
              <span className="opacity-70 font-mono text-[11px]">({f.count})</span>
            </button>
          ))}
        </div>
        <span
          className="text-[11px] font-black tracking-widest px-2 py-1 rounded border"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-muted)",
          }}
        >
          RB
        </span>
      </div>

      {/* MAIN HERO STAGE */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-16 pb-8">
        <div className="max-w-3xl mb-8 space-y-4">
          <div className="flex items-center gap-3">
            {focusedGame && (
              <StoreBadge library={focusedGame.library} showName={true} className="py-1 px-3 text-xs" />
            )}
            {focusedGame?.is_installed && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                INSTALLATO
              </span>
            )}
            {focusedGame?.critic_score && (
              <span className="px-3 py-1 rounded-md text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ★ {focusedGame.critic_score} METACRITIC
              </span>
            )}
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Tempo di gioco: <strong className="text-white">{focusedGame?.playtime_formatted}</strong>
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight drop-shadow-md">
            {focusedGame?.title}
          </h1>

          <p
            className="text-sm line-clamp-2 leading-relaxed max-w-2xl font-normal drop-shadow"
            style={{ color: "var(--text-muted)" }}
          >
            {focusedGame?.description || "Nessuna descrizione disponibile per questo titolo."}
          </p>

          {/* ACTION BUTTONS WITH CONTROLLER HINTS */}
          <div className="flex items-center gap-4 pt-2">
            <button
              onClick={() => focusedGame && handleLaunch(focusedGame.id)}
              className="flex items-center gap-3 px-8 py-4 rounded-2xl text-base font-black text-white transition-all hover:brightness-110 active:opacity-90 shadow-2xl"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: `0 0 30px var(--accent-glow)`,
              }}
            >
              {focusedGame?.is_installed ? (
                <>
                  <Play className="w-5 h-5 fill-white" />
                  <span>{t("big_picture.play_action")}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 text-white" />
                  <span>{t("game_details.install_now")}</span>
                </>
              )}
              <span className="w-6 h-6 rounded-full bg-black/30 flex items-center justify-center text-[11px] font-black border border-white/20">
                A
              </span>
            </button>

            <button
              onClick={() => {
                soundEffects.playSelect();
                setShowFullscreenDetails(true);
              }}
              className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all hover:bg-white/10 active:opacity-90 backdrop-blur-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Info className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
              <span>{t("big_picture.details_action")}</span>
              <span className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-black border border-white/20">
                X
              </span>
            </button>

            <button
              onClick={() => {
                soundEffects.playSelect();
                handleSync();
              }}
              className="flex items-center gap-2.5 px-6 py-4 rounded-2xl text-white text-sm font-bold border transition-all backdrop-blur-md"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
              <span>{t("common.refresh")}</span>
            </button>
          </div>
        </div>

        {/* HORIZONTAL CAROUSEL SHELF */}
        <div className="w-full">
          <div
            className="flex items-center justify-between mb-3 text-xs font-bold"
            style={{ color: "var(--text-muted)" }}
          >
            <span>{t("big_picture.catalog_title", { count: filteredGames.length })}</span>
            <span>{t("big_picture.nav_hint")}</span>
          </div>

          <div
            ref={carouselRef}
            className="flex items-center gap-6 overflow-x-auto pb-4 pt-2 px-2 scrollbar-none scroll-smooth"
          >
            {filteredGames.map((game, idx) => {
              const isFocused = idx === focusedIndex;
              return (
                <div
                  key={game.id}
                  onClick={() => {
                    soundEffects.playSelect();
                    setFocusedIndex(idx);
                    setSelectedGame(game);
                    if (isFocused) {
                      setShowFullscreenDetails(true);
                    }
                  }}
                  onDoubleClick={() => {
                    soundEffects.playSelect();
                    setShowFullscreenDetails(true);
                  }}
                  className={`relative flex-shrink-0 w-44 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform ${
                    isFocused
                      ? "scale-110 z-20 shadow-2xl ring-4"
                      : "scale-95 opacity-60 hover:opacity-90 hover:scale-100"
                  }`}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: isFocused ? "var(--accent-primary)" : "var(--border-color)",
                    boxShadow: isFocused ? `0 0 30px var(--accent-glow)` : undefined,
                  }}
                >
                  {game.cover_image ? (
                    <img src={game.cover_image} alt={game.title} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex flex-col justify-between p-4"
                      style={{ backgroundColor: "var(--bg-card)" }}
                    >
                      <StoreBadge library={game.library} showName={true} />
                      <span className="font-black text-sm text-white line-clamp-3 leading-snug">
                        {game.title}
                      </span>
                      <span className="text-[10px] font-semibold" style={{ color: "var(--text-muted)" }}>
                        {game.playtime_formatted}
                      </span>
                    </div>
                  )}

                  <div className="absolute top-2.5 right-2.5">
                    <StoreBadge library={game.library} />
                  </div>

                  {isFocused && (
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 px-3 py-1 rounded-lg bg-black/80 backdrop-blur-md text-center text-xs font-black text-white border border-white/20 truncate">
                      {game.title}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* BOTTOM CONTROLLER LEGEND */}
      <footer
        className="relative z-20 h-14 backdrop-blur-xl border-t flex items-center justify-between px-10 text-xs font-bold"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              A
            </span>
            <span>Avvia Gioco</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              B
            </span>
            <span>Indietro / Chiudi</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              X
            </span>
            <span>Scheda Dettagli</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-black shadow">
              Y
            </span>
            <span>Temi Grafici</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-black border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              LB / RB
            </span>
            <span>Cambia Categoria</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-black border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              SELECT / F11
            </span>
            <span>Torna al Desktop</span>
          </div>
        </div>
      </footer>

      {/* FULLSCREEN GAME DETAILS DRAWER */}
      {showFullscreenDetails && focusedGame && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-2xl flex items-center justify-center p-12">
          <div
            className="relative max-w-4xl w-full rounded-3xl border p-8 space-y-6 shadow-2xl"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-24 aspect-[2/3] rounded-xl overflow-hidden shadow-lg border border-white/10">
                  {focusedGame.cover_image ? (
                    <img src={focusedGame.cover_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-bold text-white"
                      style={{ backgroundColor: "var(--accent-primary)" }}
                    >
                      {focusedGame.title.slice(0, 2)}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-white">{focusedGame.title}</h2>
                  <p className="text-sm mt-1 font-medium" style={{ color: "var(--text-muted)" }}>
                    Sviluppato da:{" "}
                    <span className="text-white font-bold">
                      {focusedGame.developers.join(", ") || "N/A"}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <StoreBadge library={focusedGame.library} showName={true} />
                    {focusedGame.genres.map((g) => (
                      <span
                        key={g}
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                        style={{
                          backgroundColor: "var(--bg-card)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowFullscreenDetails(false)}
                className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <span
                className="text-xs font-black tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Sinossi & Descrizione
              </span>
              <p
                className="text-sm leading-relaxed max-h-48 overflow-y-auto pr-2"
                style={{ color: "var(--text-primary)" }}
              >
                {focusedGame.description || "Nessuna descrizione disponibile."}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-2">
              <div
                className="p-4 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  Data di Rilascio
                </span>
                <p className="text-base font-black text-white mt-1">{focusedGame.release_date || "N/A"}</p>
              </div>
              <div
                className="p-4 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  Metacritic Score
                </span>
                <p className="text-base font-black text-amber-400 mt-1">
                  {focusedGame.critic_score || "N/A"} / 100
                </p>
              </div>
              <div
                className="p-4 rounded-xl border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <span className="text-[10px] font-bold uppercase" style={{ color: "var(--text-muted)" }}>
                  Tempo Registrato
                </span>
                <p className="text-base font-black text-emerald-400 mt-1">
                  {focusedGame.playtime_formatted}
                </p>
              </div>
            </div>

            <div
              className="flex justify-end gap-4 pt-4 border-t"
              style={{ borderColor: "var(--border-color)" }}
            >
              <button
                onClick={() => {
                  soundEffects.playSelect();
                  setShowFullscreenDetails(false);
                }}
                className="px-6 py-3 rounded-xl text-xs font-bold border"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                Chiudi (B)
              </button>
              <button
                onClick={() => {
                  handleLaunch(focusedGame.id);
                  setShowFullscreenDetails(false);
                }}
                className="flex items-center gap-2 px-8 py-3 rounded-xl text-white text-xs font-black shadow-lg"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: `0 0 20px var(--accent-glow)`,
                }}
              >
                <Play className="w-4 h-4 fill-white" />
                <span>AVVIA GIOCO (A)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
