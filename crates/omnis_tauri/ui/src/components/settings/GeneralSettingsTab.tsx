import React, { useState } from 'react';
import {
  Globe,
  Volume2,
  VolumeX,
  Minimize2,
  Palette,
  Check,
  RotateCcw,
  Save,
  Play,
  Sparkles,
  Info,
  Monitor,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCw,
  ArrowDownCircle,
  AlertCircle,
  FolderArchive,
  Clock,
} from 'lucide-react';
import { useTranslation, SUPPORTED_LOCALES, LocaleCode } from '../../i18n';
import soundEffects from '../../utils/soundEffects';
import { api } from '../../api';
import { useUpdater } from '../../hooks/useAppUpdater';
import { BackupSettingsTab } from './BackupSettingsTab';
import { SettingGroup, SettingRow, SettingRadioOption, ToggleSwitch } from './SettingsControls';
import { getRecentSettings, saveRecentSettings, RecentSettings } from '../../utils/recentSettings';

export type GeneralSubTab = 'language' | 'audio' | 'window' | 'appearance' | 'recent' | 'data' | 'updates';

export interface GeneralSettingsTabProps {
  onClose?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
  onOpenPlayniteImport?: () => void;
  activeSubTab?: GeneralSubTab;
  onSubTabChange?: (tab: GeneralSubTab) => void;
  hideSubTabBar?: boolean;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
  onOpenPlayniteImport,
  activeSubTab: controlledSubTab,
  onSubTabChange,
  hideSubTabBar = false,
}) => {
  const { locale, setLocale, t } = useTranslation();
  const updater = useUpdater();
  const [internalSubTab, setInternalSubTab] = useState<GeneralSubTab>('language');
  const activeSubTab = controlledSubTab ?? internalSubTab;

  const setActiveSubTab = (tab: GeneralSubTab) => {
    setInternalSubTab(tab);
    onSubTabChange?.(tab);
  };
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => {
    const saved = localStorage.getItem('omnis_minimize_to_tray');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('omnis_ui_animations');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [autoScanOnStartup, setAutoScanOnStartup] = useState<boolean>(() => {
    const saved = localStorage.getItem('omnis_auto_scan_on_startup');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleAutoScan = (next: boolean) => {
    soundEffects.playSelect();
    setAutoScanOnStartup(next);
    localStorage.setItem('omnis_auto_scan_on_startup', JSON.stringify(next));
  };

  const handleToggleMinimizeToTray = async (next: boolean) => {
    soundEffects.playSelect();
    setMinimizeToTray(next);
    localStorage.setItem('omnis_minimize_to_tray', JSON.stringify(next));
    api.window.setMinimizeToTray(next).catch((e) => {
      console.warn('Failed to update minimize_to_tray:', e);
    });
  };

  const handleToggleAnimations = (next: boolean) => {
    soundEffects.playSelect();
    setAnimationsEnabled(next);
    localStorage.setItem('omnis_ui_animations', JSON.stringify(next));
  };

  const [recentSettings, setRecentSettings] = useState<RecentSettings>(getRecentSettings);

  const handleMaxRecentChange = (count: number) => {
    soundEffects.playSelect();
    const updated = { ...recentSettings, maxCount: count };
    setRecentSettings(updated);
    saveRecentSettings(updated);
  };

  const handleTimeWindowChange = (days: number) => {
    soundEffects.playSelect();
    const updated = { ...recentSettings, timeWindowDays: days };
    setRecentSettings(updated);
    saveRecentSettings(updated);
  };

  const handleSelectLanguage = (code: LocaleCode) => {
    soundEffects.playSelect();
    setLocale(code);
  };

  const handleSave = () => {
    soundEffects.playSelect();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleReset = async () => {
    soundEffects.playSelect();
    setLocale('it');
    if (!soundEnabled) {
      onToggleSound();
    }
    setMinimizeToTray(true);
    localStorage.setItem('omnis_minimize_to_tray', JSON.stringify(true));
    api.window.setMinimizeToTray(true).catch((e) => {
      console.warn('Failed to reset minimize_to_tray:', e);
    });
    setAnimationsEnabled(true);
    localStorage.setItem('omnis_ui_animations', JSON.stringify(true));
    setAutoScanOnStartup(true);
    localStorage.setItem('omnis_auto_scan_on_startup', JSON.stringify(true));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const subTabsList: Array<{ id: GeneralSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'language', label: t('general_settings.tab_language'), icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'audio', label: t('general_settings.tab_audio'), icon: <Volume2 className="w-3.5 h-3.5" /> },
    { id: 'window', label: t('general_settings.tab_window'), icon: <Minimize2 className="w-3.5 h-3.5" /> },
    { id: 'appearance', label: t('general_settings.tab_appearance'), icon: <Palette className="w-3.5 h-3.5" /> },
    { id: 'recent', label: t('sidebar.recent'), icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'data', label: t('general_settings.tab_data') || 'Dati & Backup', icon: <FolderArchive className="w-3.5 h-3.5" /> },
    {
      id: 'updates',
      label: t('general_settings.tab_updates'),
      icon: <RefreshCw className={`w-3.5 h-3.5 ${updater?.status === 'checking' ? 'animate-spin' : ''}`} />,
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sub-tab Navigation (if used without Master sidebar) */}
      {!hideSubTabBar && (
        <div
          className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {subTabsList.map((tab) => {
            const isSelected = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundEffects.playNav();
                  setActiveSubTab(tab.id);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 cursor-pointer ${
                  isSelected ? 'shadow-xs' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                        color: 'var(--accent-primary)',
                      }
                    : undefined
                }
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.id === 'updates' && updater?.status === 'available' && (
                  <span
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                )}
                {isSelected && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main SubTab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* SUBTAB 1: LINGUA */}
        {activeSubTab === 'language' && (
          <div className="space-y-4">
            <SettingGroup
              title={t('settings_modal.language_section')}
              description={`${t('settings_modal.select_language')}. ${t('general_settings.language_immediate_note')}`}
              icon={<Globe className="w-4 h-4" />}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:gap-px bg-white/[0.04]">
                {SUPPORTED_LOCALES.map((loc) => {
                  const isSelected = locale === loc.code;
                  return (
                    <SettingRadioOption
                      key={loc.code}
                      selected={isSelected}
                      onSelect={() => handleSelectLanguage(loc.code)}
                      icon={loc.flag}
                      title={loc.nativeName}
                      subtitle={loc.name}
                      badge={
                        isSelected ? (
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-white"
                            style={{ backgroundColor: 'var(--accent-primary)' }}
                          >
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            </SettingGroup>

            <div
              className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div className="leading-relaxed text-slate-300">
                {t('general_settings.achievements_lang_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: AUDIO & SUONI */}
        {activeSubTab === 'audio' && (
          <div className="space-y-4">
            <SettingGroup
              title={t('general_settings.audio_cues_title')}
              description={t('general_settings.audio_cues_desc')}
              icon={<Volume2 className="w-4 h-4" />}
            >
              <SettingRow
                icon={soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                title={t('settings_modal.sound_effects')}
                description={t('settings_modal.sound_effects_desc')}
              >
                <ToggleSwitch
                  checked={soundEnabled}
                  onChange={onToggleSound}
                  ariaLabel={t('settings_modal.sound_effects')}
                />
              </SettingRow>

              <SettingRow
                icon={<Sparkles className="w-4 h-4" />}
                title={t('general_settings.sound_test_title')}
                description={t('general_settings.sound_test_desc')}
              >
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!soundEnabled}
                    onClick={() => soundEffects.playSelect()}
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                    <span>{t('general_settings.sound_select')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!soundEnabled}
                    onClick={() => soundEffects.playNav()}
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                    <span>{t('general_settings.sound_nav')}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!soundEnabled}
                    onClick={() => soundEffects.playLaunch()}
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1.5"
                  >
                    <Play className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                    <span>{t('general_settings.sound_launch')}</span>
                  </button>
                </div>
              </SettingRow>
            </SettingGroup>

            <div
              className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div className="leading-relaxed text-slate-300">
                {t('general_settings.audio_gaming_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: FINESTRA & TRAY */}
        {activeSubTab === 'window' && (
          <div className="space-y-4">
            <SettingGroup
              title={t('settings_modal.tray_section')}
              description={t('general_settings.tray_config_desc')}
              icon={<Minimize2 className="w-4 h-4" />}
            >
              <SettingRow
                icon={<Minimize2 className="w-4 h-4" />}
                title={t('settings_modal.minimize_to_tray')}
                description={t('settings_modal.minimize_to_tray_desc')}
              >
                <ToggleSwitch
                  checked={minimizeToTray}
                  onChange={handleToggleMinimizeToTray}
                  ariaLabel={t('settings_modal.minimize_to_tray')}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup
              title={t('general_settings.process_engine_title')}
              description={t('general_settings.process_engine_desc')}
              icon={<Monitor className="w-4 h-4" />}
            >
              <SettingRow
                title="Process Tracking Engine"
                description="Monitora l'esecuzione in background dei titoli per aggiornare automaticamente ore di gioco e sblocchi."
              >
                <span
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                    borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  Active
                </span>
              </SettingRow>
            </SettingGroup>

            <div
              className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div className="leading-relaxed text-slate-300">
                {t('general_settings.fullscreen_shortcut_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: ASPETTO & TEMI */}
        {activeSubTab === 'appearance' && (
          <div className="space-y-4">
            <SettingGroup
              title={t('settings_modal.theme_section')}
              description={t('general_settings.appearance_desc')}
              icon={<Palette className="w-4 h-4" />}
            >
              <SettingRow
                icon={<Palette className="w-4 h-4" />}
                title={t('general_settings.active_theme_label')}
                description={
                  <span>
                    {t('settings_modal.active_theme')}:{' '}
                    <strong className="text-white font-mono px-1.5 py-0.5 rounded bg-white/10">
                      {currentThemeName}
                    </strong>
                  </span>
                }
              >
                <button
                  type="button"
                  onClick={onOpenThemes}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-white/10 flex items-center gap-2 shrink-0 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>{t('topbar.themes')}</span>
                </button>
              </SettingRow>

              <SettingRow
                icon={<Sparkles className="w-4 h-4" />}
                title={t('general_settings.smooth_animations_title')}
                description={t('general_settings.smooth_animations_desc')}
              >
                <ToggleSwitch
                  checked={animationsEnabled}
                  onChange={handleToggleAnimations}
                  ariaLabel={t('general_settings.smooth_animations_title')}
                />
              </SettingRow>

              <SettingRow
                icon={<RefreshCw className="w-4 h-4" />}
                title={t('onboarding.auto_scan_label')}
                description={t('onboarding.auto_scan_desc')}
              >
                <ToggleSwitch
                  checked={autoScanOnStartup}
                  onChange={handleToggleAutoScan}
                  ariaLabel={t('onboarding.auto_scan_label')}
                />
              </SettingRow>
            </SettingGroup>

            <div
              className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent-primary)' }} />
              <div className="leading-relaxed text-slate-300">
                {t('general_settings.themes_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB: GIOCHI RECENTI */}
        {activeSubTab === 'recent' && (
          <div className="space-y-6">
            <SettingGroup
              title={t('sidebar.recent')}
              description={t('general_settings.recent_group_desc', {
                defaultValue: 'Configure the recent games shelf and filter behavior.',
              })}
              icon={<Clock className="w-4 h-4" />}
            >
              <SettingRow
                icon={<Clock className="w-4 h-4" />}
                title={t('general_settings.recent_max_title', {
                  defaultValue: 'Maximum Recent Games',
                })}
                description={t('general_settings.recent_max_desc', {
                  defaultValue: 'Limit the number of recent titles displayed in your library shelf.',
                })}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={recentSettings.maxCount}
                    onChange={(e) => handleMaxRecentChange(Number(e.target.value))}
                    className="w-28 sm:w-36 accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <span className="w-8 text-right font-mono font-bold text-xs text-slate-200">
                    {recentSettings.maxCount}
                  </span>
                </div>
              </SettingRow>

              <SettingRow
                icon={<Clock className="w-4 h-4" />}
                title={t('general_settings.recent_window_title', {
                  defaultValue: 'Activity Time Window',
                })}
                description={t('general_settings.recent_window_desc', {
                  defaultValue: 'Only consider games played within this timeframe as recent.',
                })}
              >
                <select
                  value={recentSettings.timeWindowDays}
                  onChange={(e) => handleTimeWindowChange(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-[var(--accent-primary)] cursor-pointer"
                >
                  <option value={0} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_always', { defaultValue: 'Always (all played titles)' })}
                  </option>
                  <option value={7} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_7d', { defaultValue: 'Past 7 days' })}
                  </option>
                  <option value={14} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_14d', { defaultValue: 'Past 2 weeks' })}
                  </option>
                  <option value={30} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_30d', { defaultValue: 'Past 30 days' })}
                  </option>
                  <option value={60} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_60d', { defaultValue: 'Past 60 days' })}
                  </option>
                  <option value={90} className="bg-slate-900 text-white">
                    {t('general_settings.recent_window_90d', { defaultValue: 'Past 90 days' })}
                  </option>
                </select>
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB: DATI & BACKUP */}
        {activeSubTab === 'data' && (
          <div className="space-y-6">
            <BackupSettingsTab onClose={onClose} />

            <SettingGroup
              title={t('general_settings.playnite_card_title') || 'Importazione Backup Playnite'}
              description={t('general_settings.playnite_card_desc') || 'Arricchisci la tua libreria importando statistiche, ore di gioco e cover da un backup Playnite (.zip)'}
              icon={<FolderArchive className="w-4 h-4" />}
            >
              <SettingRow
                icon={<FolderArchive className="w-4 h-4" />}
                title={t('general_settings.playnite_card_title') || 'Importazione Backup Playnite'}
                description={t('general_settings.playnite_card_desc')}
                badge={
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold border"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                      borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    Beta
                  </span>
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    onOpenPlayniteImport?.();
                  }}
                  className="px-4 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer hover:brightness-110 active:opacity-90"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 4px 14px var(--accent-glow)',
                  }}
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  <span>{t('general_settings.playnite_card_btn') || 'Importa Backup...'}</span>
                </button>
              </SettingRow>
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB 5: AGGIORNAMENTI */}
        {activeSubTab === 'updates' && (
          <div className="space-y-4">
            <SettingGroup
              title={t('general_settings.tab_updates')}
              description={t('general_settings.updater_desc')}
              icon={<RefreshCw className="w-4 h-4" />}
            >
              {updater && (
                <>
                  <SettingRow
                    icon={<Sparkles className="w-4 h-4" />}
                    title={t('general_settings.updater_title')}
                    description={t('general_settings.updater_desc')}
                    badge={
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-white/10 text-white">
                        v{updater.currentVersion}
                      </span>
                    }
                  >
                    {updater.status !== 'readyToInstall' && updater.status !== 'downloading' && (
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          if (updater.status === 'available') {
                            updater.downloadAndInstall();
                          } else {
                            updater.checkForUpdates(false);
                          }
                        }}
                        disabled={updater.status === 'checking'}
                        className="px-3.5 py-1.5 rounded-xl text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:brightness-110 active:opacity-90"
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 2px 8px var(--accent-glow)',
                        }}
                      >
                        {updater.status === 'checking' && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>
                          {updater.status === 'checking'
                            ? t('general_settings.updater_checking')
                            : updater.status === 'available'
                            ? t('general_settings.updater_download_button')
                            : t('general_settings.updater_check_button')}
                        </span>
                      </button>
                    )}
                  </SettingRow>

                  {updater.status === 'available' && (
                    <div className="p-4 space-y-2 bg-white/[0.01]">
                      <div className="font-bold text-xs flex items-center gap-2" style={{ color: 'var(--accent-primary)' }}>
                        <ArrowDownCircle className="w-4 h-4" />
                        <span>
                          {t('general_settings.updater_available')} {updater.availableVersion ? `(v${updater.availableVersion})` : ''}
                        </span>
                      </div>
                      {updater.releaseNotes && (
                        <p className="text-slate-300 whitespace-pre-line text-[11px] leading-relaxed max-h-40 overflow-y-auto custom-scrollbar p-3 rounded-xl bg-black/20 border border-white/5">
                          {updater.releaseNotes}
                        </p>
                      )}
                    </div>
                  )}

                  {updater.status === 'downloading' && updater.progress && (
                    <div className="p-4 space-y-2 bg-white/[0.01]">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{t('general_settings.updater_downloading')}</span>
                        <span className="font-mono">
                          {updater.progress.percentage}%
                          {updater.progress.totalBytes > 0 && (
                            <span className="ml-2 text-slate-500">
                              ({(updater.progress.downloadedBytes / (1024 * 1024)).toFixed(1)} MB / {(updater.progress.totalBytes / (1024 * 1024)).toFixed(1)} MB)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full transition-all duration-200"
                          style={{
                            width: `${updater.progress.percentage}%`,
                            backgroundColor: 'var(--accent-primary)',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {updater.status === 'readyToInstall' && (
                    <div className="p-4 space-y-3 bg-white/[0.01]">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                        <Check className="w-4 h-4 shrink-0" />
                        <span>{t('general_settings.updater_ready_to_install')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          soundEffects.playSelect();
                          updater.relaunch();
                        }}
                        className="w-full py-2 rounded-xl text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer hover:brightness-110 active:opacity-90"
                        style={{
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 4px 14px var(--accent-glow)',
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t('general_settings.updater_relaunch_button')}</span>
                      </button>
                    </div>
                  )}

                  {updater.status === 'upToDate' && (
                    <div className="p-3.5 flex items-center gap-2 text-xs text-slate-300">
                      <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                      <span>{t('general_settings.updater_up_to_date')}</span>
                    </div>
                  )}

                  {updater.status === 'error' && (
                    <div className="p-3.5 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{updater.errorMessage || t('general_settings.updater_error')}</span>
                    </div>
                  )}
                </>
              )}
            </SettingGroup>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('general_settings.reset_defaults')}</span>
        </button>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span
              className="flex items-center gap-1.5 text-xs font-bold animate-in fade-in duration-200"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('general_settings.saved')}</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-primary)',
              boxShadow: '0 4px 14px var(--accent-glow)',
            }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('common.save')}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GeneralSettingsTab;
