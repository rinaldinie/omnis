import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FolderArchive,
  FileCheck,
  Check,
  Layers,
  Image as ImageIcon,
  RotateCcw,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from '../i18n';
import soundEffects from '../utils/soundEffects';
import { BackupResultDto, BackupInspectionDto } from '../types';

interface BackupSettingsTabProps {
  onClose?: () => void;
  onRestoreComplete?: () => void;
}

export const BackupSettingsTab: React.FC<BackupSettingsTabProps> = ({
  onClose,
  onRestoreComplete,
}) => {
  const { t } = useTranslation();

  // Backup creation state
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [includeArtwork, setIncludeArtwork] = useState<boolean>(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [lastBackupResult, setLastBackupResult] = useState<BackupResultDto | null>(null);

  // Restore state
  const [isInspecting, setIsInspecting] = useState<boolean>(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<string | null>(null);
  const [inspection, setInspection] = useState<BackupInspectionDto | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Status and error messages
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Automatically dismiss toast after 6s
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Handle ESC key to close confirm modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isConfirmModalOpen && !isRestoring) {
        soundEffects.playSelect();
        setIsConfirmModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmModalOpen, isRestoring]);

  // Pick destination folder
  const handlePickDestinationFolder = useCallback(async (): Promise<string | null> => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const chosen = await invoke<string | null>('pick_backup_destination_folder');
      if (chosen) {
        setSelectedDestination(chosen);
      }
      return chosen;
    } catch (err) {
      console.error('Error picking destination folder:', err);
      setErrorMessage(String(err));
      return null;
    }
  }, []);

  // Create backup action
  const handleCreateBackup = async () => {
    let destDir = selectedDestination;
    if (!destDir) {
      const picked = await handlePickDestinationFolder();
      if (!picked) return;
      destDir = picked;
    }

    try {
      soundEffects.playSelect();
      setIsCreatingBackup(true);
      setErrorMessage(null);

      const result = await invoke<BackupResultDto>('create_backup', {
        destinationDir: destDir,
        includeArtwork,
      });

      setLastBackupResult(result);
      const sizeMb = (result.file_size_bytes / (1024 * 1024)).toFixed(1);
      const successTemplate = t('backup_settings.backup_created_success', {
        count: result.total_games,
        size: sizeMb,
        path: result.backup_path,
      });
      setToastMessage(
        successTemplate !== 'backup_settings.backup_created_success'
          ? successTemplate
          : `Backup .zip creato con successo (${result.total_games} giochi, ${sizeMb} MB)! Salvato in: ${result.backup_path}`
      );
    } catch (err) {
      console.error('Failed creating backup:', err);
      const errTemplate = t('backup_settings.err_create_failed', { error: String(err) });
      setErrorMessage(
        errTemplate !== 'backup_settings.err_create_failed'
          ? errTemplate
          : `Errore durante la creazione del backup: ${err}`
      );
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Pick file to restore and open inspection confirmation
  const handlePickFileToRestore = async () => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const file = await invoke<string | null>('pick_backup_file_to_restore');
      if (!file) return;

      setSelectedBackupFile(file);
      setIsInspecting(true);

      const inspectResult = await invoke<BackupInspectionDto>('inspect_backup', {
        backupFilePath: file,
      });

      setInspection(inspectResult);
      setIsConfirmModalOpen(true);
    } catch (err) {
      console.error('Failed inspecting backup:', err);
      const errTemplate = t('backup_settings.err_invalid_archive', { error: String(err) });
      setErrorMessage(
        errTemplate !== 'backup_settings.err_invalid_archive'
          ? errTemplate
          : `File .zip non valido o corrotto: ${err}`
      );
    } finally {
      setIsInspecting(false);
    }
  };

  // Confirm and execute restore
  const handleConfirmRestore = async () => {
    if (!selectedBackupFile) return;

    try {
      setIsRestoring(true);
      setErrorMessage(null);
      soundEffects.playSelect();

      await invoke<boolean>('restore_backup', {
        backupFilePath: selectedBackupFile,
      });

      setIsConfirmModalOpen(false);
      const successMsg =
        t('backup_settings.restore_success_msg') ||
        "Libreria ripristinata con successo! L'interfaccia si aggiornerà tra pochi istanti.";
      setToastMessage(successMsg);

      setTimeout(() => {
        if (onRestoreComplete) {
          onRestoreComplete();
        } else {
          window.location.reload();
        }
      }, 1500);
    } catch (err) {
      console.error('Failed restoring backup:', err);
      const errTemplate = t('backup_settings.err_restore_failed', { error: String(err) });
      setErrorMessage(
        errTemplate !== 'backup_settings.err_restore_failed'
          ? errTemplate
          : `Errore durante il ripristino del backup: ${err}`
      );
    } finally {
      setIsRestoring(false);
    }
  };

  // Helper to format date
  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-fade-in"
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-300 hover:text-white text-xs font-bold px-2 py-1 rounded cursor-pointer"
            aria-label="Chiudi notifica"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3 shadow-lg"
        >
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="font-medium">{errorMessage}</span>
        </div>
      )}

      {/* CARD 1: CREA BACKUP */}
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
              onClick={handlePickDestinationFolder}
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
            onClick={handleCreateBackup}
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

      {/* CARD 2: RIPRISTINA BACKUP */}
      <section
        className="p-6 rounded-3xl border shadow-xl space-y-6 transition-all"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0 shadow-md">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>{t('backup_settings.restore_card_title') || 'Ripristina Libreria da File (.zip)'}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                {t('backup_settings.restore_card_desc') ||
                  'Carica un archivio .zip di backup precedentemente creato per ripristinare il catalogo dei giochi, le categorie e le impostazioni.'}
              </p>
            </div>
          </div>
        </div>

        {/* SAFETY WARNING ALERT */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-300">
              {t('backup_settings.warning_title') || 'Sostituzione sicura dei dati correnti'}
            </p>
            <p className="text-amber-200/80 leading-relaxed text-[11px]">
              {t('backup_settings.warning_desc') ||
                'Il ripristino sostituirà il database attuale. Prima di procedere, Omnis crea automaticamente una copia di riserva preventiva (library.db.pre_restore_bak) per prevenire qualsiasi perdita accidentale.'}
            </p>
          </div>
        </div>

        {/* RESTORE TRIGGER BUTTON */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            disabled={isInspecting || isRestoring}
            onClick={handlePickFileToRestore}
            className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/20 flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95"
          >
            {isInspecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>{t('backup_settings.inspecting_archive') || 'Analisi archivio...'}</span>
              </>
            ) : (
              <>
                <FolderArchive className="w-4 h-4" />
                <span>
                  {t('backup_settings.btn_select_file') || 'Seleziona File di Ripristino (.zip)...'}
                </span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* CONFIRMATION RESTORE MODAL */}
      {isConfirmModalOpen && inspection && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-modal-title"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            className="relative max-w-lg w-full rounded-3xl border shadow-2xl p-6 space-y-6"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-color)',
            }}
          >
            <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--border-color)' }}>
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h4 id="restore-modal-title" className="text-base font-black text-white">
                  {t('backup_settings.confirm_modal_title') || 'Conferma Ripristino Backup (.zip)'}
                </h4>
                <p className="text-xs text-slate-400">
                  {t('backup_settings.confirm_modal_desc') ||
                    "Verifica i dati estratti dall'archivio prima di procedere"}
                </p>
              </div>
            </div>

            {/* INSPECTION DETAILS GRID */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/5 border border-white/10 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {t('backup_settings.details_date') || 'Data Creazione:'}
                </span>
                <span className="font-semibold text-white">{formatDate(inspection.created_at_utc)}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {t('backup_settings.details_version') || 'Versione Omnis:'}
                </span>
                <span className="font-semibold text-white">v{inspection.omnis_version}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {t('backup_settings.details_hostname') || 'Host di Origine:'}
                </span>
                <span className="font-semibold text-white">{inspection.hostname}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">
                  {t('backup_settings.details_games') || 'Giochi nel Backup:'}
                </span>
                <span className="font-bold text-sky-400 text-sm">{inspection.total_games}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-300">
                  {t('backup_settings.details_artwork') || 'Artwork:'}{' '}
                  <strong>
                    {inspection.has_artwork
                      ? t('backup_settings.details_artwork_included') || 'Inclusi'
                      : t('backup_settings.details_artwork_missing') || 'Assenti'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-300">
                  {t('backup_settings.details_themes') || 'Temi:'}{' '}
                  <strong>
                    {inspection.custom_themes_count}{' '}
                    {t('backup_settings.details_themes_custom') || 'personalizzati'}
                  </strong>
                </span>
              </div>
            </div>

            <p className="text-[11px] text-amber-300 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 leading-relaxed">
              {t('backup_settings.confirm_warning_note', { count: inspection.total_games }) ||
                `Cliccando su "Ripristina Ora", il database locale verrà sostituito con i ${inspection.total_games} giochi contenuti in questo backup.`}
            </p>

            {/* MODAL ACTIONS */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => {
                  soundEffects.playSelect();
                  setIsConfirmModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
              >
                {t('backup_settings.btn_cancel') || 'Annulla'}
              </button>
              <button
                type="button"
                disabled={isRestoring}
                onClick={handleConfirmRestore}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-600/30 flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95"
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>{t('backup_settings.restoring_backup') || 'Ripristino in corso...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{t('backup_settings.btn_restore_now') || 'Ripristina Ora'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupSettingsTab;
