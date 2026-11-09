import React, { useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { Settings } from 'lucide-react';
import { useUpdater } from '../../hooks/useAppUpdater';
import {
  SettingsTab,
  useSettingsNavigation,
  SettingsSidebar,
  SettingsContentPanel,
} from './tree';

export type { SettingsTab };

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
  const updater = useUpdater();

  const {
    activeTab,
    searchQuery,
    setSearchQuery,
    expandedGroups,
    toggleGroup,
    handleSelectTab,
    handleClose,
    filteredGroups,
    activeGroup,
    activeItem,
  } = useSettingsNavigation({
    isOpen,
    initialTab,
    onSyncComplete,
    onClose,
  });

  // Handle ESC key for search clearing or modal closing
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery.trim().length > 0) {
          setSearchQuery('');
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchQuery, handleClose, setSearchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-5xl w-full rounded-3xl border shadow-2xl h-[780px] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* MODAL TOP HEADER */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0 bg-black/25"
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
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)',
            }}
            title="Chiudi (Esc)"
          >
            ✕
          </button>
        </div>

        {/* MASTER-DETAIL BODY */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* LEFT SIDEBAR: SEARCH & TREE NAVIGATION */}
          <SettingsSidebar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredGroups={filteredGroups}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            currentVersion={updater?.currentVersion || '1.0'}
          />

          {/* RIGHT DETAIL CONTENT PANEL */}
          <div className="flex-1 min-w-0 flex flex-col bg-transparent overflow-hidden">
            {/* Top Breadcrumb Bar */}
            <div
              className="flex items-center justify-between px-6 py-3 border-b shrink-0 bg-black/15"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">{activeGroup?.label}</span>
                <span className="text-slate-600">/</span>
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span style={{ color: 'var(--accent-primary)' }}>
                    {activeItem?.icon('w-3.5 h-3.5')}
                  </span>
                  {activeItem?.label}
                </span>
              </div>
            </div>

            {/* TAB CONTENT SECTIONS */}
            <SettingsContentPanel
              activeTab={activeTab}
              handleClose={handleClose}
              onSyncComplete={onSyncComplete}
              soundEnabled={soundEnabled}
              onToggleSound={onToggleSound}
              onOpenThemes={onOpenThemes}
              currentThemeName={currentThemeName}
              onOpenPlayniteImport={onOpenPlayniteImport}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
