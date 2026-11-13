import { useState, useEffect, useRef } from "react";
import { Search, Sparkles, Check, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "../../i18n";
import { getErrorMessage } from "../../utils/errors";
import { GameDto } from "../../types";
import { api } from "../../api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MetadataCandidateDto } from "./metadata_resolution/types";
import {
  AVAILABLE_FIELDS,
  computeMissingGameFields,
  isCandidateFieldAvailable,
} from "./metadata_resolution/fieldDefinitions";
import { CandidatesListPane } from "./metadata_resolution/CandidatesListPane";
import { FieldSelectionPane } from "./metadata_resolution/FieldSelectionPane";

export type { MetadataCandidateDto };

export interface MetadataResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: GameDto | null;
  onApply: (updated: GameDto) => void;
}

export default function MetadataResolutionModal({
  isOpen,
  onClose,
  game,
  onApply,
}: MetadataResolutionModalProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [providerId, setProviderId] = useState<string>("all");
  const [availableProviders, setAvailableProviders] = useState<
    Array<{ id: string; name: string }>
  >([
    { id: "steam", name: "Steam Store" },
    { id: "gog", name: "GOG Store" },
    { id: "steamgriddb", name: "SteamGridDB" },
    { id: "igdb", name: "IGDB" },
    { id: "opencritic", name: "OpenCritic" },
  ]);
  const [candidates, setCandidates] = useState<MetadataCandidateDto[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<MetadataCandidateDto | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);

  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  const handleSelectCandidate = (cand: MetadataCandidateDto) => {
    setSelectedCandidate(cand);

    // Auto-select fields that are missing in the game AND available in this candidate
    const missing = computeMissingGameFields(game);
    const availableMissing = missing.filter((key) => isCandidateFieldAvailable(cand, key));

    if (availableMissing.length > 0) {
      setSelectedFields(availableMissing);
    } else {
      // If no missing fields are available in this candidate, select available artwork or first available
      const availableKeys = AVAILABLE_FIELDS.filter((f) =>
        isCandidateFieldAvailable(cand, f.key)
      ).map((f) => f.key);
      const artwork = availableKeys.filter((k) =>
        ["cover_image", "background_image", "icon"].includes(k)
      );
      if (artwork.length > 0) {
        setSelectedFields(artwork);
      } else if (availableKeys.length > 0) {
        setSelectedFields([availableKeys[0]]);
      } else {
        setSelectedFields([]);
      }
    }
  };

  const handleSearchRef = useRef<(term: string, prov: string) => void>(() => {});

  // On open, pre-fill search and reset candidate state
  useEffect(() => {
    if (!isOpen || !game) return;

    setSearchTerm(game.title || "");
    setProviderId("all");
    setSelectedCandidate(null);
    setSelectedFields([]);
    setSearchError(null);
    setApplyError(null);
    setApplySuccess(false);

    handleSearchRef.current(game.title || "", "all");
  }, [isOpen, game]);

  useEffect(() => {
    if (!isOpen) return;
    api.metadata
      .getProviders()
      .then((list) => {
        if (list && list.length > 0) {
          const searchCapable = [
            { id: "steam", defaultName: "Steam Store" },
            { id: "gog", defaultName: "GOG Store" },
            { id: "steamgriddb", defaultName: "SteamGridDB (Artwork HD)" },
            { id: "igdb", defaultName: "IGDB (Database)" },
            { id: "opencritic", defaultName: "OpenCritic (Valutazioni)" },
          ];
          const enabledMap = new Map(list.map((p) => [p.id.toLowerCase(), p.is_enabled]));
          const active = searchCapable
            .filter((p) => enabledMap.get(p.id) !== false)
            .map((p) => {
              const found = list.find((item) => item.id.toLowerCase() === p.id);
              return {
                id: p.id,
                name: found && found.name ? found.name : p.defaultName,
              };
            });
          if (active.length > 0) {
            setAvailableProviders(active);
          }
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen || !game) return null;

  const handleSearch = async (termToSearch: string, prov: string) => {
    const term = termToSearch.trim();
    if (!term) return;

    setIsSearching(true);
    setSearchError(null);
    setSelectedCandidate(null);

    try {
      const result = await api.metadata.searchMetadataCandidates(
        term,
        prov === "all" ? undefined : prov
      );

      if (result && result.length > 0) {
        setCandidates(result);
        handleSelectCandidate(result[0]);
      } else {
        setCandidates([]);
        setSelectedCandidate(null);
        setSelectedFields([]);
        setSearchError(t("metadata_resolution.no_candidates"));
      }
    } catch (err: unknown) {
      setSearchError(getErrorMessage(err, t("metadata_resolution.search_error")));
      setCandidates([]);
      setSelectedCandidate(null);
      setSelectedFields([]);
    } finally {
      setIsSearching(false);
    }
  };
  handleSearchRef.current = handleSearch;

  const toggleField = (key: string) => {
    if (selectedCandidate && !isCandidateFieldAvailable(selectedCandidate, key)) {
      return;
    }
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  const selectAllFields = () => {
    if (!selectedCandidate) return;
    setSelectedFields(
      AVAILABLE_FIELDS.filter((f) => isCandidateFieldAvailable(selectedCandidate, f.key)).map(
        (f) => f.key
      )
    );
  };

  const selectMissingFields = () => {
    if (!selectedCandidate) return;
    setSelectedFields(
      computeMissingGameFields(game).filter((key) =>
        isCandidateFieldAvailable(selectedCandidate, key)
      )
    );
  };

  const selectArtworkOnly = () => {
    if (!selectedCandidate) return;
    setSelectedFields(
      ["cover_image", "background_image", "icon"].filter((k) =>
        isCandidateFieldAvailable(selectedCandidate, k)
      )
    );
  };

  const handleApply = async () => {
    if (!selectedCandidate || selectedFields.length === 0) return;

    try {
      setIsApplying(true);
      setApplyError(null);

      const updated = await api.metadata.applyMetadataCandidate(
        game.id,
        selectedCandidate,
        selectedFields
      );

      if (!updated) {
        throw new Error(t("metadata_resolution.save_failed"));
      }

      setApplySuccess(true);
      setTimeout(() => {
        onApply(updated);
        onClose();
      }, 500);
    } catch (err: unknown) {
      setApplyError(getErrorMessage(err, t("metadata_resolution.apply_error")));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog
      open={isOpen && Boolean(game)}
      onOpenChange={(open) => {
        if (!open && !isApplying) {
          onClose();
        }
      }}
    >
      <DialogContent
        className="max-w-5xl w-full max-h-[92vh] p-0 flex flex-col rounded-2xl overflow-hidden gap-0 text-foreground"
        closeButtonDisabled={isApplying}
      >
        <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 space-y-0 text-left pr-14">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-wide text-foreground">
                {t("game_details.identify_metadata")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {t("metadata_resolution.current_title")}{" "}
                <span className="font-medium text-foreground">{game.title}</span> ({game.library})
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* SEARCH BAR */}
        <div className="px-6 py-4 border-b border-border bg-popover shrink-0 flex flex-col md:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch(searchTerm, providerId);
              }}
              placeholder={t("metadata_resolution.search_placeholder")}
              className="pl-10 pr-4 py-2.5 h-auto rounded-xl text-sm font-normal bg-card"
            />
          </div>

          <div className="relative w-full md:w-60 shrink-0">
            <Select
              value={providerId}
              onValueChange={(nextProv) => {
                setProviderId(nextProv);
                handleSearch(searchTerm, nextProv);
              }}
            >
              <SelectTrigger
                className="w-full px-3.5 py-2.5 h-auto rounded-xl text-xs font-medium"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("metadata_resolution.opt_all")}</SelectItem>
                {availableProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            onClick={() => handleSearch(searchTerm, providerId)}
            disabled={isSearching || !searchTerm.trim()}
            className="w-full md:w-auto px-5 py-2.5 h-auto font-medium shadow-md"
            style={{ boxShadow: "0 0 15px var(--accent-glow)" }}
          >
            {isSearching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>{isSearching ? t("common.loading") : t("common.search")}</span>
          </Button>
        </div>

        {/* MAIN BODY: 2-COLUMN LAYOUT (CANDIDATES & FIELD CHECKLIST) */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:flex-row">
          <CandidatesListPane
            candidates={candidates}
            selectedCandidate={selectedCandidate}
            onSelectCandidate={handleSelectCandidate}
            isSearching={isSearching}
            searchError={searchError}
            t={t}
          />

          <FieldSelectionPane
            game={game}
            selectedCandidate={selectedCandidate}
            selectedFields={selectedFields}
            onToggleField={toggleField}
            onSelectAll={selectAllFields}
            onSelectMissing={selectMissingFields}
            onSelectArtworkOnly={selectArtworkOnly}
            onDeselectAll={() => setSelectedFields([])}
            t={t}
          />
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
            <span>{t("metadata_resolution.applied")}</span>
          </div>
        )}

        <DialogFooter className="sm:justify-between items-center px-6 py-4 border-t border-border bg-card shrink-0">
          <span className="text-xs text-muted-foreground">
            {selectedCandidate ? (
              <span>
                {t("metadata_resolution.ready")}{" "}
                <strong className="font-semibold text-foreground">{selectedCandidate.title}</strong>
              </span>
            ) : (
              <span>{t("metadata_resolution.select_to_continue")}</span>
            )}
          </span>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleApply}
              disabled={!selectedCandidate || selectedFields.length === 0 || isApplying}
              className="px-6 py-2.5 h-auto font-medium shadow-xl"
              style={{ boxShadow: "0 0 20px var(--accent-glow)" }}
            >
              {isApplying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>
                {isApplying ? t("metadata_resolution.applying") : t("metadata_resolution.apply")}
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isApplying}
              className="px-5 py-2.5 h-auto font-medium"
            >
              {t("common.cancel")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
