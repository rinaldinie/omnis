import React from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TranslateFn } from "../../../types";
import { getProviderBadge, type MetadataCandidateDto } from "./types";

export interface CandidatesListPaneProps {
  candidates: MetadataCandidateDto[];
  selectedCandidate: MetadataCandidateDto | null;
  onSelectCandidate: (cand: MetadataCandidateDto) => void;
  isSearching: boolean;
  searchError: string | null;
  t: TranslateFn;
}

export const CandidatesListPane: React.FC<CandidatesListPaneProps> = ({
  candidates,
  selectedCandidate,
  onSelectCandidate,
  isSearching,
  searchError,
  t,
}) => {
  return (
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
            <p className="text-xs text-slate-400">{t("metadata_resolution.search_tips")}</p>
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
                  onClick={() => onSelectCandidate(cand)}
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
                      {cand.description ||
                        cand.raw_patch.description ||
                        t("metadata_resolution.no_description")}
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
  );
};
