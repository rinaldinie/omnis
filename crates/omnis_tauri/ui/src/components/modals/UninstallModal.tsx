import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { GameDto, formatImageUrl } from '../../types';
import { useTranslation } from '../../i18n';
import { soundEffects } from '../../utils/soundEffects';

interface UninstallModalProps {
  isOpen: boolean;
  game: GameDto | null;
  onClose: () => void;
  onConfirmUninstall: (gameId: string) => Promise<void>;
}

export const UninstallModal: React.FC<UninstallModalProps> = ({
  isOpen,
  game,
  onClose,
  onConfirmUninstall,
}) => {
  const { t } = useTranslation();
  const [isUninstalling, setIsUninstalling] = useState(false);

  if (!isOpen || !game) return null;

  const handleConfirm = async () => {
    soundEffects.playSelect();
    try {
      setIsUninstalling(true);
      await onConfirmUninstall(game.id);
      onClose();
    } catch (err) {
      console.error('Failed to uninstall game:', err);
    } finally {
      setIsUninstalling(false);
    }
  };

  const coverUrl = game.cover_image ? formatImageUrl(game.cover_image) : null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-lg w-full rounded-3xl border shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
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
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-md">
              <Trash2 className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">{t('uninstall_modal.title')}</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {game.library.toUpperCase()} • {game.title}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            disabled={isUninstalling}
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)',
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="flex gap-4 items-center p-3 rounded-2xl border bg-black/30" style={{ borderColor: 'var(--border-color)' }}>
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={game.title}
                className="w-16 h-20 object-cover rounded-xl shadow-md shrink-0 border border-white/10"
              />
            ) : (
              <div className="w-16 h-20 rounded-xl bg-slate-800 flex items-center justify-center text-white/50 text-xs font-bold shrink-0">
                {game.title.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-extrabold text-white text-sm truncate">{game.title}</h4>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t('common.details')}: {game.playtime_formatted} • {game.genres.slice(0, 2).join(', ') || 'N/A'}
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/5 border border-white/10 text-slate-300">
                <span>{game.library.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-white/90 leading-relaxed font-medium">
            {t('uninstall_modal.confirm_msg', { title: game.title })}
          </p>

          {/* Reassurance Notice (Approach 1) */}
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed text-emerald-200">
              {t('uninstall_modal.reassurance_note', { playtime: game.playtime_formatted })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              onClose();
            }}
            disabled={isUninstalling}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isUninstalling}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:bg-rose-700 border border-rose-400/40 shadow-lg shadow-rose-950/40 transition-all hover:scale-105 active:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isUninstalling
                ? t('uninstall_modal.uninstalling')
                : t('uninstall_modal.uninstall_btn')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
