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
  Sliders,
  Sparkles,
  Info,
  Monitor,
  Bell,
  ShieldCheck,
  SlidersHorizontal,
  RefreshCw,
  ArrowDownCircle,
  AlertCircle,
} from 'lucide-react';
import { useTranslation, SUPPORTED_LOCALES, LocaleCode } from '../i18n';
import soundEffects from '../utils/soundEffects';
import { useUpdater } from '../hooks/useAppUpdater';

type GeneralSubTab = 'language' | 'audio' | 'window' | 'appearance';

interface GeneralSettingsTabProps {
  onClose?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
}) => {
  const { locale, setLocale, t } = useTranslation();
  const updater = useUpdater();
  const [activeSubTab, setActiveSubTab] = useState<GeneralSubTab>('language');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => {
    const saved = localStorage.getItem('omnis_minimize_to_tray');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [animationsEnabled, setAnimationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('omnis_ui_animations');
    return saved !== null ? JSON.parse(saved) : true;
  });

  const handleToggleMinimizeToTray = async () => {
    soundEffects.playSelect();
    const next = !minimizeToTray;
    setMinimizeToTray(next);
    localStorage.setItem('omnis_minimize_to_tray', JSON.stringify(next));
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_minimize_to_tray', { enabled: next });
      }
    } catch (e) {
      console.warn('Failed to update minimize_to_tray:', e);
    }
  };

  const handleToggleAnimations = () => {
    soundEffects.playSelect();
    const next = !animationsEnabled;
    setAnimationsEnabled(next);
    localStorage.setItem('omnis_ui_animations', JSON.stringify(next));
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
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_minimize_to_tray', { enabled: true });
      }
    } catch (e) {
      console.warn('Failed to reset minimize_to_tray:', e);
    }
    setAnimationsEnabled(true);
    localStorage.setItem('omnis_ui_animations', JSON.stringify(true));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {/* Sub-tab Navigation matching settings_01.jpg layout */}
      <div
        className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab('language');
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === 'language'
              ? 'text-sky-400 bg-sky-500/10 shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{t('general_settings.tab_language')}</span>
          {activeSubTab === 'language' && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab('audio');
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === 'audio'
              ? 'text-sky-400 bg-sky-500/10 shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>{t('general_settings.tab_audio')}</span>
          {activeSubTab === 'audio' && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab('window');
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === 'window'
              ? 'text-sky-400 bg-sky-500/10 shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>{t('general_settings.tab_window')}</span>
          {activeSubTab === 'window' && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            soundEffects.playNav();
            setActiveSubTab('appearance');
          }}
          className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative flex items-center gap-2 ${
            activeSubTab === 'appearance'
              ? 'text-sky-400 bg-sky-500/10 shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>{t('general_settings.tab_appearance')}</span>
          {activeSubTab === 'appearance' && (
            <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-sky-400 rounded-full" />
          )}
        </button>
      </div>

      {/* Main SubTab Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* SUBTAB 1: LINGUA */}
        {activeSubTab === 'language' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
              <Globe className="w-4 h-4 text-sky-400" />
              <span>{t('settings_modal.language_section')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('settings_modal.select_language')}.{' '}
              {t('general_settings.language_immediate_note')}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
              {SUPPORTED_LOCALES.map((loc) => {
                const isSelected = locale === loc.code;
                return (
                  <button
                    key={loc.code}
                    type="button"
                    onClick={() => handleSelectLanguage(loc.code)}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'ring-2 shadow-lg bg-sky-500/10 border-sky-400'
                        : 'bg-white/[0.02] border-white/10 hover:bg-white/5 hover:border-slate-500 opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      borderColor: isSelected ? 'var(--accent-primary)' : undefined,
                      boxShadow: isSelected ? '0 0 15px var(--accent-glow)' : undefined,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl leading-none">{loc.flag}</span>
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-white leading-tight">
                          {loc.nativeName}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {loc.name}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-300 flex items-start gap-3 text-xs mt-4">
              <Info className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
              <div className="leading-relaxed">
                {t('general_settings.achievements_lang_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: AUDIO & SUONI */}
        {activeSubTab === 'audio' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              <span>
                {t('general_settings.audio_cues_title')}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('general_settings.audio_cues_desc')}
            </p>

            {/* Audio Toggle Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  {soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-400" />
                  )}
                  <span>{t('settings_modal.sound_effects')}</span>
                </div>
                <p className="text-xs text-slate-400 max-w-md">
                  {t('settings_modal.sound_effects_desc')}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleSound}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                  soundEnabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-md'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
              >
                {soundEnabled ? t('common.enabled') : t('common.disabled')}
              </button>
            </div>

            {/* Interactive Sound Preview Box */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {t('general_settings.sound_test_title')}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {t('general_settings.sound_test_desc')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!soundEnabled}
                  onClick={() => soundEffects.playSelect()}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Play className="w-3 h-3 text-indigo-400" />
                  <span>{t('general_settings.sound_select')}</span>
                </button>

                <button
                  type="button"
                  disabled={!soundEnabled}
                  onClick={() => soundEffects.playNav()}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Play className="w-3 h-3 text-sky-400" />
                  <span>{t('general_settings.sound_nav')}</span>
                </button>

                <button
                  type="button"
                  disabled={!soundEnabled}
                  onClick={() => soundEffects.playLaunch()}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-slate-200 transition-all disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Play className="w-3 h-3 text-emerald-400" />
                  <span>{t('general_settings.sound_launch')}</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 flex items-start gap-3 text-xs">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="leading-relaxed">
                {t('general_settings.audio_gaming_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: FINESTRA & TRAY */}
        {activeSubTab === 'window' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
              <Minimize2 className="w-4 h-4 text-cyan-400" />
              <span>{t('settings_modal.tray_section')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('general_settings.tray_config_desc')}
            </p>

            {/* Tray Toggle Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Minimize2 className="w-4 h-4 text-cyan-400" />
                  <span>{t('settings_modal.minimize_to_tray')}</span>
                </div>
                <p className="text-xs text-slate-400 max-w-md">
                  {t('settings_modal.minimize_to_tray_desc')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleMinimizeToTray}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                  minimizeToTray
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30 shadow-md'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
              >
                {minimizeToTray ? t('common.enabled') : t('common.disabled')}
              </button>
            </div>

            {/* Process Engine Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Monitor className="w-4 h-4 text-indigo-400" />
                <span>
                  {t('general_settings.process_engine_title')}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('general_settings.process_engine_desc')}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-cyan-500/20 bg-cyan-500/5 text-cyan-300 flex items-start gap-3 text-xs">
              <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
              <div className="leading-relaxed">
                {t('general_settings.fullscreen_shortcut_note') || t('general_settings.big_picture_shortcut_note')}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: ASPETTO & TEMI */}
        {activeSubTab === 'appearance' && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-black tracking-wider uppercase text-slate-300">
              <Palette className="w-4 h-4 text-purple-400" />
              <span>{t('settings_modal.theme_section')}</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {t('general_settings.appearance_desc')}
            </p>

            {/* Active Theme Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Palette className="w-4 h-4 text-purple-400" />
                  <span>
                    {t('general_settings.active_theme_label')}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {t('settings_modal.active_theme')}: <strong className="text-white font-mono px-2 py-0.5 rounded bg-white/10">{currentThemeName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenThemes}
                className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-white/10 flex items-center gap-2 shrink-0"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{t('topbar.themes')}</span>
              </button>
            </div>

            {/* Animations Toggle Card */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>
                    {t('general_settings.smooth_animations_title')}
                  </span>
                </div>
                <p className="text-xs text-slate-400 max-w-md">
                  {t('general_settings.smooth_animations_desc')}
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleAnimations}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                  animationsEnabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-md'
                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                }`}
              >
                {animationsEnabled ? t('common.enabled') : t('common.disabled')}
              </button>
            </div>

            <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 text-purple-300 flex items-start gap-3 text-xs">
              <Info className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
              <div className="leading-relaxed">
                {t('general_settings.themes_note')}
              </div>
            </div>
          </div>
        )}

        {/* UPDATER & VERSION CARD */}
        {updater && (
          <div className="p-5 rounded-2xl border border-white/10 bg-slate-800/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">{t('general_settings.updater_title')}</h4>
                  <p className="text-xs text-slate-400">{t('general_settings.updater_desc')}</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-white/10 text-white">
                v{updater.currentVersion}
              </span>
            </div>

            {updater.status === 'available' && (
              <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-200 text-xs space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <ArrowDownCircle className="w-4 h-4 text-sky-400" />
                  <span>
                    {t('general_settings.updater_available')} {updater.availableVersion ? `(v${updater.availableVersion})` : ''}
                  </span>
                </div>
                {updater.releaseNotes && (
                  <p className="text-slate-300 whitespace-pre-line text-[11px] leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                    {updater.releaseNotes}
                  </p>
                )}
              </div>
            )}

            {updater.status === 'downloading' && updater.progress && (
              <div className="space-y-1.5">
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
                <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-sky-500 transition-all duration-200"
                    style={{ width: `${updater.progress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {updater.status === 'readyToInstall' && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t('general_settings.updater_ready_to_install')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    updater.relaunch();
                  }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t('general_settings.updater_relaunch_button')}</span>
                </button>
              </div>
            )}

            {updater.status === 'upToDate' && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{t('general_settings.updater_up_to_date')}</span>
              </div>
            )}

            {updater.status === 'error' && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{updater.errorMessage || t('general_settings.updater_error')}</span>
              </div>
            )}

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
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {updater.status === 'checking' && <RefreshCw className="w-4 h-4 animate-spin" />}
                <span>
                  {updater.status === 'checking'
                    ? t('general_settings.updater_checking')
                    : updater.status === 'available'
                    ? t('general_settings.updater_download_button')
                    : t('general_settings.updater_check_button')}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions exactly matching settings_01.jpg layout */}
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
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 animate-in fade-in duration-200">
              <Check className="w-3.5 h-3.5" />
              <span>{t('general_settings.saved')}</span>
            </span>
          )}

          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)' }}
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
