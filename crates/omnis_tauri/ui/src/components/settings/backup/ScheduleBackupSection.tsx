import React from 'react';
import { Calendar, Clock, FolderOpen, AlertTriangle, Loader2, Save } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { soundEffects } from '../../../utils/soundEffects';
import type { BackupScheduleConfigDto } from '../../../types';

interface ScheduleBackupSectionProps {
  scheduleConfig: BackupScheduleConfigDto | null;
  setScheduleConfig: React.Dispatch<React.SetStateAction<BackupScheduleConfigDto | null>>;
  isSavingSchedule: boolean;
  onPickAutoDestinationFolder: () => void;
  onSaveSchedule: () => void;
  renderNextBackupBadge: () => React.ReactNode;
  formatDate: (isoDate?: string | null) => string;
}

export const ScheduleBackupSection: React.FC<ScheduleBackupSectionProps> = ({
  scheduleConfig,
  setScheduleConfig,
  isSavingSchedule,
  onPickAutoDestinationFolder,
  onSaveSchedule,
  renderNextBackupBadge,
  formatDate,
}) => {
  const { t } = useTranslation();

  const frequencyOptions: Array<{
    key: 'disabled' | 'daily' | 'weekly' | 'monthly';
    label: string;
  }> = [
    { key: 'disabled', label: t('backup_settings.freq_disabled') || 'Disabilitato' },
    { key: 'daily', label: t('backup_settings.freq_daily') || 'Ogni Giorno' },
    { key: 'weekly', label: t('backup_settings.freq_weekly') || 'Ogni Settimana' },
    { key: 'monthly', label: t('backup_settings.freq_monthly') || 'Ogni Mese' },
  ];

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
          <div
            className="w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 shadow-md"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
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
          <div
            className="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
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
                style={
                  isSelected
                    ? {
                        backgroundColor: 'var(--accent-primary)',
                        borderColor: 'var(--accent-primary)',
                        boxShadow: '0 4px 14px var(--accent-glow)',
                      }
                    : undefined
                }
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'text-white font-bold'
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
          <span
            className="px-2.5 py-0.5 rounded-lg border font-bold font-mono text-xs"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
              borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              color: 'var(--accent-primary)',
            }}
          >
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
            onClick={onPickAutoDestinationFolder}
            className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center gap-2 transition-all cursor-pointer hover:border-white/30 active:scale-95"
          >
            <FolderOpen className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
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
            style={{ accentColor: 'var(--accent-primary)' }}
            className="w-4 h-4 rounded bg-slate-900 border-white/20 cursor-pointer"
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
          onClick={onSaveSchedule}
          className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer ${
            isSavingSchedule
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
              : 'text-white hover:brightness-110 hover:scale-[1.02] active:scale-95'
          }`}
          style={
            !isSavingSchedule
              ? {
                  backgroundColor: 'var(--accent-primary)',
                  boxShadow: '0 4px 14px var(--accent-glow)',
                }
              : undefined
          }
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
  );
};
