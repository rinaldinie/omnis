import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Sparkles,
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
  Tag,
  Shield,
  ExternalLink,
} from "lucide-react";
import { useTranslation } from "../i18n";
import { getErrorMessage } from "../utils/errors";
import { GameDto } from "../types";
import { api } from "../api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface MetadataCandidateDto {
  provider_id: string;
  provider_game_id: string;
  title: string;
  release_year?: number | null;
  cover_url?: string | null;
  background_url?: string | null;
  description?: string | null;
  raw_patch: {
    name?: string | null;
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
    features?: string[];
    tags?: string[];
    series?: string | null;
    age_rating?: string | null;
    region?: string | null;
    platform?: string | null;
    custom_links?: Array<{ title: string; url: string }>;
    install_size_bytes?: number | null;
  };
}

export interface MetadataResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: GameDto | null;
  onApply: (updated: GameDto) => void;
}

interface FieldDefinition {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  isPresent: (game: GameDto) => boolean;
  getValueSummary: (cand: MetadataCandidateDto) => string | null;
}

type FieldOption = Pick<FieldDefinition, "key" | "label" | "description" | "icon">;

const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "name",
    label: "metadata_resolution.field_name",
    description: "metadata_resolution.field_name_desc",
    icon: <FileText className="w-3.5 h-3.5 text-blue-400" />,
    isPresent: (g) => Boolean(g.title && g.title.trim() !== ""),
    getValueSummary: (c) => c.raw_patch.name || c.title || null,
  },
  {
    key: "cover_image",
    label: "metadata_resolution.field_cover",
    description: "metadata_resolution.field_cover_desc",
    icon: <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />,
    isPresent: (g) => Boolean(g.cover_image && String(g.cover_image).trim() !== ""),
    getValueSummary: (c) => (c.cover_url || c.raw_patch.cover_url ? "URL Immagine" : null),
  },
  {
    key: "background_image",
    label: "metadata_resolution.field_background",
    description: "metadata_resolution.field_background_desc",
    icon: <Layers className="w-3.5 h-3.5 text-sky-400" />,
    isPresent: (g) => Boolean(g.background_image && String(g.background_image).trim() !== ""),
    getValueSummary: (c) => (c.background_url || c.raw_patch.background_url ? "URL Banner" : null),
  },
  {
    key: "icon",
    label: "metadata_resolution.field_icon",
    description: "metadata_resolution.field_icon_desc",
    icon: <ImageIcon className="w-3.5 h-3.5 text-teal-400" />,
    isPresent: (g) =>
      Boolean(
        (g.icon_image && String(g.icon_image).trim() !== "") ||
        (g.icon_image_path && String(g.icon_image_path).trim() !== "")
      ),
    getValueSummary: (c) => (c.raw_patch.icon_url ? "URL Icona" : null),
  },
  {
    key: "description",
    label: "metadata_resolution.field_description",
    description: "metadata_resolution.field_description_desc",
    icon: <FileText className="w-3.5 h-3.5 text-slate-300" />,
    isPresent: (g) => Boolean(g.description && String(g.description).trim() !== ""),
    getValueSummary: (c) => c.description || c.raw_patch.description || null,
  },
  {
    key: "genres",
    label: "metadata_resolution.field_genres",
    description: "metadata_resolution.field_genres_desc",
    icon: <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />,
    isPresent: (g) => Boolean(g.genres && g.genres.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.genres && c.raw_patch.genres.length > 0 ? c.raw_patch.genres.join(", ") : null,
  },
  {
    key: "release_date",
    label: "metadata_resolution.field_release",
    description: "metadata_resolution.field_release_desc",
    icon: <Calendar className="w-3.5 h-3.5 text-rose-400" />,
    isPresent: (g) => Boolean(g.release_date && String(g.release_date).trim() !== ""),
    getValueSummary: (c) =>
      c.raw_patch.release_date || (c.release_year ? String(c.release_year) : null),
  },
  {
    key: "developers",
    label: "metadata_resolution.field_developers",
    description: "metadata_resolution.field_developers_desc",
    icon: <FileText className="w-3.5 h-3.5 text-emerald-400" />,
    isPresent: (g) => Boolean(g.developers && g.developers.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.developers && c.raw_patch.developers.length > 0
        ? c.raw_patch.developers.join(", ")
        : null,
  },
  {
    key: "publishers",
    label: "metadata_resolution.field_publishers",
    description: "metadata_resolution.field_publishers_desc",
    icon: <FileText className="w-3.5 h-3.5 text-cyan-400" />,
    isPresent: (g) => Boolean(g.publishers && g.publishers.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.publishers && c.raw_patch.publishers.length > 0
        ? c.raw_patch.publishers.join(", ")
        : null,
  },
  {
    key: "features",
    label: "metadata_resolution.field_features",
    description: "metadata_resolution.field_features_desc",
    icon: <Sparkles className="w-3.5 h-3.5 text-yellow-400" />,
    isPresent: (g) => Boolean(g.features && g.features.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.features && c.raw_patch.features.length > 0
        ? c.raw_patch.features.join(", ")
        : null,
  },
  {
    key: "tags",
    label: "metadata_resolution.field_tags",
    description: "metadata_resolution.field_tags_desc",
    icon: <Tag className="w-3.5 h-3.5 text-orange-400" />,
    isPresent: (g) => Boolean(g.tags && g.tags.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.tags && c.raw_patch.tags.length > 0
        ? c.raw_patch.tags.slice(0, 4).join(", ")
        : null,
  },
  {
    key: "series",
    label: "metadata_resolution.field_series",
    description: "metadata_resolution.field_series_desc",
    icon: <Layers className="w-3.5 h-3.5 text-violet-400" />,
    isPresent: (g) => Boolean(g.series && String(g.series).trim() !== ""),
    getValueSummary: (c) => c.raw_patch.series || null,
  },
  {
    key: "age_rating",
    label: "metadata_resolution.field_age_rating",
    description: "metadata_resolution.field_age_rating_desc",
    icon: <Shield className="w-3.5 h-3.5 text-red-400" />,
    isPresent: (g) => Boolean(g.age_rating && String(g.age_rating).trim() !== ""),
    getValueSummary: (c) => c.raw_patch.age_rating || null,
  },
  {
    key: "critic_score",
    label: "metadata_resolution.field_critic",
    description: "metadata_resolution.field_critic_desc",
    icon: <Star className="w-3.5 h-3.5 text-amber-400" />,
    isPresent: (g) => g.critic_score !== null && g.critic_score !== undefined,
    getValueSummary: (c) =>
      c.raw_patch.critic_score != null ? `${c.raw_patch.critic_score}/100` : null,
  },
  {
    key: "community_score",
    label: "metadata_resolution.field_community",
    description: "metadata_resolution.field_community_desc",
    icon: <Star className="w-3.5 h-3.5 text-emerald-400" />,
    isPresent: (g) => g.community_score !== null && g.community_score !== undefined,
    getValueSummary: (c) =>
      c.raw_patch.community_score != null ? `${c.raw_patch.community_score}%` : null,
  },
  {
    key: "links",
    label: "metadata_resolution.field_links",
    description: "metadata_resolution.field_links_desc",
    icon: <ExternalLink className="w-3.5 h-3.5 text-blue-300" />,
    isPresent: (g) => Boolean(g.custom_links && g.custom_links.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.custom_links && c.raw_patch.custom_links.length > 0
        ? `${c.raw_patch.custom_links.length} collegamenti`
        : null,
  },
];

const AVAILABLE_FIELDS: FieldOption[] = FIELD_DEFINITIONS.map(
  ({ key, label, description, icon }) => ({
    key,
    label,
    description,
    icon,
  })
);

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

  const isFieldPresent = (key: string): boolean => {
    if (!game) return false;
    const def = FIELD_DEFINITIONS.find((d) => d.key === key);
    return def ? def.isPresent(game) : false;
  };

  // Compute missing fields so that existing fields are not overwritten by default
  const computeMissingFields = (): string[] => {
    if (!game) return [];
    return FIELD_DEFINITIONS.filter((d) => d.key !== "name" && !d.isPresent(game)).map(
      (d) => d.key
    );
  };

  const getCandidateValueSummary = (cand: MetadataCandidateDto, key: string): string | null => {
    const def = FIELD_DEFINITIONS.find((d) => d.key === key);
    return def ? def.getValueSummary(cand) : null;
  };

  const isCandidateFieldAvailable = (
    cand: MetadataCandidateDto | null,
    key: string
  ): boolean => {
    if (!cand) return false;
    return getCandidateValueSummary(cand, key) !== null;
  };

  const handleSelectCandidate = (cand: MetadataCandidateDto) => {
    setSelectedCandidate(cand);

    // Auto-select fields that are missing in the game AND available in this candidate
    const missing = computeMissingFields();
    const availableMissing = missing.filter((key) =>
      isCandidateFieldAvailable(cand, key)
    );

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
          const enabledMap = new Map(
            list.map((p) => [p.id.toLowerCase(), p.is_enabled])
          );
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
        handleSelectCandidate(result[0]); // Auto-select top match and calibrate available fields
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
    const available = AVAILABLE_FIELDS.filter((f) =>
      isCandidateFieldAvailable(selectedCandidate, f.key)
    ).map((f) => f.key);
    setSelectedFields(available);
  };

  const selectMissingFields = () => {
    if (!selectedCandidate) return;
    const missing = computeMissingFields();
    const availableMissing = missing.filter((key) =>
      isCandidateFieldAvailable(selectedCandidate, key)
    );
    setSelectedFields(availableMissing);
  };

  const selectArtworkOnly = () => {
    if (!selectedCandidate) return;
    const artworkKeys = ["cover_image", "background_image", "icon"];
    setSelectedFields(
      artworkKeys.filter((k) => isCandidateFieldAvailable(selectedCandidate, k))
    );
  };

  const deselectAllFields = () => {
    setSelectedFields([]);
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

  const getProviderBadge = (pId: string) => {
    switch (pId.toLowerCase()) {
      case "steam":
        return { name: "Steam Store", bg: "rgba(23, 53, 77, 0.9)", border: "#66c0f4", text: "#66c0f4" };
      case "gog":
        return { name: "GOG Store", bg: "rgba(50, 15, 70, 0.9)", border: "#a855f7", text: "#c084fc" };
      case "steamgriddb":
        return { name: "SteamGridDB HD", bg: "rgba(35, 38, 46, 0.9)", border: "#e5e7eb", text: "#ffffff" };
      case "opencritic":
        return { name: "OpenCritic", bg: "rgba(50, 20, 20, 0.9)", border: "#f87171", text: "#f87171" };
      case "igdb":
        return { name: "IGDB", bg: "rgba(45, 20, 80, 0.9)", border: "#9146ff", text: "#a970ff" };
      case "howlongtobeat":
      case "hltb":
        return { name: "HLTB", bg: "rgba(20, 45, 40, 0.9)", border: "#34d399", text: "#6ee7b7" };
      default:
        return { name: pId, bg: "rgba(30, 41, 59, 0.9)", border: "#94a3b8", text: "#cbd5e1" };
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
                {t('game_details.identify_metadata')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {t("metadata_resolution.current_title")} <span className="font-medium text-foreground">{game.title}</span> ({game.library})
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
            <span>{isSearching ? t('common.loading') : t('common.search')}</span>
          </Button>
        </div>

        {/* MAIN BODY: 2-COLUMN LAYOUT (CANDIDATES & FIELD CHECKLIST) */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col md:flex-row">
          {/* LEFT: CANDIDATES LIST */}
          <ScrollArea className="flex-1 min-h-0 border-b md:border-b-0 md:border-r border-border">
            <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-medium tracking-wider uppercase text-slate-400">
                {t("metadata_resolution.results", { count: candidates.length })}
              </span>
              {candidates.length > 0 && (
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {t("metadata_resolution.select_hint")}
                </span>
              )}
            </div>

            {isSearching ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <span className="text-xs font-normal text-slate-300">
                  {t("metadata_resolution.searching")}
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
                  {t("metadata_resolution.search_tips")}
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
                      onClick={() => handleSelectCandidate(cand)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex gap-4 items-start ${
                        isSelected
                          ? "ring-2 ring-indigo-500 shadow-lg"
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
                        {cand.cover_url || cand.raw_patch.cover_url ? (
                          <img
                            src={cand.cover_url || cand.raw_patch.cover_url || ""}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-medium text-slate-500">
                            {t("metadata_resolution.no_cover")}
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

                          {(cand.release_year || cand.raw_patch.release_date) && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white/10 text-slate-200">
                              {cand.release_year || cand.raw_patch.release_date?.slice(0, 4)}
                            </span>
                          )}

                          {cand.raw_patch.critic_score != null && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ★ {cand.raw_patch.critic_score}
                            </span>
                          )}

                          {cand.raw_patch.community_score != null && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              {cand.raw_patch.community_score}%
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-semibold text-white truncate">{cand.title}</h4>

                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {cand.description || cand.raw_patch.description || t("metadata_resolution.no_description")}
                        </p>

                        {cand.raw_patch.genres && cand.raw_patch.genres.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-1 overflow-hidden">
                            {cand.raw_patch.genres.slice(0, 3).map((g, gi) => (
                              <span
                                key={gi}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 truncate"
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
          </ScrollArea>

          {/* RIGHT: CHECKLIST "CAMPI DA IMPORTARE" & PREVIEW */}
          <ScrollArea className="w-full md:w-88 lg:w-96 min-h-0 bg-popover">
            <div className="p-6 space-y-5">
            <div>
              <div className="flex items-center justify-between pb-2 flex-wrap gap-1">
                <span className="text-xs font-medium tracking-wider uppercase text-slate-300">
                  {t("metadata_resolution.fields_title")}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={selectAllFields}
                    className="h-auto p-0 text-[11px] text-indigo-400 font-medium"
                  >
                    {t("metadata_resolution.select_all")}
                  </Button>
                  <span className="text-slate-600">•</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={selectMissingFields}
                    className="h-auto p-0 text-[11px] text-amber-400 font-medium"
                  >
                    {t("metadata_resolution.select_missing")}
                  </Button>
                  <span className="text-slate-600">•</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={selectArtworkOnly}
                    className="h-auto p-0 text-[11px] text-cyan-400 font-medium"
                  >
                    {t("metadata_resolution.select_artwork")}
                  </Button>
                  <span className="text-slate-600">•</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={deselectAllFields}
                    className="h-auto p-0 text-[11px] text-muted-foreground font-medium"
                  >
                    {t("metadata_resolution.select_none")}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                {AVAILABLE_FIELDS.map((field) => {
                  const isAvailableInCand = selectedCandidate
                    ? isCandidateFieldAvailable(selectedCandidate, field.key)
                    : true;
                  const isChecked = isAvailableInCand && selectedFields.includes(field.key);
                  const alreadyPresent = isFieldPresent(field.key);
                  const candValue = selectedCandidate
                    ? getCandidateValueSummary(selectedCandidate, field.key)
                    : null;

                  return (
                    <div
                      key={field.key}
                      onClick={() => isAvailableInCand && toggleField(field.key)}
                      className={`p-2.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                        !isAvailableInCand
                          ? "border-slate-800/40 bg-slate-950/30 text-slate-600 opacity-45 cursor-not-allowed"
                          : isChecked
                          ? "border-indigo-500/50 bg-indigo-500/10 text-white cursor-pointer"
                          : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className={`shrink-0 mt-0.5 ${!isAvailableInCand ? "opacity-40" : ""}`}>
                          {field.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              className={`text-xs font-medium truncate ${
                                !isAvailableInCand ? "text-slate-500" : ""
                              }`}
                            >
                              {t(field.label)}
                            </p>

                            {alreadyPresent ? (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 font-medium">
                                {t("metadata_resolution.present")}
                              </span>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300/80 border border-amber-500/20 shrink-0">
                                {t("metadata_resolution.missing")}
                              </span>
                            )}

                            {!isAvailableInCand && selectedCandidate && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-500 border border-slate-700/60 shrink-0 font-medium">
                                {t("metadata_resolution.field_not_available")}
                              </span>
                            )}
                          </div>

                          {selectedCandidate && (
                            <p className="text-[10px] mt-0.5 truncate">
                              {candValue ? (
                                <span className="text-indigo-300 font-normal">
                                  {candValue}
                                </span>
                              ) : (
                                <span className="text-slate-600 italic">
                                  —
                                </span>
                              )}
                            </p>
                          )}

                          {!selectedCandidate && (
                            <p className="text-[10px] text-slate-400 truncate">{t(field.description)}</p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {!isAvailableInCand ? (
                          <Square className="w-4 h-4 text-slate-800" />
                        ) : isChecked ? (
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
                  {t("metadata_resolution.preview")}
                </span>

                <div className="space-y-2">
                  {(selectedCandidate.background_url || selectedCandidate.raw_patch.background_url) && (
                    <div className="w-full h-24 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                      <img
                        src={selectedCandidate.background_url || selectedCandidate.raw_patch.background_url || ""}
                        alt={t("metadata_resolution.hero_preview")}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {(selectedCandidate.cover_url || selectedCandidate.raw_patch.cover_url) && (
                      <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden border border-white/10 shrink-0">
                        <img
                          src={selectedCandidate.cover_url || selectedCandidate.raw_patch.cover_url || ""}
                          alt={t("metadata_resolution.cover_preview")}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">
                        {selectedCandidate.title}
                      </p>
                      <p className="text-[11px] text-indigo-400 font-medium">
                        {t("metadata_resolution.fields_selected", { count: selectedFields.length })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
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
                {t("metadata_resolution.ready")} <strong className="font-semibold text-foreground">{selectedCandidate.title}</strong>
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
              <span>{isApplying ? t("metadata_resolution.applying") : t("metadata_resolution.apply")}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isApplying}
              className="px-5 py-2.5 h-auto font-medium"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
