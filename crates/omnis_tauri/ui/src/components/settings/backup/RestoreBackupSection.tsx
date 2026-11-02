import React from 'react';
import { RotateCcw, AlertTriangle, Loader2, FolderArchive } from 'lucide-react';
import { useTranslation } from '../../../i18n';

interface RestoreBackupSectionProps {
  isInspecting: boolean;
  isRestoring: boolean;
  onPickFileToRestore: () => void;
}

export const RestoreBackupSection: React.FC<RestoreBackupSectionProps> = ({
  isInspecting,
  isRestoring,
  onPickFileToRestore,
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
          onClick={onPickFileToRestore}
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
  );
};
