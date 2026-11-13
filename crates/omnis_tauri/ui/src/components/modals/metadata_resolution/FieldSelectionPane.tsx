import React from "react";
import { CheckSquare, Square } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { GameDto, TranslateFn } from "../../../types";
import type { MetadataCandidateDto } from "./types";
import {
  AVAILABLE_FIELDS,
  getCandidateValueSummary,
  isCandidateFieldAvailable,
  isGameFieldPresent,
} from "./fieldDefinitions";

export interface FieldSelectionPaneProps {
  game: GameDto;
  selectedCandidate: MetadataCandidateDto | null;
  selectedFields: string[];
  onToggleField: (key: string) => void;
  onSelectAll: () => void;
  onSelectMissing: () => void;
  onSelectArtworkOnly: () => void;
  onDeselectAll: () => void;
  t: TranslateFn;
}

export const FieldSelectionPane: React.FC<FieldSelectionPaneProps> = ({
  game,
  selectedCandidate,
  selectedFields,
  onToggleField,
  onSelectAll,
  onSelectMissing,
  onSelectArtworkOnly,
  onDeselectAll,
  t,
}) => {
  return (
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
                onClick={onSelectAll}
                className="h-auto p-0 text-[11px] text-indigo-400 font-medium"
              >
                {t("metadata_resolution.select_all")}
              </Button>
              <span className="text-slate-600">•</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onSelectMissing}
                className="h-auto p-0 text-[11px] text-amber-400 font-medium"
              >
                {t("metadata_resolution.select_missing")}
              </Button>
              <span className="text-slate-600">•</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onSelectArtworkOnly}
                className="h-auto p-0 text-[11px] text-cyan-400 font-medium"
              >
                {t("metadata_resolution.select_artwork")}
              </Button>
              <span className="text-slate-600">•</span>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={onDeselectAll}
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
              const alreadyPresent = isGameFieldPresent(game, field.key);
              const candValue = selectedCandidate
                ? getCandidateValueSummary(selectedCandidate, field.key)
                : null;

              return (
                <div
                  key={field.key}
                  onClick={() => isAvailableInCand && onToggleField(field.key)}
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
                            <span className="text-indigo-300 font-normal">{candValue}</span>
                          ) : (
                            <span className="text-slate-600 italic">—</span>
                          )}
                        </p>
                      )}

                      {!selectedCandidate && (
                        <p className="text-[10px] text-slate-400 truncate">
                          {t(field.description)}
                        </p>
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
                    src={
                      selectedCandidate.background_url ||
                      selectedCandidate.raw_patch.background_url ||
                      ""
                    }
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
  );
};
