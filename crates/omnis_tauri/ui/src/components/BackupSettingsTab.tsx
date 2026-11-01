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
  Calendar,
  Clock,
  Save,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTranslation } from '../i18n';
import soundEffects from '../utils/soundEffects';
import {
  BackupResultDto,
  BackupInspectionDto,
  BackupScheduleConfigDto,
} from '../types';

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

  // Automated backup & scheduling state
  const [scheduleConfig, setScheduleConfig] = useState<BackupScheduleConfigDto | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

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

  // Load schedule configuration
  const loadSchedule = useCallback(async () => {
    try {
      const cfg = await invoke<BackupScheduleConfigDto>('get_backup_schedule');
      setScheduleConfig(cfg);
    } catch (err) {
      console.error('Failed to load backup schedule:', err);
    }
  }, []);

  // On component mount: fetch current schedule
  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Listen to Tauri event "omnis://backup-completed"
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let isMounted = true;

    listen<BackupResultDto>('omnis://backup-completed', (event) => {
      if (!isMounted) return;
      loadSchedule();
      const res = event.payload;
      const sizeMb = (res.file_size_bytes / (1024 * 1024)).toFixed(1);
      const successTemplate = t('backup_settings.backup_created_success', {
        count: res.total_games,
        size: sizeMb,
        path: res.backup_path,
      });
      setToastMessage(
        successTemplate !== 'backup_settings.backup_created_success'
          ? successTemplate
          : `Backup .zip creato con successo (${res.total_games} giochi, ${sizeMb} MB)! Salvato in: ${res.backup_path}`
      );
    })
      .then((fn) => {
        if (isMounted) {
          unlisten = fn;
        } else {
          fn();
        }
      })
      .catch((err) => {
        console.error('Failed to attach omnis://backup-completed listener:', err);
      });

    return () => {
      isMounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [loadSchedule, t]);

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

  // Pick destination folder for manual backup
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

  // Pick destination folder for automated backup
  const handlePickAutoDestinationFolder = useCallback(async (): Promise<string | null> => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const chosen = await invoke<string | null>('pick_backup_destination_folder');
      if (chosen) {
        setScheduleConfig((prev) =>
          prev
            ? { ...prev, destination_dir: chosen }
            : {
                frequency: 'disabled',
                destination_dir: chosen,
                max_rotations: 5,
                include_artwork: false,
              }
        );
      }
      return chosen;
    } catch (err) {
      console.error('Error picking auto backup destination folder:', err);
      setErrorMessage(String(err));
      return null;
    }
  }, []);

  // Create manual backup action
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
        keepLast: scheduleConfig?.max_rotations,
      });

      setLastBackupResult(result);
      loadSchedule();
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

  // Save schedule configuration
  const handleSaveSchedule = async () => {
    if (!scheduleConfig) return;
    try {
      setIsSavingSchedule(true);
      setErrorMessage(null);
      soundEffects.playSelect();

      const saved = await invoke<BackupScheduleConfigDto>('save_backup_schedule', {
        config: {
          frequency: scheduleConfig.frequency,
          destination_dir: scheduleConfig.destination_dir || null,
          max_rotations: Number(scheduleConfig.max_rotations) || 5,
          last_backup_utc: scheduleConfig.last_backup_utc || null,
          next_backup_utc: scheduleConfig.next_backup_utc || null,
          include_artwork: Boolean(scheduleConfig.include_artwork),
        },
      });

      setScheduleConfig(saved);
      const successMsg =
        t('backup_settings.schedule_saved_success') ||
        'Configurazione di schedulazione e rotazione salvata con successo!';
      setToastMessage(successMsg);
    } catch (err) {
      console.error('Failed to save backup schedule:', err);
      const errTemplate = t('backup_settings.err_create_failed', { error: String(err) });
      setErrorMessage(
        errTemplate !== 'backup_settings.err_create_failed'
          ? errTemplate
          : `Errore durante il salvataggio della configurazione: ${err}`
      );
    } finally {
      setIsSavingSchedule(false);
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
  const formatDate = (isoString?: string | null) => {
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

  // Frequency options list
  const frequencyOptions: Array<{
    key: 'disabled' | 'daily' | 'weekly' | 'monthly';
    label: string;
  }> = [
    { key: 'disabled', label: t('backup_settings.freq_disabled') || 'Disattivato (Manuale)' },
    { key: 'daily', label: t('backup_settings.freq_daily') || 'Ogni Giorno (24h)' },
    { key: 'weekly', label: t('backup_settings.freq_weekly') || 'Ogni Settimana (7gg)' },
    { key: 'monthly', label: t('backup_settings.freq_monthly') || 'Ogni Mese (30gg)' },
  ];

  // Render next scheduled backup badge
  const renderNextBackupBadge = () => {
    if (!scheduleConfig || scheduleConfig.frequency === 'disabled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 font-medium">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {t('backup_settings.next_backup_disabled') || 'Nessun backup programmato (modalità manuale)'}
          </span>
        </span>
      );
    }

    if (!scheduleConfig.destination_dir || scheduleConfig.destination_dir.trim() === '') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>
            {t('backup_settings.next_backup_pending_folder') || 'In attesa di configurazione cartella'}
          </span>
        </span>
      );
    }

    const nextUtc = scheduleConfig.next_backup_utc;
    const isOverdue = nextUtc ? new Date(nextUtc).getTime() <= Date.now() : true;

    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>
          {isOverdue
            ? `${formatDate(nextUtc)} (${t('backup_settings.next_backup_overdue') || 'Pianificato a breve / In esecuzione...'})`
            : formatDate(nextUtc)}
        </span>
      </span>
    );
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

      {/* CARD 2: BACKUP AUTOMATICO & SCHEDULAZIONE */}
      <section
        className="p-6 rounded-3xl border shadow-xl space-y-6 transition-all"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-color)',
        }}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0 shadow-md">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <span>
                  {t('backup_settings.schedule_card_title') || 'Backup Automatico & Schedulazione'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                {t('backup_settings.schedule_card_desc') ||
                  'Configura la frequenza dei salvataggi automatici, la rotazione delle copie e monitora il prossimo backup programmato.'}
              </p>
            </div>
          </div>
        </div>

        {/* PROMINENT NEXT BACKUP STATUS CARD */}
        <div
          className="p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-color)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold block">
                {t('backup_settings.next_backup_label') || 'Prossimo backup previsto:'}
              </span>
              <div className="text-xs mt-1">
                {renderNextBackupBadge()}
              </div>
            </div>
          </div>

          {scheduleConfig?.last_backup_utc && (
            <div className="text-right text-[11px] text-slate-400 sm:self-center">
              <span>
                {t('backup_settings.last_backup_prefix') || 'Ultimo backup:'}{' '}
                <strong className="text-slate-300 font-mono">
                  {formatDate(scheduleConfig.last_backup_utc)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* FREQUENCY SELECTOR */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">
            {t('backup_settings.frequency_label') || 'Frequenza di backup:'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {frequencyOptions.map((opt) => {
              const isSelected = (scheduleConfig?.frequency ?? 'disabled') === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    setScheduleConfig((prev) =>
                      prev
                        ? { ...prev, frequency: opt.key }
                        : {
                            frequency: opt.key,
                            max_rotations: 5,
                            include_artwork: false,
                          }
                    );
                  }}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-600/30 font-bold'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ROTATION SELECTOR */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="maxRotationsInput" className="text-xs font-bold text-slate-300">
              {t('backup_settings.rotation_label') || 'Copie rotanti da conservare:'}
            </label>
            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-bold font-mono text-xs">
              {scheduleConfig?.max_rotations ?? 5} / 10
            </span>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={scheduleConfig?.max_rotations ?? 5}
              onChange={(e) => {
                const val = Number(e.target.value);
                setScheduleConfig((prev) =>
                  prev
                    ? { ...prev, max_rotations: val }
                    : {
                        frequency: 'disabled',
                        max_rotations: val,
                        include_artwork: false,
                      }
                );
              }}
              className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
            <input
              id="maxRotationsInput"
              type="number"
              min={1}
              max={10}
              value={scheduleConfig?.max_rotations ?? 5}
              onChange={(e) => {
                const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                setScheduleConfig((prev) =>
                  prev
                    ? { ...prev, max_rotations: val }
                    : {
                        frequency: 'disabled',
                        max_rotations: val,
                        include_artwork: false,
                      }
                );
              }}
              className="w-16 px-2.5 py-1.5 text-center bg-slate-900 border border-white/20 rounded-xl text-white font-bold font-mono text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t('backup_settings.rotation_desc', { count: scheduleConfig?.max_rotations ?? 5 }) ||
              `Conserva al massimo ${scheduleConfig?.max_rotations ?? 5} backup su disco. I backup più vecchi verranno eliminati automaticamente per liberare spazio (limite massimo: 10 copie).`}
          </p>
        </div>

        {/* DESTINATION FOLDER FOR AUTO-BACKUP */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">
            {t('backup_settings.auto_destination_label') ||
              'Cartella di destinazione per backup automatici:'}
          </label>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 px-4 py-2.5 rounded-xl border text-xs font-mono text-slate-200 truncate select-all"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-color)',
              }}
              title={scheduleConfig?.destination_dir || ''}
            >
              {scheduleConfig?.destination_dir ||
                t('backup_settings.destination_folder_placeholder') ||
                'Nessuna cartella selezionata (fai clic su Scegli cartella per selezionare dove salvare)...'}
            </div>
            <button
              type="button"
              onClick={handlePickAutoDestinationFolder}
              className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer hover:border-white/30 active:scale-95"
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>{t('backup_settings.btn_choose_folder') || 'Scegli cartella...'}</span>
            </button>
          </div>

          {/* WARNING WHEN FREQUENCY ACTIVE BUT NO DESTINATION DIR */}
          {scheduleConfig?.frequency &&
            scheduleConfig.frequency !== 'disabled' &&
            (!scheduleConfig.destination_dir || scheduleConfig.destination_dir.trim() === '') && (
              <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="font-medium leading-relaxed">
                  {t('backup_settings.auto_destination_warning') ||
                    'Cartella non impostata: seleziona una cartella di destinazione per attivare il backup automatico.'}
                </span>
              </div>
            )}
        </div>

        {/* OPTIONS & SAVE BUTTON */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/5">
          <div className="flex items-center gap-3">
            <input
              id="autoIncludeArtworkCheckbox"
              type="checkbox"
              checked={scheduleConfig?.include_artwork ?? false}
              onChange={(e) => {
                soundEffects.playSelect();
                setScheduleConfig((prev) =>
                  prev
                    ? { ...prev, include_artwork: e.target.checked }
                    : {
                        frequency: 'disabled',
                        max_rotations: 5,
                        include_artwork: e.target.checked,
                      }
                );
              }}
              className="w-4 h-4 rounded text-indigo-500 bg-slate-900 border-white/20 focus:ring-indigo-500 cursor-pointer"
            />
            <label
              htmlFor="autoIncludeArtworkCheckbox"
              className="text-xs text-slate-300 cursor-pointer select-none"
            >
              <span className="font-bold text-white">
                {t('backup_settings.auto_include_artwork_title') ||
                  'Includi artwork nei backup automatici'}
              </span>
              <span className="block text-[11px] text-slate-400">
                {t('backup_settings.auto_include_artwork_desc') ||
                  'Aumenta la dimensione dei file .zip salvando anche cover e sfondi della cache'}
              </span>
            </label>
          </div>

          {/* SAVE SCHEDULE BUTTON */}
          <button
            type="button"
            disabled={isSavingSchedule}
            onClick={handleSaveSchedule}
            className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
              isSavingSchedule
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:scale-[1.02] active:scale-95'
            }`}
          >
            {isSavingSchedule ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>{t('backup_settings.saving_schedule') || 'Salvataggio...'}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>
                  {t('backup_settings.btn_save_schedule') || 'Salva Impostazioni Schedulazione'}
                </span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* CARD 3: RIPRISTINA BACKUP */}
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
