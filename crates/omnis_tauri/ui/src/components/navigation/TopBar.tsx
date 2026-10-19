import React from "react";
import {
  Zap,
  LayoutGrid,
  PanelLeft,
  TableProperties,
  Search,
  X,
  Tv,
  Volume2,
  VolumeX,
  Settings,
  Palette,
  Puzzle,
  PlusCircle,
  Pencil,
  RefreshCw,
  Download,
  ZoomOut,
  ZoomIn,
  Minus,
  Square,
} from "lucide-react";
import { GameDto, ProviderInfo, ThemeConfig, ViewMode } from "../../types";
import soundEffects from "../../utils/soundEffects";

interface TopBarProps {
  currentTheme: ThemeConfig;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  toggleBigPicture: () => void;
  handleToggleSound: () => void;
  soundEnabled: boolean;
  setShowSettingsModal: (open: boolean) => void;
  currentLocaleInfo: { flag: string };
  setShowThemeModal: (open: boolean) => void;
  loadProvidersAndConfig: () => void;
  setShowPluginModal: (open: boolean) => void;
  providers: ProviderInfo[];
  setShowAddCustomModal: (open: boolean) => void;
  selectedGame: GameDto | null;
  setGameToEdit: (game: any) => void;
  setShowEditorModal: (open: boolean) => void;
  handleSync: () => void;
  isSyncing: boolean;
  handleDownloadAll: () => void;
  isDownloading: boolean;
  uiZoom: number;
  setUiZoom: React.Dispatch<React.SetStateAction<number>>;
  handleMinimize: () => void;
  handleToggleMaximize: () => void;
  handleClose: () => void;
  handleStartDragging: (e: React.MouseEvent) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

export default function TopBar({
  currentTheme,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  toggleBigPicture,
  handleToggleSound,
  soundEnabled,
  setShowSettingsModal,
  currentLocaleInfo,
  setShowThemeModal,
  loadProvidersAndConfig,
  setShowPluginModal,
  providers,
  setShowAddCustomModal,
  selectedGame,
  setGameToEdit,
  setShowEditorModal,
  handleSync,
  isSyncing,
  handleDownloadAll,
  isDownloading,
  uiZoom,
  setUiZoom,
  handleMinimize,
  handleToggleMaximize,
  handleClose,
  handleStartDragging,
  t,
}: TopBarProps) {
  return (
    <header
      onMouseDown={handleStartDragging}
      onDoubleClick={handleToggleMaximize}
      data-tauri-drag-region
      className="h-14 min-h-[56px] max-h-[56px] border-b flex items-center justify-between px-4 z-40 transition-colors duration-300 cursor-default select-none"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-color)",
      }}
    >
      {/* Left: Brand Logo & Segmented Switcher */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all shrink-0"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: `0 0 15px var(--accent-glow)`,
            }}
          >
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold text-sm tracking-wider text-white">OMNIS</span>
            <span
              className="font-extrabold text-[8px] tracking-widest uppercase"
              style={{ color: "var(--accent-primary)" }}
            >
              {currentTheme.name.split(" ")[0]} EDITION
            </span>
          </div>
        </div>

        <div className="h-5 w-[1px]" style={{ backgroundColor: "var(--border-color)" }} />

        {/* Segmented View Switcher */}
        <div
          className="p-1 rounded-lg border flex items-center gap-1 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "grid" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "grid" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.grid")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.grid")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("details")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "details" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "details" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.details")}
          >
            <PanelLeft className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.details")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all"
            style={{
              backgroundColor: viewMode === "list" ? "var(--accent-primary)" : "transparent",
              color: viewMode === "list" ? "#ffffff" : "var(--text-muted)",
            }}
            title={t("views.list")}
          >
            <TableProperties className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t("views.list")}</span>
          </button>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div className="flex-1 min-w-[100px] max-w-xs mx-2">
        <div className="relative flex items-center">
          <Search
            className="w-4 h-4 absolute left-3 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            type="text"
            placeholder={t("topbar.search_placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-8 pl-9 pr-8 rounded-lg text-xs focus:outline-none transition-all border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Actions Bar */}
      <div className="flex items-center gap-1.5 shrink min-w-0">
        <button
          type="button"
          onClick={toggleBigPicture}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-extrabold text-white transition-all shadow-md hover:brightness-110 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--accent-primary)",
            boxShadow: `0 0 15px var(--accent-glow)`,
          }}
          title="Avvia Modalità Fullscreen Big Picture (F11)"
        >
          <Tv className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">{t("topbar.big_picture")}</span>
        </button>

        {/* Sound Effects Toggle */}
        <button
          type="button"
          onClick={handleToggleSound}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm hover:bg-white/10 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: soundEnabled ? "var(--text-primary)" : "var(--text-muted)",
          }}
          title={soundEnabled ? "Audio ON (Click to mute)" : "Audio OFF (Click to unmute)"}
        >
          {soundEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span className="hidden 2xl:inline">
            {soundEnabled ? t("topbar.audio_on") : t("topbar.audio_off")}
          </span>
        </button>

        {/* Settings & Options (Language / Sound / Themes) */}
        <button
          type="button"
          onClick={() => {
            soundEffects.playSelect();
            setShowSettingsModal(true);
          }}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title={t("topbar.options")}
        >
          <span className="text-sm leading-none">{currentLocaleInfo.flag}</span>
          <Settings className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
          <span className="hidden xl:inline">{t("topbar.options")}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowThemeModal(true)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Gestione e Personalizzazione Temi"
        >
          <Palette className="w-3.5 h-3.5" style={{ color: "var(--accent-primary)" }} />
          <span className="hidden 2xl:inline">{t("topbar.themes")}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            loadProvidersAndConfig();
            setShowPluginModal(true);
          }}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Centro Plugin & Fonti Metadati (SteamGridDB, OpenCritic, Steam)"
        >
          <Puzzle className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden 2xl:inline">{t("topbar.plugins")}</span>
          {providers.filter((p) => p.has_configured_key || !p.requires_api_key).length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowAddCustomModal(true)}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Aggiungi Gioco o Eseguibile Personalizzato (.exe)"
        >
          <PlusCircle className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">{t("topbar.add_game")}</span>
        </button>

        {selectedGame && (
          <button
            type="button"
            onClick={() => {
              setGameToEdit(selectedGame);
              setShowEditorModal(true);
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-bold transition-all hover:bg-white/10 hover:border-slate-400 active:opacity-90 shadow-sm shrink-0"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
            title={`Modifica manualmente le informazioni di '${selectedGame.title}'`}
          >
            <Pencil className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">{t("topbar.edit_info")}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleSync}
          disabled={isSyncing}
          className="p-1.5 rounded-lg border transition-all shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Sincronizza Librerie Esterne (Steam / Epic Games)"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin text-white" : ""}`} />
        </button>

        <button
          type="button"
          onClick={handleDownloadAll}
          disabled={isDownloading}
          className="p-1.5 rounded-lg border transition-all shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          title="Scarica Metadati e Cover HD"
        >
          <Download className={`w-4 h-4 ${isDownloading ? "animate-bounce text-white" : ""}`} />
        </button>

        {/* Optional UI Zoom Controls */}
        <div
          className="hidden 2xl:flex items-center gap-1 p-0.5 rounded-lg border shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setUiZoom((z) => Math.max(0.7, z - 0.1))}
            className="p-1 hover:text-white"
            style={{ color: "var(--text-muted)" }}
            title="Riduci Zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span
            className="text-[10px] font-mono px-1"
            style={{ color: "var(--text-primary)" }}
          >
            {Math.round(uiZoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setUiZoom((z) => Math.min(1.5, z + 0.1))}
            className="p-1 hover:text-white"
            style={{ color: "var(--text-muted)" }}
            title="Aumenta Zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Window Controls */}
      <div
        className="flex items-center gap-1 shrink-0 ml-2 pl-2 border-l z-50"
        style={{ borderColor: "var(--border-color)" }}
        data-no-drag="true"
      >
        <button
          type="button"
          onClick={handleMinimize}
          className="w-8 h-8 rounded-md hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title="Riduci a icona"
          data-no-drag="true"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          className="w-8 h-8 rounded-md hover:bg-white/10 active:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title="Ingrandisci / Ripristina finestra"
          data-no-drag="true"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="w-8 h-8 rounded-md hover:bg-rose-600 hover:text-white active:bg-rose-700 flex items-center justify-center transition-all cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title="Chiudi applicazione"
          data-no-drag="true"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
