import React, { useState, useEffect } from "react";
import {
  Sparkles,
  X,
  Layers,
  Clock,
  Image as ImageIcon,
  Filter,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  RefreshCw,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { GameDto, invokeTauri } from "../../types";
import { useTranslation } from "../../i18n";

export type BatchTargetMode = "all" | "missing_hltb" | "missing_artwork" | "filtered";

interface MetadataProgressPayload {
  current: number;
  total: number;
  title: string;
}

export interface BatchEnrichModalProps {
  isOpen: boolean;
  onClose: () => void;
  allGames: GameDto[];
  filteredGames: GameDto[];
  onComplete: () => Promise<void>;
}

export default function BatchEnrichModal({
  isOpen,
  onClose,
  allGames,
  filteredGames,
  onComplete,
}: BatchEnrichModalProps) {
  const { t } = useTranslation();
  const [targetMode, setTargetMode] = useState<BatchTargetMode>("missing_hltb");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Calculate target games based on selected mode
  const getTargetGames = (): GameDto[] => {
    switch (targetMode) {
      case "all":
        return allGames;
      case "missing_hltb":
        return allGames.filter((g) => !g.extra_metadata || !g.extra_metadata.includes("howlongtobeat"));
      case "missing_artwork":
        return allGames.filter((g) => !g.cover_image);
      case "filtered":
        return filteredGames;
      default:
        return allGames;
    }
  };

  const targetGames = getTargetGames();

  // Listen to Tauri progress events during batch enrichment
  useEffect(() => {
    if (!isOpen) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        unlisten = await listen<MetadataProgressPayload>("metadata-progress", (event) => {
          setProgress(event.payload);
        });
      } catch (err) {
        console.warn("Failed to attach metadata-progress listener:", err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartEnrichment = async () => {
    if (targetGames.length === 0) return;

    try {
      setIsRunning(true);
      setResultMessage(null);
      setProgress({ current: 0, total: targetGames.length, title: "Preparazione catalogo..." });

      const gameIds = targetGames.map((g) => g.id);
      const count = await invokeTauri<number>("download_batch_metadata", { gameIds });

      setResultMessage(`Arricchimento completato! ${count ?? targetGames.length} titoli aggiornati.`);
      await onComplete();
    } catch (err: any) {
      setResultMessage(`Errore durante l'arricchimento: ${err}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCancel = async () => {
    try {
      await invokeTauri("cancel_metadata_download");
      setResultMessage("Richiesta di interruzione inviata...");
    } catch (err) {
      console.warn("Failed to cancel metadata download:", err);
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{t("topbar.enrich_button")}</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("topbar.enrich_tooltip")}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CONTENT */}
        <div className="p-6 space-y-5">
          {/* TARGET SELECTION */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">
              Seleziona il Gruppo di Titoli Target
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Missing HLTB */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setTargetMode("missing_hltb")}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  targetMode === "missing_hltb"
                    ? "border-amber-500/80 bg-amber-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                }`}
              >
                <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${targetMode === "missing_hltb" ? "text-amber-400" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Senza HowLongToBeat</div>
                  <div className="text-[11px] text-slate-400">
                    {allGames.filter((g) => !g.extra_metadata?.includes("howlongtobeat")).length} giochi
                  </div>
                </div>
              </button>

              {/* Option 2: Filtered Screen Games */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setTargetMode("filtered")}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  targetMode === "filtered"
                    ? "border-indigo-500/80 bg-indigo-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                }`}
              >
                <Filter className={`w-4 h-4 mt-0.5 shrink-0 ${targetMode === "filtered" ? "text-indigo-400" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Filtro / Ricerca Attiva</div>
                  <div className="text-[11px] text-slate-400">
                    {filteredGames.length} giochi visibili
                  </div>
                </div>
              </button>

              {/* Option 3: Missing Artwork */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setTargetMode("missing_artwork")}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  targetMode === "missing_artwork"
                    ? "border-sky-500/80 bg-sky-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                }`}
              >
                <ImageIcon className={`w-4 h-4 mt-0.5 shrink-0 ${targetMode === "missing_artwork" ? "text-sky-400" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Senza Copertina</div>
                  <div className="text-[11px] text-slate-400">
                    {allGames.filter((g) => !g.cover_image).length} giochi
                  </div>
                </div>
              </button>

              {/* Option 4: All Games */}
              <button
                type="button"
                disabled={isRunning}
                onClick={() => setTargetMode("all")}
                className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                  targetMode === "all"
                    ? "border-emerald-500/80 bg-emerald-500/10 shadow-sm"
                    : "border-white/10 hover:border-white/20 bg-white/[0.02]"
                }`}
              >
                <Layers className={`w-4 h-4 mt-0.5 shrink-0 ${targetMode === "all" ? "text-emerald-400" : "text-slate-400"}`} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">Tutta la Libreria</div>
                  <div className="text-[11px] text-slate-400">{allGames.length} giochi totali</div>
                </div>
              </button>
            </div>
          </div>

          {/* TARGET PREVIEW */}
          <div
            className="p-3.5 rounded-xl border space-y-2"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Giochi da elaborare:</span>
              <span className="font-bold text-amber-400">{targetGames.length} titoli</span>
            </div>
            {targetGames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {targetGames.slice(0, 8).map((g) => (
                  <span
                    key={g.id}
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/5 border border-white/10 text-slate-300 truncate max-w-[140px]"
                    title={g.title}
                  >
                    {g.title}
                  </span>
                ))}
                {targetGames.length > 8 && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-400">
                    +{targetGames.length - 8} altri...
                  </span>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 italic">
                Nessun titolo corrisponde a questo criterio di selezione.
              </p>
            )}
          </div>

          {/* PROGRESS BAR & STATUS */}
          {isRunning && progress && (
            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-300 truncate max-w-[280px]">
                  {progress.title}
                </span>
                <span className="font-bold text-white">
                  {progress.current} / {progress.total} ({percent}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-indigo-500 to-amber-500 shadow-sm"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          {/* RESULT FEEDBACK */}
          {resultMessage && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
                resultMessage.includes("Errore")
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {resultMessage.includes("Errore") ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>{resultMessage}</span>
            </div>
          )}
        </div>

        {/* FOOTER ACTIONS */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isRunning}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-40"
          >
            {resultMessage ? "Chiudi" : "Annulla"}
          </button>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all shadow-md"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Interrompi</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartEnrichment}
                disabled={targetGames.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-40"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  boxShadow: "0 0 15px var(--accent-glow)",
                }}
              >
                <Sparkles className="w-4 h-4" />
                <span>Avvia Arricchimento ({targetGames.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
