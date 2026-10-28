import React, { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';
import { Settings, Sliders, Cloud, Trophy } from 'lucide-react';
import { soundEffects } from '../utils/soundEffects';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { StoreAccountsTab } from './StoreAccountsTab';
import { AchievementsSettingsTab } from './achievements';

export type SettingsTab = 'general' | 'accounts' | 'achievements';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
  initialTab?: SettingsTab;
  onSyncComplete?: () => void;
  onOpenPlayniteImport?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
  initialTab = 'general',
  onSyncComplete,
  onOpenPlayniteImport,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleClose = () => {
    soundEffects.playSelect();
    if (onSyncComplete) onSyncComplete();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-4xl w-full rounded-3xl border shadow-2xl h-[720px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* Header */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0"
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
            onClick={handleClose}
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90 cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)',
            }}
          >
            ✕
          </button>
        </div>

        {/* PRIMARY TAB NAVIGATION */}
        <div className="px-6 pt-3 pb-2 shrink-0">
          <div
            className="flex items-center gap-2 p-1 rounded-2xl border"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setActiveTab('general');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'general'
                ? 'text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              style={{
                backgroundColor: activeTab === 'general' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              <Sliders className="w-4 h-4" />
              <span>{t('settings_modal.tab_general')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setActiveTab('accounts');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'accounts'
                ? 'text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              style={{
                backgroundColor: activeTab === 'accounts' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              <Cloud className="w-4 h-4" />
              <span>{t('settings_modal.tab_accounts')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEffects.playSelect();
                setActiveTab('achievements');
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'achievements'
                ? 'text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              style={{
                backgroundColor: activeTab === 'achievements' ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              <Trophy className="w-4 h-4" />
              <span>{t('settings_modal.tab_achievements')}</span>
            </button>
          </div>
        </div>

        {/* ACTIVE TAB BODY */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* TAB 1: GENERALE */}
          {activeTab === 'general' && (
            <GeneralSettingsTab
              onClose={handleClose}
              soundEnabled={soundEnabled}
              onToggleSound={onToggleSound}
              onOpenThemes={() => {
                onClose();
                onOpenThemes();
              }}
              currentThemeName={currentThemeName}
              onOpenPlayniteImport={() => {
                onClose();
                onOpenPlayniteImport?.();
              }}
            />
          )}

          {/* TAB 2: ACCOUNT STORE CLOUD */}
          {activeTab === 'accounts' && (
            <StoreAccountsTab
              onSyncComplete={onSyncComplete}
              onClose={handleClose}
            />
          )}

          {/* TAB 3: OBIETTIVI */}
          {activeTab === 'achievements' && (
            <AchievementsSettingsTab onClose={handleClose} />
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
