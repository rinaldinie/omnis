import React from 'react';
import { useTranslation, SUPPORTED_LOCALES, LocaleCode } from '../i18n';
import { Settings, Globe, Volume2, VolumeX, Check, Info, Palette } from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
}) => {
  const { locale, setLocale, t } = useTranslation();

  if (!isOpen) return null;

  const handleSelectLanguage = (code: LocaleCode) => {
    soundEffects.playSelect();
    setLocale(code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-xl w-full rounded-3xl border p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center pb-4 border-b"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-md"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{t('settings_modal.title')}</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings_modal.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)',
            }}
          >
            ✕
          </button>
        </div>

        {/* SECTION 1: LANGUAGE SELECTION */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Globe className="w-4 h-4 text-sky-400" />
            <span>{t('settings_modal.language_section')}</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('settings_modal.select_language')}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            {SUPPORTED_LOCALES.map((loc) => {
              const isSelected = locale === loc.code;
              return (
                <button
                  key={loc.code}
                  type="button"
                  onClick={() => handleSelectLanguage(loc.code)}
                  className={`flex items-center justify-between p-3 rounded-2xl border text-left transition-all ${
                    isSelected
                      ? 'ring-2 shadow-lg'
                      : 'hover:bg-white/5 hover:border-slate-500 opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: isSelected ? 'var(--bg-card)' : 'transparent',
                    borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-color)',
                    boxShadow: isSelected ? '0 0 15px var(--accent-glow)' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl leading-none">{loc.flag}</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-black text-white leading-tight">
                        {loc.nativeName}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {loc.name}
                      </span>
                    </div>
                  </div>
                  {isSelected && (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* SECTION 2: AUDIO & SOUND EFFECTS */}
        <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )}
                <span>{t('settings_modal.sound_effects')}</span>
              </div>
              <p className="text-xs max-w-sm" style={{ color: 'var(--text-muted)' }}>
                {t('settings_modal.sound_effects_desc')}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleSound}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                soundEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
              }`}
            >
              {soundEnabled ? t('common.enabled') : t('common.disabled')}
            </button>
          </div>
        </div>

        {/* SECTION 3: THEME SHORTCUT */}
        <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Palette className="w-4 h-4 text-indigo-400" />
                <span>{t('settings_modal.theme_section')}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings_modal.active_theme')}: <strong className="text-white">{currentThemeName}</strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenThemes();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold border transition-all hover:bg-white/10"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {t('topbar.themes')}
            </button>
          </div>
        </div>

        {/* FOOTER: VERSION & CLOSE */}
        <div
          className="flex items-center justify-between pt-4 border-t"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Info className="w-3.5 h-3.5" />
            <span>{t('settings_modal.version_info')}: v0.1.0</span>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
