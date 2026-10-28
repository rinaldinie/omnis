import React from "react";
import { Gamepad2 } from "lucide-react";
import { useTranslation } from "../../i18n";

export interface EmptyGamesViewProps {
  title?: string;
  hint?: string;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
}

export default function EmptyGamesView({
  title,
  hint,
  onClearFilters,
  hasActiveFilters = false,
}: EmptyGamesViewProps) {
  const { t } = useTranslation();

  const displayTitle = title || t("views.no_games_found") || "Nessun gioco trovato";
  const displayHint =
    hint ||
    t("views.no_games_found_hint") ||
    "Prova a modificare i filtri o la query di ricerca.";

  return (
    <div className="flex-1 w-full h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 select-none animate-in fade-in duration-200">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4 shadow-lg shadow-black/20">
        <Gamepad2 className="w-8 h-8 opacity-40 text-slate-400" />
      </div>
      <h3 className="text-base font-bold text-white mb-1.5">{displayTitle}</h3>
      <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">{displayHint}</p>
      {hasActiveFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="h-8 px-4 rounded-lg text-xs font-semibold bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 hover:text-white transition-all cursor-pointer shadow-sm"
        >
          {t("filter_modal.clear_all") || "Cancella filtri"}
        </button>
      )}
    </div>
  );
}
