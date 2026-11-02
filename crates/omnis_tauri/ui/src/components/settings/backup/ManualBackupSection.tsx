import React from 'react';
import { Archive, FolderOpen, Loader2, FileCheck, Check } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { soundEffects } from '../../../utils/soundEffects';
import type { BackupResultDto } from '../../../types';

interface ManualBackupSectionProps {
  selectedDestination: string;
  includeArtwork: boolean;
  setIncludeArtwork: (val: boolean) => void;
  isCreatingBackup: boolean;
  lastBackupResult: BackupResultDto | null;
  onPickDestinationFolder: () => void;
  onCreateBackup: () => void;
  formatDate: (isoDate?: string | null) => string;
}

export const ManualBackupSection: React.FC<ManualBackupSectionProps> = ({
  selectedDestination,
  includeArtwork,
  setIncludeArtwork,
  isCreatingBackup,
  lastBackupResult,
  onPickDestinationFolder,
  onCreateBackup,
  formatDate,
}) => {
  const { t } = useTranslation();

  return (
    <section
      className="p-6 rounded-3xl border shadow-xl space-y-6 transition-all"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-color)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 shadow-md">
            <Archive className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>{t('backup_settings.create_card_title') || 'Crea Backup Libreria (.zip)'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
              {t('backup_settings.create_card_desc') ||
                'Esporta un archivio .zip contenente il database della tua libreria, le impostazioni utente, i temi personalizzati e la cronologia sessioni. Le credenziali e i token rimangono al sicuro sulla macchina.'}
            </p>
          </div>
        </div>
      </div>

      {/* FOLDER SELECTION */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-300 block">
          {t('backup_settings.destination_folder_label') || 'Cartella di Destinazione:'}
        </label>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 px-4 py-2.5 rounded-xl border text-xs font-mono text-slate-200 truncate select-all"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
            title={selectedDestination || ''}
          >
            {selectedDestination ||
              t('backup_settings.destination_folder_placeholder') ||
              'Nessuna cartella selezionata (fai clic su Scegli cartella per selezionare dove salvare)...'}
          </div>
          <button
            type="button"
            onClick={onPickDestinationFolder}
            className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer hover:border-white/30 active:scale-95"
          >
            <FolderOpen className="w-4 h-4 text-sky-400" />
            <span>{t('backup_settings.btn_choose_folder') || 'Scegli cartella...'}</span>
          </button>
        </div>
      </div>

      {/* OPTIONS: ARTWORK INCLUSION */}
      <div className="pt-2 flex items-center justify-between border-t border-white/5">
        <div className="flex items-center gap-3">
          <input
            id="includeArtworkCheckbox"
            type="checkbox"
            checked={includeArtwork}
            onChange={(e) => {
              soundEffects.playSelect();
              setIncludeArtwork(e.target.checked);
            }}
            className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-white/20 focus:ring-sky-500 cursor-pointer"
          />
          <label htmlFor="includeArtworkCheckbox" className="text-xs text-slate-300 cursor-pointer select-none">
            <span className="font-bold text-white">
              {t('backup_settings.include_artwork_title') || 'Includi copertine e sfondi in cache'}
            </span>
            <span className="block text-[11px] text-slate-400">
              {t('backup_settings.include_artwork_desc') ||
                'Inclusione completa di tutte le immagini della cache locale nel file .zip.'}
            </span>
          </label>
        </div>

        {/* BACKUP BUTTON */}
        <button
          type="button"
          disabled={isCreatingBackup}
          onClick={onCreateBackup}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg cursor-pointer ${
            isCreatingBackup
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              : 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/20 hover:scale-[1.02] active:scale-95'
          }`}
        >
          {isCreatingBackup ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>{t('backup_settings.creating_backup') || 'Creazione in corso...'}</span>
            </>
          ) : (
            <>
              <FileCheck className="w-4 h-4" />
              <span>{t('backup_settings.btn_create_backup') || 'Crea Backup (.zip)'}</span>
            </>
          )}
        </button>
      </div>

      {/* LAST BACKUP SUMMARY BANNER */}
      {lastBackupResult && (
        <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 flex items-center justify-between text-xs text-sky-200">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-sky-400" />
            <span>
              {t('backup_settings.last_backup_prefix') || 'Ultimo backup:'}{' '}
              <strong>
                {lastBackupResult.total_games} {t('backup_settings.games_saved_label') || 'giochi'}
              </strong>{' '}
              salvati alle {formatDate(lastBackupResult.timestamp)}
            </span>
          </div>
          <span className="text-[11px] text-sky-300/80 font-mono">
            {(lastBackupResult.file_size_bytes / (1024 * 1024)).toFixed(2)} MB
          </span>
        </div>
      )}
    </section>
  );
};
