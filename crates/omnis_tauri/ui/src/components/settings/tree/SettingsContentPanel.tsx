import React from 'react';
import { useTranslation } from '../../../i18n';
import { FolderArchive } from 'lucide-react';
import { soundEffects } from '../../../utils/soundEffects';
import { GeneralSettingsTab } from '../GeneralSettingsTab';
import { StoreAccountsTab } from '../StoreAccountsTab';
import { EmulatorsSettingsTab } from '../EmulatorsSettingsTab';
import { MetadataSettingsTab } from '../MetadataSettingsTab';
import { AchievementsSettingsTab } from '../../achievements';
import { BackupSettingsTab } from '../BackupSettingsTab';
import { DuplicateHiderSettingsTab } from '../DuplicateHiderSettingsTab';
import { SettingsTab } from './settingsTreeConfig';

export interface SettingsContentPanelProps {
  activeTab: SettingsTab;
  handleClose: () => void;
  onSyncComplete?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
  onOpenPlayniteImport?: () => void;
}

export const SettingsContentPanel: React.FC<SettingsContentPanelProps> = ({
  activeTab,
  handleClose,
  onSyncComplete,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
  onOpenPlayniteImport,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
      {/* SECTION: GENERALE */}
      {activeTab.startsWith('general-') && (
        <GeneralSettingsTab
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          onOpenThemes={onOpenThemes}
          currentThemeName={currentThemeName}
          activeSubTab={
            activeTab === 'general-language'
              ? 'language'
              : activeTab === 'general-audio'
              ? 'audio'
              : activeTab === 'general-window'
              ? 'window'
              : activeTab === 'general-appearance'
              ? 'appearance'
              : activeTab === 'general-recent'
              ? 'recent'
              : activeTab === 'general-updates'
              ? 'updates'
              : 'language'
          }
          hideSubTabBar={true}
        />
      )}

      {/* SECTION: STORE & ACCOUNTS */}
      {activeTab.startsWith('store-') && (
        <StoreAccountsTab
          onSyncComplete={onSyncComplete}
          onClose={handleClose}
          selectedStoreId={activeTab.replace('store-', '')}
          hideTabBar={true}
        />
      )}

      {/* SECTION: EMULATORI */}
      {activeTab.startsWith('emulators-') && (
        <EmulatorsSettingsTab onSyncComplete={onSyncComplete} />
      )}

      {/* SECTION: METADATI & PROVIDER */}
      {activeTab.startsWith('metadata-') && (
        <MetadataSettingsTab
          activeSubTab={
            activeTab === 'metadata-igdb'
              ? 'igdb'
              : activeTab === 'metadata-steamgriddb'
              ? 'steamgriddb'
              : activeTab === 'metadata-opencritic'
              ? 'opencritic'
              : activeTab === 'metadata-hltb'
              ? 'hltb'
              : 'pipeline'
          }
          onClose={handleClose}
          onSyncComplete={onSyncComplete}
          hideTabBar={true}
        />
      )}

      {/* SECTION: OBIETTIVI (ACHIEVEMENTS) */}
      {activeTab.startsWith('achievements-') && (
        <AchievementsSettingsTab
          onClose={handleClose}
          activeSubTab={
            activeTab === 'achievements-sources'
              ? 'sources'
              : activeTab === 'achievements-view'
              ? 'view'
              : activeTab === 'achievements-appearance'
              ? 'appearance'
              : activeTab === 'achievements-misc'
              ? 'misc'
              : activeTab === 'achievements-ignored'
              ? 'ignored'
              : 'sources'
          }
          hideTabBar={true}
        />
      )}

      {/* SECTION: GESTIONE DUPLICATI (DUPLICATE HIDER) */}
      {activeTab.startsWith('duplicates-') && (
        <DuplicateHiderSettingsTab
          onClose={handleClose}
          onSyncComplete={onSyncComplete}
          activeSubTab={
            activeTab === 'duplicates-priorities'
              ? 'priorities'
              : activeTab === 'duplicates-rules'
              ? 'rules'
              : activeTab === 'duplicates-ignored'
              ? 'ignored'
              : 'priorities'
          }
          hideSubTabBar={true}
        />
      )}

      {/* SECTION: DATI & BACKUP - CREA BACKUP MANUALE */}
      {activeTab === 'backup-manual' && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <BackupSettingsTab
            activeSection="manual"
            onClose={handleClose}
            onRestoreComplete={() => {
              handleClose();
              if (onSyncComplete) onSyncComplete();
            }}
          />
        </div>
      )}

      {/* SECTION: DATI & BACKUP - BACKUP AUTOMATICO & SCHEDULAZIONE */}
      {activeTab === 'backup-schedule' && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <BackupSettingsTab
            activeSection="schedule"
            onClose={handleClose}
            onRestoreComplete={() => {
              handleClose();
              if (onSyncComplete) onSyncComplete();
            }}
          />
        </div>
      )}

      {/* SECTION: DATI & BACKUP - RIPRISTINO */}
      {(activeTab === 'backup-restore' || activeTab === 'backup-manager') && (
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <BackupSettingsTab
            activeSection={activeTab === 'backup-manager' ? 'all' : 'restore'}
            onClose={handleClose}
            onRestoreComplete={() => {
              handleClose();
              if (onSyncComplete) onSyncComplete();
            }}
          />
        </div>
      )}

      {/* SECTION: DATI & BACKUP - PLAYNITE IMPORT */}
      {activeTab === 'backup-playnite' && (
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <div
            className="p-6 rounded-2xl border space-y-4"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl border flex items-center justify-center"
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                    borderColor:
                      'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    {t('general_settings.playnite_card_title') ||
                      'Importazione Backup Playnite'}
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold border"
                      style={{
                        backgroundColor:
                          'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                        borderColor:
                          'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      Beta
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('general_settings.playnite_card_desc') ||
                      'Arricchisci la tua libreria importando statistiche, ore di gioco e cover da un archivio Playnite (.zip)'}
                  </p>
                </div>
              </div>

              {onOpenPlayniteImport && (
                <button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    handleClose();
                    onOpenPlayniteImport();
                  }}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-2 cursor-pointer font-sans hover:brightness-110 active:scale-95"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 4px 14px var(--accent-glow)',
                  }}
                >
                  <FolderArchive className="w-4 h-4" />
                  <span>
                    {t('general_settings.playnite_card_btn') ||
                      'Avvia Importazione...'}
                  </span>
                </button>
              )}
            </div>

            <div className="border-t border-white/5 pt-4 text-xs text-slate-400 space-y-2">
              <p className="font-semibold text-slate-300">Cosa viene importato:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>Catalogo giochi e categorie personalizzate</li>
                <li>Ore di gioco accumulate e data ultimo avvio</li>
                <li>Copertine, loghi e sfondi locali associati ai titoli</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
