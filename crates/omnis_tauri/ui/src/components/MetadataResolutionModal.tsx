import React, { useState, useEffect } from "react";
import {
  Search,
  Sparkles,
  X,
  Check,
  CheckSquare,
  Square,
  Loader2,
  Calendar,
  Star,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  Gamepad2,
  Layers,
} from "lucide-react";

export interface MetadataCandidateDto {
  provider_id: string;
  provider_game_id: string;
  title: string;
  release_year?: number | null;
  cover_url?: string | null;
  background_url?: string | null;
  description?: string | null;
  raw_patch: {
    description?: string | null;
    release_date?: string | null;
    cover_url?: string | null;
    background_url?: string | null;
    icon_url?: string | null;
    critic_score?: number | null;
    community_score?: number | null;
    genres?: string[];
    developers?: string[];
    publishers?: string[];
    tags?: string[];
  };
}

export interface MetadataResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: any;
  onApply: (updated: any) => void;
}

interface FieldOption {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const AVAILABLE_FIELDS: FieldOption[] = [
  {
    key: "cover_image",
    label: "Copertina Verticale",
    description: "Cover 2:3 ufficiale o artwork HD SteamGridDB",
    icon: <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />,
  },
  {
    key: "background_image",
    label: "Sfondo Panoramico Hero",
    description: "Banner panoramico 16:9 ad alta risoluzione",
    icon: <Layers className="w-3.5 h-3.5 text-sky-400" />,
  },
  {
    key: "description",
    label: "Descrizione & Sinossi",
    description: "Trama e riassunto ufficiale localizzato",
    icon: <FileText className="w-3.5 h-3.5 text-slate-300" />,
  },
  {
    key: "critic_score",
    label: "Voto Critica (Metacritic/OpenCritic)",
    description: "Punteggio globale da 0 a 100",
    icon: <Star className="w-3.5 h-3.5 text-amber-400" />,
  },
  {
    key: "community_score",
    label: "Voto Community (%)",
    description: "Raccomandazione e gradimento della community",
    icon: <Star className="w-3.5 h-3.5 text-emerald-400" />,
  },
  {
    key: "genres",
    label: "Generi Ufficiali",
    description: "Categorizzazione e generi videoludici",
    icon: <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />,
  },
  {
    key: "release_date",
    label: "Data di Uscita",
    description: "Giorno e anno di pubblicazione",
    icon: <Calendar className="w-3.5 h-3.5 text-rose-400" />,
  },
  {
    key: "developers",
    label: "Sviluppatori & Editori",
    description: "Team di sviluppo e publisher accreditati",
    icon: <FileText className="w-3.5 h-3.5 text-teal-400" />,
  },
];

async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' failed:`, err);
    throw err;
  }
  return null;
}

export default function MetadataResolutionModal({
  isOpen,
  onClose,
  game,
  onApply,
}: MetadataResolutionModalProps) {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("all");
  const [candidates, setCandidates] = useState<MetadataCandidateDto[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidateDto | null>(null);

  const [selectedFields, setSelectedFields] = useState<string[]>([
    "cover_image",
    "background_image",
    "description",
    "critic_score",
    "community_score",
    "genres",
    "release_date",
  ]);

  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  // On open, pre-fill search with current title and trigger initial search
  useEffect(() => {
    if (!isOpen || !game) return;

    setSearchTerm(game.title || "");
    setProviderId("all");
    setSelectedCandidate(null);
    setSearchError(null);
    setApplyError(null);
    setApplySuccess(false);

    handleSearch(game.title || "", "all");
  }, [isOpen, game]);

  if (!isOpen || !game) return null;

  const handleSearch = async (termToSearch: string, prov: string) => {
    const term = termToSearch.trim();
    if (!term) return;

    setIsSearching(true);
    setSearchError(null);
    setSelectedCandidate(null);

    try {
      const result = await callTauri<MetadataCandidateDto[]>("search_metadata_candidates", {
        title: term,
        providerId: prov === "all" ? null : prov,
      });

      if (result && result.length > 0) {
        setCandidates(result);
        setSelectedCandidate(result[0]); // Auto-select top match
      } else {
        setCandidates([]);
        setSearchError("Nessun candidato trovato per questo titolo.");
      }
    } catch (err: any) {
      setSearchError(
        typeof err === "string" ? err : err.message || "Errore durante la ricerca dei candidati"
      );
      setCandidates([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const selectAllFields = () => {
    setSelectedFields(AVAILABLE_FIELDS.map((f) => f.key));
  };

  const deselectAllFields = () => {
    setSelectedFields([]);
  };

  const handleApply = async () => {
    if (!selectedCandidate || selectedFields.length === 0) return;

    try {
      setIsApplying(true);
      setApplyError(null);

      const updated = await callTauri<any>("apply_metadata_candidate", {
        gameId: game.id,
        candidate: selectedCandidate,
        fields: selectedFields,
      });

      setApplySuccess(true);
      setTimeout(() => {
        onApply(updated || { ...game, ...selectedCandidate.raw_patch });
        onClose();
      }, 500);
    } catch (err: any) {
      setApplyError(
        typeof err === "string" ? err : err.message || "Errore nell'applicazione dei metadati"
      );
    } finally {
      setIsApplying(false);
    }
  };

  const getProviderBadge = (pId: string) => {
    switch (pId.toLowerCase()) {
      case "steam":
        return { name: "Steam Store", bg: "rgba(23, 53, 77, 0.9)", border: "#66c0f4", text: "#66c0f4" };
      case "steamgriddb":
        return { name: "SteamGridDB HD", bg: "rgba(35, 38, 46, 0.9)", border: "#e5e7eb", text: "#ffffff" };
      case "opencritic":
        return { name: "OpenCritic", bg: "rgba(50, 20, 20, 0.9)", border: "#f87171", text: "#f87171" };
      default:
        return { name: pId, bg: "rgba(30, 41, 59, 0.9)", border: "#94a3b8", text: "#cbd5e1" };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
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
              <h2 className="text-lg font-semibold tracking-wide text-white">
                Risoluzione & Identificazione Metadati
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Titolo attuale: <span className="font-medium text-white">{game.title}</span> ({game.library})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SEARCH BAR */}
        <div
          className="px-6 py-4 border-b shrink-0 flex flex-col md:flex-row gap-3 items-center"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch(searchTerm, providerId);
              }}
              placeholder="Cerca per titolo videogioco..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-normal outline-none transition-all focus:ring-1 focus:ring-indigo-500"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <select
            value={providerId}
            onChange={(e) => {
              setProviderId(e.target.value);
              handleSearch(searchTerm, e.target.value);
            }}
            className="w-full md:w-56 px-3.5 py-2.5 rounded-xl border text-xs font-medium outline-none cursor-pointer"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            <option value="all">Tutti i Provider</option>
            <option value="steam">Steam Store (Ufficiale)</option>
            <option value="steamgriddb">SteamGridDB (Artwork HD)</option>
            <option value="opencritic">OpenCritic (Recensioni)</option>
          </select>

          <button
            onClick={() => handleSearch(searchTerm, providerId)}
            disabled={isSearching || !searchTerm.trim()}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-medium text-white shadow-md transition-all active:scale-95 disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 0 15px var(--accent-glow)",
            }}
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Cerca</span>
          </button>
        </div>

        {/* MAIN BODY: 2-COLUMN LAYOUT (CANDIDATES & FIELD CHECKLIST) */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* LEFT: CANDIDATES LIST */}
          <div
            className="flex-1 overflow-y-auto p-6 border-b md:border-b-0 md:border-r space-y-4"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium tracking-wider uppercase text-slate-400">
                Risultati Trovati ({candidates.length})
              </span>
              {candidates.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Seleziona il candidato da associare
                </span>
              )}
            </div>

            {isSearching ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-xs font-normal text-slate-300">
                  Interrogazione store e database metadati in corso...
                </span>
              </div>
            ) : searchError ? (
              <div
                className="p-8 rounded-2xl border text-center space-y-2"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">{searchError}</p>
                <p className="text-xs text-slate-400">
                  Prova a modificare i termini di ricerca o selezionare "Tutti i Provider".
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((cand, idx) => {
                  const isSelected =
                    selectedCandidate?.provider_game_id === cand.provider_game_id &&
                    selectedCandidate?.provider_id === cand.provider_id;
                  const badge = getProviderBadge(cand.provider_id);

                  return (
                    <div
                      key={`${cand.provider_id}-${cand.provider_game_id}-${idx}`}
                      onClick={() => setSelectedCandidate(cand)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex gap-4 items-start ${
                        isSelected
                          ? "ring-2 ring-indigo-500 shadow-lg scale-[1.01]"
                          : "hover:border-slate-600 opacity-90 hover:opacity-100"
                      }`}
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: isSelected ? "var(--accent-primary)" : "var(--border-color)",
                        boxShadow: isSelected ? "0 0 15px var(--accent-glow)" : undefined,
                      }}
                    >
                      {/* Thumbnail Cover */}
                      <div className="w-20 aspect-[2/3] rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10 shadow-md">
                        {cand.cover_url ? (
                          <img
                            src={cand.cover_url}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-medium text-slate-500">
                            No Cover
                          </div>
                        )}
                      </div>

                      {/* Info & Badges */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border"
                            style={{
                              backgroundColor: badge.bg,
                              borderColor: badge.border,
                              color: badge.text,
                            }}
                          >
                            {badge.name}
                          </span>

                          {cand.release_year && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-slate-200">
                              {cand.release_year}
                            </span>
                          )}

                          {cand.raw_patch.critic_score && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ★ {cand.raw_patch.critic_score}
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-semibold text-white truncate">{cand.title}</h4>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {cand.description || "Nessuna descrizione disponibile."}
                        </p>

                        {cand.raw_patch.genres && cand.raw_patch.genres.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 overflow-hidden">
                            {cand.raw_patch.genres.slice(0, 3).map((g, gi) => (
                              <span
                                key={gi}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: CHECKLIST "CAMPI DA IMPORTARE" & PREVIEW */}
          <div
            className="w-full md:w-80 lg:w-96 overflow-y-auto p-6 space-y-5"
            style={{ backgroundColor: "var(--bg-surface)" }}
          >
            <div>
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-medium tracking-wider uppercase text-slate-300">
                  Campi da Importare
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    onClick={selectAllFields}
                    className="text-indigo-400 hover:underline font-medium"
                  >
                    Tutti
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    onClick={deselectAllFields}
                    className="text-slate-400 hover:underline font-medium"
                  >
                    Nessuno
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {AVAILABLE_FIELDS.map((field) => {
                  const isChecked = selectedFields.includes(field.key);
                  return (
                    <div
                      key={field.key}
                      onClick={() => toggleField(field.key)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isChecked
                          ? "border-indigo-500/50 bg-indigo-500/10 text-white"
                          : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="shrink-0">{field.icon}</div>
                        <div>
                          <p className="text-xs font-medium">{field.label}</p>
                          <p className="text-[10px] text-slate-400">{field.description}</p>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-600" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CANDIDATE ARTWORK PREVIEW */}
            {selectedCandidate && (
              <div
                className="p-4 rounded-2xl border space-y-3"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                }}
              >
                <span className="text-[11px] font-medium uppercase text-slate-400 tracking-wider">
                  Anteprima Selezionata
                </span>

                <div className="space-y-2">
                  {selectedCandidate.background_url && (
                    <div className="w-full h-24 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                      <img
                        src={selectedCandidate.background_url}
                        alt="Hero Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {selectedCandidate.cover_url && (
                      <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0">
                        <img
                          src={selectedCandidate.cover_url}
                          alt="Cover Preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {selectedCandidate.title}
                      </p>
                      <p className="text-[11px] text-indigo-400 font-medium">
                        {selectedFields.length} campi selezionati
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FEEDBACK STATUS */}
        {applyError && (
          <div className="px-6 py-2.5 bg-rose-500/20 border-t border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{applyError}</span>
          </div>
        )}
        {applySuccess && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-t border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>Metadati e immagini applicati con successo al gioco!</span>
          </div>
        )}

        {/* FOOTER BUTTONS */}
        <div
          className="flex items-center justify-between px-6 py-4 border-t shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <span className="text-xs text-slate-400">
            {selectedCandidate ? (
              <span>
                Pronto per applicare <strong className="font-semibold text-white">{selectedCandidate.title}</strong>
              </span>
            ) : (
              <span>Seleziona un candidato per procedere</span>
            )}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-5 py-2.5 rounded-xl border text-xs font-medium text-slate-300 hover:bg-white/5 transition-all"
              style={{ borderColor: "var(--border-color)" }}
            >
              Annulla
            </button>

            <button
              onClick={handleApply}
              disabled={!selectedCandidate || selectedFields.length === 0 || isApplying}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-medium text-white shadow-xl transition-all transform active:scale-95 disabled:opacity-50"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 20px var(--accent-glow)",
              }}
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>{isApplying ? "Download & Applicazione..." : "Applica Metadati Selezionati"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
