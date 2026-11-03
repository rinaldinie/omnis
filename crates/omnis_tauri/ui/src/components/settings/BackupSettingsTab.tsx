import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { soundEffects } from '../../utils/soundEffects';
import { api } from '../../api';
import type {
  BackupInspectionDto,
  BackupResultDto,
  BackupScheduleConfigDto,
} from '../../types';
import { ManualBackupSection } from './backup/ManualBackupSection';
import { ScheduleBackupSection } from './backup/ScheduleBackupSection';
import { RestoreBackupSection } from './backup/RestoreBackupSection';
import { RestoreConfirmModal } from './backup/RestoreConfirmModal';

export type BackupSubSection = 'manual' | 'schedule' | 'restore' | 'all';

export interface BackupSettingsTabProps {
  onClose?: () => void;
  onRestoreComplete?: () => void;
  activeSection?: BackupSubSection;
}

export const BackupSettingsTab: React.FC<BackupSettingsTabProps> = ({
  onClose,
  onRestoreComplete,
  activeSection = 'all',
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
      const cfg = await api.backup.getSchedule();
      setScheduleConfig(cfg);
    } catch (err) {
      console.error('Failed to load backup schedule:', err);
    }
  }, []);

  // On component mount: fetch current schedule
  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // Format date helper
  const formatDate = (isoStr?: string | null): string => {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  // Pick destination folder for manual backup
  const handlePickDestinationFolder = async () => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const chosen = await api.backup.pickDestinationFolder();
      if (chosen) setSelectedDestination(chosen);
    } catch (err) {
      console.error('Error picking destination folder:', err);
      setErrorMessage(String(err));
    }
  };

  // Pick destination folder for automated backup
  const handlePickAutoDestinationFolder = useCallback(async (): Promise<string | null> => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const chosen = await api.backup.pickDestinationFolder();
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
      const picked = await api.backup.pickDestinationFolder();
      if (!picked) return;
      destDir = picked;
      setSelectedDestination(picked);
    }

    try {
      soundEffects.playSelect();
      setIsCreatingBackup(true);
      setErrorMessage(null);

      const result = await api.backup.createBackup({
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

    if (
      scheduleConfig.frequency !== 'disabled' &&
      (!scheduleConfig.destination_dir || scheduleConfig.destination_dir.trim() === '')
    ) {
      const picked = await handlePickAutoDestinationFolder();
      if (!picked) {
        setErrorMessage(
          t('backup_settings.err_select_auto_dest') ||
            'È necessario selezionare una cartella di destinazione per attivare il backup programmato.'
        );
        return;
      }
    }

    try {
      soundEffects.playSelect();
      setIsSavingSchedule(true);
      setErrorMessage(null);

      await api.backup.saveSchedule(scheduleConfig);
      await loadSchedule();
      setToastMessage(
        t('backup_settings.schedule_saved_success') ||
          'Configurazione della schedulazione salvata con successo!'
      );
    } catch (err) {
      console.error('Failed saving schedule config:', err);
      setErrorMessage(
        t('backup_settings.err_save_schedule_failed', { error: String(err) }) ||
          `Errore durante il salvataggio della pianificazione: ${err}`
      );
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Open file picker to restore backup
  const handlePickFileToRestore = async () => {
    try {
      soundEffects.playSelect();
      setErrorMessage(null);
      const chosen = await api.backup.pickFileToRestore();
      if (!chosen) return;

      setSelectedBackupFile(chosen);
      setIsInspecting(true);

      const insp = await api.backup.inspectBackup(chosen);
      setInspection(insp);
      setIsConfirmModalOpen(true);
    } catch (err) {
      console.error('Failed inspecting backup file:', err);
      setErrorMessage(
        t('backup_settings.err_inspect_failed', { error: String(err) }) ||
          `File di backup non valido o danneggiato: ${err}`
      );
    } finally {
      setIsInspecting(false);
    }
  };

  // Confirm and execute restore
  const handleConfirmRestore = async () => {
    if (!selectedBackupFile) return;

    try {
      soundEffects.playSelect();
      setIsRestoring(true);
      setErrorMessage(null);

      await api.backup.restoreBackup(selectedBackupFile);

      setIsConfirmModalOpen(false);
      const successMsg =
        t('backup_settings.restore_success_msg') ||
        "Libreria ripristinata con successo! L'interfaccia si aggiornerà tra pochi istanti.";
      setToastMessage(successMsg);

      setTimeout(() => {
        if (onRestoreComplete) onRestoreComplete();
        else if (onClose) onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed executing restore:', err);
      setErrorMessage(
        t('backup_settings.err_restore_failed', { error: String(err) }) ||
          `Errore durante il ripristino della libreria: ${err}`
      );
    } finally {
      setIsRestoring(false);
    }
  };

  const renderNextBackupBadge = () => {
    if (!scheduleConfig || scheduleConfig.frequency === 'disabled') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-400 border border-slate-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          {t('backup_settings.schedule_status_disabled') || 'Schedulazione disattivata'}
        </span>
      );
    }

    if (!scheduleConfig.destination_dir || scheduleConfig.destination_dir.trim() === '') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {t('backup_settings.schedule_status_pending_folder') ||
            'In attesa di cartella di destinazione'}
        </span>
      );
    }

    if (scheduleConfig.next_backup_utc) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {formatDate(scheduleConfig.next_backup_utc)}
        </span>
      );
    }

    return (
      <span
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
          borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
          color: 'var(--accent-primary)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        />
        {t('backup_settings.schedule_status_active') || 'Attivo (in attesa di trigger)'}
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

      {/* CARD 1: CREA BACKUP MANUALE */}
      {(activeSection === 'manual' || activeSection === 'all') && (
        <ManualBackupSection
          selectedDestination={selectedDestination}
          includeArtwork={includeArtwork}
          setIncludeArtwork={setIncludeArtwork}
          isCreatingBackup={isCreatingBackup}
          lastBackupResult={lastBackupResult}
          onPickDestinationFolder={handlePickDestinationFolder}
          onCreateBackup={handleCreateBackup}
          formatDate={formatDate}
        />
      )}

      {/* CARD 2: BACKUP AUTOMATICO & SCHEDULAZIONE */}
      {(activeSection === 'schedule' || activeSection === 'all') && (
        <ScheduleBackupSection
          scheduleConfig={scheduleConfig}
          setScheduleConfig={setScheduleConfig}
          isSavingSchedule={isSavingSchedule}
          onPickAutoDestinationFolder={handlePickAutoDestinationFolder}
          onSaveSchedule={handleSaveSchedule}
          renderNextBackupBadge={renderNextBackupBadge}
          formatDate={formatDate}
        />
      )}

      {/* CARD 3: RIPRISTINA BACKUP */}
      {(activeSection === 'restore' || activeSection === 'all') && (
        <RestoreBackupSection
          isInspecting={isInspecting}
          isRestoring={isRestoring}
          onPickFileToRestore={handlePickFileToRestore}
        />
      )}

      {/* CONFIRMATION RESTORE MODAL */}
      <RestoreConfirmModal
        isOpen={isConfirmModalOpen}
        inspection={inspection}
        isRestoring={isRestoring}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmRestore}
        formatDate={formatDate}
      />
    </div>
  );
};

export default BackupSettingsTab;
