import React, { useState, useEffect } from "react";
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Save,
  RotateCcw,
  Sparkles,
  Trophy,
  Medal,
  Check,
  Trash2,
} from "lucide-react";
import soundEffects from "../../utils/soundEffects";
import { useTranslation } from "../../i18n";
import { api, TAURI_EVENTS } from "../../api";
import { listen } from "@tauri-apps/api/event";
import { SettingGroup, SettingRow, ToggleSwitch } from "../settings/SettingsControls";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  ultraRareThreshold: number; // e.g. 5.0
  rareThreshold: number; // e.g. 20.0
  uncommonThreshold: number; // e.g. 50.0
  goldenGlowUltraRare: boolean;
  revealSecretsByDefault: boolean;

  // Misc & Cache
  enableLocalIconCache: boolean;
  concurrencyLimit: number; // 1 to 16
  playSounds: boolean;

  // Ignored games (IDs)
  ignoredGameIds: string[];

  // Sync settings
  startupSyncInterval: "always" | "1" | "3" | "7" | "never";
  syncOnGameExit: boolean;
  lastLibrarySyncTimestamp?: number | null;
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

  ultraRareThreshold: 5.0,
  rareThreshold: 20.0,
  uncommonThreshold: 50.0,
  goldenGlowUltraRare: true,
  revealSecretsByDefault: false,

  enableLocalIconCache: true,
  concurrencyLimit: 8,
  playSounds: true,

  ignoredGameIds: [],

  startupSyncInterval: "3",
  syncOnGameExit: true,
  lastLibrarySyncTimestamp: null,
};

const STORAGE_KEY = "omnis_achievements_config";
export const ACHIEVEMENTS_CONFIG_EVENT = "omnis:achievements-config-changed";

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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(ACHIEVEMENTS_CONFIG_EVENT, { detail: cfg }));
    }
  } catch (e) {
    console.warn("Failed to save achievements config to localStorage:", e);
  }
}

/** Hook to reactively subscribe to changes in the achievements configuration */
export function useAchievementsConfig(): AchievementsConfig {
  const [config, setConfig] = useState<AchievementsConfig>(loadAchievementsConfig);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (e: Event) => {
      const custom = e as CustomEvent<AchievementsConfig>;
      if (custom.detail) {
        setConfig(custom.detail);
      } else {
        setConfig(loadAchievementsConfig());
      }
    };

    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(e.newValue) });
        } catch {
          setConfig(loadAchievementsConfig());
        }
      }
    };

    window.addEventListener(ACHIEVEMENTS_CONFIG_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(ACHIEVEMENTS_CONFIG_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  return config;
}

export type AchievementSubTab = "sources" | "view" | "misc" | "appearance" | "ignored";
type SubTab = AchievementSubTab;

export interface AchievementsSettingsTabProps {
  onClose?: () => void;
  activeSubTab?: AchievementSubTab;
  onSubTabChange?: (tab: AchievementSubTab) => void;
  hideTabBar?: boolean;
}

export const AchievementsSettingsTab: React.FC<AchievementsSettingsTabProps> = ({
  onClose,
  activeSubTab: controlledSubTab,
  onSubTabChange,
  hideTabBar = false,
}) => {
  const { t, locale } = useTranslation();
  const [internalSubTab, setInternalSubTab] = useState<SubTab>("sources");
  const activeSubTab = controlledSubTab ?? internalSubTab;

  const setActiveSubTab = (tab: SubTab) => {
    setInternalSubTab(tab);
    onSubTabChange?.(tab);
  };
  const [config, setConfig] = useState<AchievementsConfig>(loadAchievementsConfig);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Sync state with backend on mount and listen for completed library syncs
  useEffect(() => {
    api.achievements.setSyncAchievementsOnGameExit(config.syncOnGameExit).catch(console.warn);

    let unlisten: (() => void) | undefined;
    listen<{ status: string; scope: string }>(TAURI_EVENTS.ACHIEVEMENT_SYNC_PROGRESS, (event) => {
      if (event.payload?.status === "completed" && event.payload?.scope === "library") {
        setConfig((prev) => ({ ...prev, lastLibrarySyncTimestamp: Date.now() }));
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.warn("Could not attach achievement-sync-progress listener in modal:", err);
      });

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setConfig((prev) => {
      const next = { ...prev, [key]: val };
      // Keep threshold consistency: ultraRare <= rare <= uncommon
      if (key === "ultraRareThreshold") {
        const num = val as number;
        if (next.rareThreshold < num) next.rareThreshold = num;
        if (next.uncommonThreshold < next.rareThreshold) next.uncommonThreshold = next.rareThreshold;
      } else if (key === "rareThreshold") {
        const num = val as number;
        if (next.ultraRareThreshold > num) next.ultraRareThreshold = num;
        if (next.uncommonThreshold < num) next.uncommonThreshold = num;
      } else if (key === "uncommonThreshold") {
        const num = val as number;
        if (next.rareThreshold > num) next.rareThreshold = num;
        if (next.ultraRareThreshold > next.rareThreshold) next.ultraRareThreshold = next.rareThreshold;
      }
      return next;
    });
  };

  const handleToggleSyncOnGameExit = (next: boolean) => {
    update("syncOnGameExit", next);
  };

  const handleSave = () => {
    soundEffects.playSelect();
    saveAchievementsConfig(config);
    api.achievements.setSyncAchievementsOnGameExit(config.syncOnGameExit).catch(console.warn);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = () => {
    soundEffects.playSelect();
    setConfig(DEFAULT_CONFIG);
    saveAchievementsConfig(DEFAULT_CONFIG);
    api.achievements.setSyncAchievementsOnGameExit(DEFAULT_CONFIG.syncOnGameExit).catch(console.warn);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sub-tab Navigation matching settings_01.jpg */}
      {!hideTabBar && (
        <div
          className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
          style={{ borderColor: "var(--border-color)" }}
        >
          {(
            [
              { id: "sources", label: t("achievements_settings.tab_sources") },
              { id: "view", label: t("achievements_settings.tab_view") },
              { id: "misc", label: t("achievements_settings.tab_misc") },
              { id: "appearance", label: t("achievements_settings.tab_appearance") },
              { id: "ignored", label: t("achievements_settings.tab_ignored") },
            ] as const
          ).map((tab) => {
            const isSelected = activeSubTab === tab.id;
            return (
              <Button
                key={tab.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  soundEffects.playNav();
                  setActiveSubTab(tab.id);
                }}
                className={`h-auto px-4 py-1.5 rounded-lg text-xs font-bold relative ${
                  isSelected ? "shadow-xs" : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
                        color: "var(--accent-primary)",
                      }
                    : undefined
                }
              >
                <span>{tab.label}</span>
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: "var(--accent-primary)" }}
                  />
                )}
              </Button>
            );
          })}
        </div>
      )}

      {/* Main SubTab Content Area */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
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
                  <ChevronUp className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                ) : (
                  <ChevronDown className="w-4 h-4" style={{ color: "var(--accent-primary)" }} />
                )}
                <span>{t("achievements_settings.stores_group")}</span>
              </div>

              {openSections.stores && (
                <div className="pl-6 space-y-3">
                  {/* Steam */}
                  <div className="flex items-center justify-between py-1 group">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={config.enableSteam}
                        onChange={(val) => update("enableSteam", val)}
                        ariaLabel={t("achievements_settings.enable_store", { store: "Steam" })}
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        {t("achievements_settings.enable_store", { store: "Steam" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setActiveTooltip(
                            activeTooltip === "steam" ? null : "steam"
                          )
                        }
                        className="h-auto w-auto p-0.5 text-slate-500 hover:text-white hover:bg-transparent"
                        title={t("achievements_settings.store_info_title", { store: "Steam" })}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* GOG */}
                  <div className="flex items-center justify-between py-1 group">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={config.enableGog}
                        onChange={(val) => update("enableGog", val)}
                        ariaLabel={t("achievements_settings.enable_store", { store: "GOG" })}
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        {t("achievements_settings.enable_store", { store: "GOG" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "gog" ? null : "gog")
                        }
                        className="h-auto w-auto p-0.5 text-slate-500 hover:text-white hover:bg-transparent"
                        title={t("achievements_settings.store_info_title", { store: "GOG" })}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Epic Games */}
                  <div className="flex items-center justify-between py-1 group">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={config.enableEpic}
                        onChange={(val) => update("enableEpic", val)}
                        ariaLabel={t("achievements_settings.enable_store", { store: "Epic Games" })}
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        {t("achievements_settings.enable_store", { store: "Epic Games" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "epic" ? null : "epic")
                        }
                        className="h-auto w-auto p-0.5 text-slate-500 hover:text-white hover:bg-transparent"
                        title={t("achievements_settings.store_info_title", { store: "Epic Games" })}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Xbox */}
                  <div className="flex items-center justify-between py-1 group">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={config.enableXbox}
                        onChange={(val) => update("enableXbox", val)}
                        ariaLabel={t("achievements_settings.enable_store", { store: "Xbox" })}
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        {t("achievements_settings.enable_store", { store: "Xbox" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setActiveTooltip(activeTooltip === "xbox" ? null : "xbox")
                        }
                        className="h-auto w-auto p-0.5 text-slate-500 hover:text-white hover:bg-transparent"
                        title={t("achievements_settings.store_info_title", { store: "Xbox Live" })}
                      >
                        <HelpCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Origin */}
                  <div className="flex items-center justify-between py-1 group opacity-60">
                    <div className="flex items-center gap-3">
                      <ToggleSwitch
                        checked={config.enableOrigin}
                        onChange={(val) => update("enableOrigin", val)}
                        ariaLabel={t("achievements_settings.enable_store", { store: "Origin / EA" })}
                      />
                      <span className="text-xs text-slate-200 font-medium group-hover:text-white">
                        {t("achievements_settings.enable_store", { store: "Origin / EA" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono text-slate-400">0/0</span>
                      <span className="text-[10px] text-amber-400/80 font-bold px-2 py-0.5 rounded-full bg-amber-400/10">
                        {t("achievements_settings.coming_soon")}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Help / Info Dialog */}
            {activeTooltip && (
              <div
                className="p-4 rounded-2xl border text-xs text-slate-300 space-y-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-bold uppercase tracking-wider text-[11px]"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {t("achievements_settings.provider_info")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setActiveTooltip(null)}
                    className="h-auto w-auto p-0.5 text-slate-400 hover:text-white hover:bg-transparent text-xs font-bold"
                  >
                    ✕
                  </Button>
                </div>
                {activeTooltip === "steam" && (
                  <p>
                    {t("achievements_settings.info_steam")}
                  </p>
                )}
                {activeTooltip === "gog" && (
                  <p>
                    {t("achievements_settings.info_gog")}
                  </p>
                )}
                {activeTooltip === "epic" && (
                  <p>
                    {t("achievements_settings.info_epic")}
                  </p>
                )}
                {activeTooltip === "xbox" && (
                  <p>
                    {t("achievements_settings.info_xbox")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2: EXTENSION VIEW */}
        {activeSubTab === "view" && (
          <div className="space-y-4">
            <SettingGroup
              title={t("achievements_settings.view_heading")}
              description="Personalizza la visualizzazione degli obiettivi nella libreria."
            >
              <SettingRow
                title={t("achievements_settings.progress_bar")}
                description={t("achievements_settings.progress_bar_desc")}
              >
                <ToggleSwitch
                  checked={config.showProgressBar}
                  onChange={(val) => update("showProgressBar", val)}
                  ariaLabel={t("achievements_settings.progress_bar")}
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.points")}
                description={t("achievements_settings.points_desc")}
              >
                <ToggleSwitch
                  checked={config.showPoints}
                  onChange={(val) => update("showPoints", val)}
                  ariaLabel={t("achievements_settings.points")}
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.rarity_badges")}
                description={t("achievements_settings.rarity_badges_desc")}
              >
                <ToggleSwitch
                  checked={config.showRarityBadges}
                  onChange={(val) => update("showRarityBadges", val)}
                  ariaLabel={t("achievements_settings.rarity_badges")}
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.icon_size")}
                description={t("achievements_settings.icon_size_desc")}
              >
                <select
                  value={config.badgeSize}
                  onChange={(e) => update("badgeSize", e.target.value as "md" | "lg")}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border text-white font-medium text-xs focus:outline-hidden"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <option value="md">{t("achievements_settings.opt_md")}</option>
                  <option value="lg">{t("achievements_settings.opt_lg")}</option>
                </select>
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB 3: MISC & CACHE */}
        {activeSubTab === "misc" && (
          <div className="space-y-4">
            {/* Synchronization Section */}
            <SettingGroup
              title={t("achievements_settings.sync_heading")}
              description="Controlla quando e come gli obiettivi vengono scaricati dal cloud."
            >
              <SettingRow
                title={t("achievements_settings.startup_sync_interval")}
                description={
                  <div>
                    <span>{t("achievements_settings.startup_sync_interval_desc")}</span>
                    <span className="block text-[10px] text-slate-500 mt-0.5">
                      {config.lastLibrarySyncTimestamp
                        ? t("achievements_settings.last_sync", {
                            time: new Date(
                              config.lastLibrarySyncTimestamp > 1e11
                                ? config.lastLibrarySyncTimestamp
                                : config.lastLibrarySyncTimestamp * 1000
                            ).toLocaleString(locale),
                          })
                        : t("achievements_settings.last_sync_never")}
                    </span>
                  </div>
                }
              >
                <select
                  value={config.startupSyncInterval ?? "3"}
                  onChange={(e) =>
                    update(
                      "startupSyncInterval",
                      e.target.value as AchievementsConfig["startupSyncInterval"]
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-slate-900 border text-white font-medium text-xs focus:outline-hidden"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <option value="always">{t("achievements_settings.opt_sync_always")}</option>
                  <option value="1">{t("achievements_settings.opt_sync_1_day")}</option>
                  <option value="3">{t("achievements_settings.opt_sync_3_days")}</option>
                  <option value="7">{t("achievements_settings.opt_sync_7_days")}</option>
                  <option value="never">{t("achievements_settings.opt_sync_never")}</option>
                </select>
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.sync_on_game_exit")}
                description={t("achievements_settings.sync_on_game_exit_desc")}
              >
                <ToggleSwitch
                  checked={config.syncOnGameExit}
                  onChange={(val) => handleToggleSyncOnGameExit(val)}
                  ariaLabel={t("achievements_settings.sync_on_game_exit")}
                />
              </SettingRow>
            </SettingGroup>

            {/* Cache & Performance Section */}
            <SettingGroup
              title={t("achievements_settings.cache_heading")}
              description="Gestisci la cache locale e le performance di rete."
            >
              <SettingRow
                title={t("achievements_settings.cache_enable")}
                description={t("achievements_settings.cache_enable_desc")}
              >
                <ToggleSwitch
                  checked={config.enableLocalIconCache}
                  onChange={(val) => update("enableLocalIconCache", val)}
                  ariaLabel={t("achievements_settings.cache_enable")}
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.concurrency")}
                description={t("achievements_settings.concurrency_desc")}
                badge={
                  <span
                    className="font-mono font-bold text-xs px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    {t("achievements_settings.threads", { count: config.concurrencyLimit })}
                  </span>
                }
              >
                <input
                  type="range"
                  min={1}
                  max={16}
                  value={config.concurrencyLimit}
                  onChange={(e) => update("concurrencyLimit", Number(e.target.value))}
                  style={{ accentColor: "var(--accent-primary)" }}
                  className="w-28 cursor-pointer"
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.sounds")}
                description={t("achievements_settings.sounds_desc")}
              >
                <ToggleSwitch
                  checked={config.playSounds}
                  onChange={(val) => update("playSounds", val)}
                  ariaLabel={t("achievements_settings.sounds")}
                />
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB 4: APPEARANCE & RARITY */}
        {activeSubTab === "appearance" && (
          <div className="space-y-4">
            <SettingGroup
              title={t("achievements_settings.rarity_heading")}
              description="Configura le soglie percentuali per considerare un obiettivo Raro o Ultra Raro."
            >
              <SettingRow
                icon={<Sparkles className="w-4 h-4" />}
                title={t("achievements_settings.ultra_rare_threshold")}
                description={t("achievements_settings.ultra_rare_desc")}
                badge={
                  <span
                    className="font-mono font-bold text-xs px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    ≤ {config.ultraRareThreshold}%
                  </span>
                }
              >
                <input
                  type="range"
                  min={0.5}
                  max={15}
                  step={0.5}
                  value={config.ultraRareThreshold}
                  onChange={(e) => update("ultraRareThreshold", Number(e.target.value))}
                  style={{ accentColor: "var(--accent-primary)" }}
                  className="w-28 cursor-pointer"
                />
              </SettingRow>

              <SettingRow
                icon={<Trophy className="w-4 h-4" />}
                title={t("achievements_settings.rare_threshold")}
                description={t("achievements_settings.rare_desc")}
                badge={
                  <span
                    className="font-mono font-bold text-xs px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    ≤ {config.rareThreshold}%
                  </span>
                }
              >
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={config.rareThreshold}
                  onChange={(e) => update("rareThreshold", Number(e.target.value))}
                  style={{ accentColor: "var(--accent-primary)" }}
                  className="w-28 cursor-pointer"
                />
              </SettingRow>

              <SettingRow
                icon={<Medal className="w-4 h-4" />}
                title={t("achievements_settings.uncommon_threshold")}
                description={t("achievements_settings.uncommon_desc")}
                badge={
                  <span
                    className="font-mono font-bold text-xs px-2 py-0.5 rounded border"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    ≤ {config.uncommonThreshold}%
                  </span>
                }
              >
                <input
                  type="range"
                  min={20}
                  max={80}
                  step={1}
                  value={config.uncommonThreshold}
                  onChange={(e) => update("uncommonThreshold", Number(e.target.value))}
                  style={{ accentColor: "var(--accent-primary)" }}
                  className="w-28 cursor-pointer"
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.golden_glow")}
                description={t("achievements_settings.golden_glow_desc")}
              >
                <ToggleSwitch
                  checked={config.goldenGlowUltraRare}
                  onChange={(val) => update("goldenGlowUltraRare", val)}
                  ariaLabel={t("achievements_settings.golden_glow")}
                />
              </SettingRow>

              <SettingRow
                title={t("achievements_settings.reveal_secrets")}
                description={t("achievements_settings.reveal_secrets_desc")}
              >
                <ToggleSwitch
                  checked={config.revealSecretsByDefault}
                  onChange={(val) => update("revealSecretsByDefault", val)}
                  ariaLabel={t("achievements_settings.reveal_secrets")}
                />
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB 5: IGNORED GAMES */}
        {activeSubTab === "ignored" && (
          <div className="space-y-4 text-xs font-sans">
            <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              {t("achievements_settings.ignored_heading")}
            </h4>
            <p className="text-slate-400 leading-relaxed">
              {t("achievements_settings.ignored_desc")}
            </p>

            {config.ignoredGameIds.length === 0 ? (
              <div className="py-8 text-center text-slate-500 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl">
                {t("achievements_settings.ignored_empty")}
              </div>
            ) : (
              <div className="space-y-2">
                {config.ignoredGameIds.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10"
                  >
                    <span className="font-mono text-slate-300">{id}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() =>
                        update(
                          "ignoredGameIds",
                          config.ignoredGameIds.filter((g) => g !== id)
                        )
                      }
                      className="h-auto w-auto p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Footer Actions exactly matching settings_01.jpg (Save / Cancel) */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: "var(--border-color)" }}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-auto px-2 py-1 gap-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-transparent"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t("achievements_settings.reset")}</span>
        </Button>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span
              className="flex items-center gap-1.5 text-xs font-bold animate-in fade-in duration-200"
              style={{ color: "var(--accent-primary)" }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t("achievements_settings.saved")}</span>
            </span>
          )}

          <Button
            type="button"
            onClick={handleSave}
            className="h-auto px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 gap-2"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t("common.save")}</span>
          </Button>

          {onClose && (
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-auto px-5 py-2 rounded-xl text-xs font-bold hover:bg-white/10"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              {t("common.cancel")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
