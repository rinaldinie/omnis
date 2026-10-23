import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw,
  Sparkles,
  Trophy,
  Check,
  FolderOpen,
  Volume2,
  Sliders,
  Eye,
  Trash2,
  ExternalLink,
} from "lucide-react";
import soundEffects from "../../utils/soundEffects";

export interface AchievementsConfig {
  // Provider sources
  enableSteam: boolean;
  enableGog: boolean;
  enableEpic: boolean;
  enableXbox: boolean;
  enableOrigin: boolean;
  enablePsn: boolean;
  enableRetroAchievements: boolean;
  enableRpcs3: boolean;
  enableOverwatch: boolean;
  enableStarCraft2: boolean;
  enableManual: boolean;

  // Extension view options
  showProgressBar: boolean;
  showPoints: boolean;
  showRarityBadges: boolean;
  badgeSize: "md" | "lg";

  // Appearance & Rarity
  ultraRareThreshold: number; // e.g. 10.0
  rareThreshold: number; // e.g. 25.0
  goldenGlowUltraRare: boolean;
  revealSecretsByDefault: boolean;

  // Misc & Cache
  enableLocalIconCache: boolean;
  concurrencyLimit: number; // 1 to 16
  playSounds: boolean;

  // Ignored games (IDs)
  ignoredGameIds: string[];
}

const DEFAULT_CONFIG: AchievementsConfig = {
  enableSteam: true,
  enableGog: true,
  enableEpic: true,
  enableXbox: true,
  enableOrigin: false,
  enablePsn: false,
  enableRetroAchievements: false,
  enableRpcs3: false,
  enableOverwatch: true,
  enableStarCraft2: true,
  enableManual: true,

  showProgressBar: true,
  showPoints: true,
  showRarityBadges: true,
  badgeSize: "md",

  ultraRareThreshold: 10.0,
  rareThreshold: 25.0,
  goldenGlowUltraRare: true,
  revealSecretsByDefault: false,

  enableLocalIconCache: true,
  concurrencyLimit: 8,
  playSounds: true,

  ignoredGameIds: [],
};

const STORAGE_KEY = "omnis_achievements_config";

export function loadAchievementsConfig(): AchievementsConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn("Failed to parse achievements config from localStorage:", e);
  }
  return DEFAULT_CONFIG;
}

export function saveAchievementsConfig(cfg: AchievementsConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.warn("Failed to save achievements config to localStorage:", e);
  }
}

type SubTab = "sources" | "view" | "misc" | "appearance" | "ignored";

interface AchievementsSettingsTabProps {
  onClose?: () => void;
}

export const AchievementsSettingsTab: React.FC<AchievementsSettingsTabProps> = ({
  onClose,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("sources");
  const [config, setConfig] = useState<AchievementsConfig>(loadAchievementsConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Accordion state matching settings_01.jpg
  const [openSections, setOpenSections] = useState({
    stores: true,
    emulators: true,
    custom: true,
  });

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof openSections) => {
    soundEffects.playNav();
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const update = <K extends keyof AchievementsConfig>(key: K, val: AchievementsConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    soundEffects.playSelect();
    saveAchievementsConfig(config);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    soundEffects.playSelect();
    setConfig(DEFAULT_CONFIG);
    saveAchievementsConfig(DEFAULT_CONFIG);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sub-tab Navigation matching settings_01.jpg */}
      <div
        className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("sources");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeSubTab === "sources"
            ? "text-sky-400 bg-sky-500/10 shadow-xs"
            : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <span>Achievements</span>
          {activeSubTab === "sources" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("view");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeSubTab === "view"
            ? "text-sky-400 bg-sky-500/10 shadow-xs"
            : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <span>Extension view</span>
          {activeSubTab === "view" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("misc");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeSubTab === "misc"
            ? "text-sky-400 bg-sky-500/10 shadow-xs"
            : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <span>Misc</span>
          {activeSubTab === "misc" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("appearance");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeSubTab === "appearance"
            ? "text-sky-400 bg-sky-500/10 shadow-xs"
            : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <span>Appearance</span>
          {activeSubTab === "appearance" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab("ignored");
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeSubTab === "ignored"
            ? "text-sky-400 bg-sky-500/10 shadow-xs"
            : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
        >
          <span>Ignored games</span>
          {activeSubTab === "ignored" && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Main SubTab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* SUBTAB 1: SOURCES */}
        {activeSubTab === "sources" && (
          <div className="space-y-6 font-sans">
            {/* Group 1: Store Ufficiali PC */}
            <div className="space-y-3">
              <div
                onClick={() => toggleSection("stores")}
                className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white"
              >
                {openSections.stores ? (
                  <ChevronUp className="w-4 h-4 text-sky-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-sky-400" />
                )}
                <span>Store Ufficiali & Piattaforme PC</span>
              </div>

              {openSections.stores && (
                <div className="pl-6 space-y-3">
                  {/* Steam */}
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableSteam}
                        onChange={(e) => update("enableSteam", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable Steam achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">315/366</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "steam" ? null : "steam"
                          )
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli integrazione Steam"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* GOG */}
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableGog}
                        onChange={(e) => update("enableGog", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable GOG achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">67/78</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "gog" ? null : "gog")
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli integrazione GOG"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Epic Games */}
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableEpic}
                        onChange={(e) => update("enableEpic", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable Epic Games achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">24/45</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "epic" ? null : "epic")
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli integrazione Epic Games"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Xbox */}
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableXbox}
                        onChange={(e) => update("enableXbox", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable Xbox achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">7/7</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "xbox" ? null : "xbox")
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli integrazione Xbox Live"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Origin */}
                  <div className="flex items-center justify-between py-1 group opacity-60">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableOrigin}
                        onChange={(e) => update("enableOrigin", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable Origin / EA achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">0/0</span>
                      <span className="text-[10px] text-amber-400/80 font-bold px-2 py-0.5 rounded-full bg-amber-400/10">
                        In Arrivo
                      </span>
                    </div>
                  </div>

                  {/* PSN */}
                  <div className="flex items-center justify-between py-1 group opacity-60">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enablePsn}
                        onChange={(e) => update("enablePsn", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable PSN achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">0/0</span>
                      <span className="text-[10px] text-indigo-400/80 font-bold px-2 py-0.5 rounded-full bg-indigo-400/10">
                        In Arrivo
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Group 2: Emulatori & RetroAchievements */}
            <div className="space-y-3 pt-2">
              <div
                onClick={() => toggleSection("emulators")}
                className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white"
              >
                {openSections.emulators ? (
                  <ChevronUp className="w-4 h-4 text-sky-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-sky-400" />
                )}
                <span>Emulatori & Retrogaming</span>
              </div>

              {openSections.emulators && (
                <div className="pl-6 space-y-3">
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableRetroAchievements}
                        onChange={(e) =>
                          update("enableRetroAchievements", e.target.checked)
                        }
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable RetroAchievements achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">0/0</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "retro" ? null : "retro"
                          )
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli RetroAchievements"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableRpcs3}
                        onChange={(e) => update("enableRpcs3", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable RPCS3 achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">0/0</span>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "rpcs3" ? null : "rpcs3"
                          )
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                        title="Dettagli RPCS3"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Group 3: Standalone & Manuali */}
            <div className="space-y-3 pt-2">
              <div
                onClick={() => toggleSection("custom")}
                className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-300 hover:text-white"
              >
                {openSections.custom ? (
                  <ChevronUp className="w-4 h-4 text-sky-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-sky-400" />
                )}
                <span>Titoli Standalone & Tracciamento Manuale</span>
              </div>

              {openSections.custom && (
                <div className="pl-6 space-y-3">
                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableOverwatch}
                        onChange={(e) => update("enableOverwatch", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable Overwatch achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "ow" ? null : "ow"
                          )
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableStarCraft2}
                        onChange={(e) =>
                          update("enableStarCraft2", e.target.checked)
                        }
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable StarCraft II achievements
                      </span>
                    </label>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "sc2" ? null : "sc2"
                          )
                        }
                        className="text-slate-500 hover:text-sky-400 transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-1 group">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.enableManual}
                        onChange={(e) => update("enableManual", e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        Enable manual achievements
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Help / Info Dialog */}
            {activeTooltip && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-sky-500/30 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-300 uppercase tracking-wider text-[11px]">
                    Informazioni Provider
                  </span>
                  <button
                    onClick={() => setActiveTooltip(null)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
                {activeTooltip === "steam" && (
                  <p>
                    Gli obiettivi di Steam vengono sincronizzati in background utilizzando la Steam Web API.
                    Le icone vengono scaricate e memorizzate in locale per rendering istantaneo a 120 FPS.
                  </p>
                )}
                {activeTooltip === "gog" && (
                  <p>
                    Gli achievement di GOG Galaxy vengono interrogati tramite gli endpoint ufficiali di gameplay.gog.com
                    sfruttando il token di accesso OAuth memorizzato in modo sicuro.
                  </p>
                )}
                {activeTooltip === "epic" && (
                  <p>
                    Gli obiettivi di Epic Games Store utilizzano la GraphQL API di Epic Games per estrarre le definizioni dei set,
                    valori di XP e la rarità globale del gioco.
                  </p>
                )}
                {activeTooltip === "xbox" && (
                  <p>
                    Gli achievement di Xbox Live / Game Pass includono il punteggio Gamerscore (G) e il timestamp esatto di sblocco
                    tramite token XSTS crittografato.
                  </p>
                )}
                {activeTooltip === "retro" && (
                  <p>
                    RetroAchievements consente di tracciare achievement per giochi retro (NES, SNES, PS1, N64)
                    tramite chiave API RetroAchievements.org.
                  </p>
                )}
                {activeTooltip === "rpcs3" && (
                  <p>
                    RPCS3 legge direttamente i file di trofei PS3 salvati nella directory del tuo emulatore.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: EXTENSION VIEW */}
        {activeSubTab === "view" && (
          <div className="space-y-5 text-xs font-sans">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Visualizzazione nella Scheda Gioco
            </h4>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Barra di Progresso Globale</span>
                  <span className="text-slate-400">Mostra la barra di avanzamento e percentuale nella testata</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.showProgressBar}
                  onChange={(e) => update("showProgressBar", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Punti Gamerscore & XP</span>
                  <span className="text-slate-400">Mostra i punti guadagnati su Xbox (G) ed Epic Games (XP)</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.showPoints}
                  onChange={(e) => update("showPoints", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Badge & Pillole di Rarità</span>
                  <span className="text-slate-400">Mostra i contatori Ultra-Rari (&lt;10%) e Rari</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.showRarityBadges}
                  onChange={(e) => update("showRarityBadges", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>

              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <span className="font-bold text-white block">Dimensione Icone Griglia</span>
                  <span className="text-slate-400">Seleziona la dimensione base dei badge</span>
                </div>
                <select
                  value={config.badgeSize}
                  onChange={(e) => update("badgeSize", e.target.value as "md" | "lg")}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-white font-medium"
                >
                  <option value="md">56 x 56 px (Standard Desktop)</option>
                  <option value="lg">72 x 72 px (Grande / Big Picture)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: MISC & CACHE */}
        {activeSubTab === "misc" && (
          <div className="space-y-5 text-xs font-sans">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Motore di Caching Locale Icone
            </h4>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Abilita Caching Locale Icone</span>
                  <span className="text-slate-400">
                    Salva tutte le icone in %APPDATA%/omnis/cache/achievements/ per rendering istantaneo offline
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.enableLocalIconCache}
                  onChange={(e) => update("enableLocalIconCache", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white block">Concorrenza Download Paralleli</span>
                    <span className="text-slate-400">
                      Numero massimo di connessioni simultanee con semaforo Tokio
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sky-400 text-sm">
                    {config.concurrencyLimit} thread
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={16}
                  value={config.concurrencyLimit}
                  onChange={(e) => update("concurrencyLimit", Number(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Effetti Sonori di Navigazione</span>
                  <span className="text-slate-400">Riproduci toni sintetizzati allo spostamento focus e selezione badge</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.playSounds}
                  onChange={(e) => update("playSounds", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>
            </div>
          </div>
        )}

        {/* SUBTAB 4: APPEARANCE & RARITY */}
        {activeSubTab === "appearance" && (
          <div className="space-y-5 text-xs font-sans">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Soglie Rarità & Stile Visuale
            </h4>

            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-amber-400 block flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Soglia Ultra-Raro (%)</span>
                    </span>
                    <span className="text-slate-400">
                      Percentuale globale massima per considerare un trofeo "Ultra-Raro"
                    </span>
                  </div>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    &lt; {config.ultraRareThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={config.ultraRareThreshold}
                  onChange={(e) => update("ultraRareThreshold", Number(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-cyan-400 block">Soglia Raro (%)</span>
                    <span className="text-slate-400">
                      Percentuale globale per considerare un trofeo "Raro"
                    </span>
                  </div>
                  <span className="font-mono font-bold text-cyan-400 text-sm">
                    &lt; {config.rareThreshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={50}
                  step={1}
                  value={config.rareThreshold}
                  onChange={(e) => update("rareThreshold", Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Glow Dorato per Ultra-Rari</span>
                  <span className="text-slate-400">Applica un alone dorato ai trofei sbloccati ad altissima rarità</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.goldenGlowUltraRare}
                  onChange={(e) => update("goldenGlowUltraRare", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer hover:bg-white/[0.04]">
                <div>
                  <span className="font-bold text-white block">Rivela Segreti di Default</span>
                  <span className="text-slate-400">
                    Se disattivato, gli obiettivi segreti non sbloccati rimangono nascosti fino al click
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={config.revealSecretsByDefault}
                  onChange={(e) => update("revealSecretsByDefault", e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-slate-900 text-sky-500"
                />
              </label>
            </div>
          </div>
        )}

        {/* SUBTAB 5: IGNORED GAMES */}
        {activeSubTab === "ignored" && (
          <div className="space-y-4 text-xs font-sans">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Giochi Esclusi dal Tracciamento
            </h4>
            <p className="text-slate-400 leading-relaxed">
              I giochi inseriti in questa lista non sincronizzeranno gli obiettivi e non mostreranno notifiche di sblocco.
            </p>

            {config.ignoredGameIds.length === 0 ? (
              <div className="py-8 text-center text-slate-500 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                Nessun gioco attualmente escluso.
              </div>
            ) : (
              <div className="space-y-2">
                {config.ignoredGameIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10"
                  >
                    <span className="font-mono text-slate-300">{id}</span>
                    <button
                      onClick={() =>
                        update(
                          "ignoredGameIds",
                          config.ignoredGameIds.filter((g) => g !== id)
                        )
                      }
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions exactly matching settings_01.jpg (Save / Cancel) */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Ripristina Default</span>
        </button>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 animate-in fade-in duration-200">
              <Check className="w-3.5 h-3.5" />
              <span>Impostazioni Salvate!</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salva</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              Annulla
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
