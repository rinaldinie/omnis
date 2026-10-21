import React from "react";
import { Sparkles } from "lucide-react";
import { GameEditorFormData } from "./types";

interface DescriptionTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
}

const COMMON_KEY_FEATURES = [
  "Single-player",
  "Multi-player",
  "Online Co-op",
  "Full controller support",
  "Cloud Saves",
  "Steam Achievements",
  "Ray Tracing",
  "HDR",
  "Cross-Platform Saves",
  "VR Supported",
];

export const DescriptionTab: React.FC<DescriptionTabProps> = ({ formData, onChange }) => {
  const currentFeatures = (formData.featuresText || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const toggleFeature = (feature: string) => {
    const exists = currentFeatures.some((f) => f.toLowerCase() === feature.toLowerCase());
    let next: string[];
    if (exists) {
      next = currentFeatures.filter((f) => f.toLowerCase() !== feature.toLowerCase());
    } else {
      next = [...currentFeatures, feature];
    }
    onChange({ featuresText: next.join(", ") });
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-medium mb-1.5 text-slate-300">
          Sinossi / Descrizione Ufficiale
        </label>
        <textarea
          rows={7}
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full px-4 py-3 rounded-xl border text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          placeholder="Inserisci qui la sinossi o descrizione del gioco..."
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Caratteristiche Principali / Key Features (Playnite Parity)</span>
          </label>
          <span className="text-[10px] text-slate-500">Valori separati da virgola</span>
        </div>

        <input
          type="text"
          value={formData.featuresText}
          onChange={(e) => onChange({ featuresText: e.target.value })}
          className="w-full px-4 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          placeholder="es. Single-player, Full controller support, Cloud Saves, Ray Tracing"
        />

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400">Suggeriti rapidi:</span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_KEY_FEATURES.map((feature) => {
              const isSelected = currentFeatures.some(
                (f) => f.toLowerCase() === feature.toLowerCase()
              );
              return (
                <button
                  key={feature}
                  type="button"
                  onClick={() => toggleFeature(feature)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 shadow-sm"
                      : "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? "bg-indigo-400" : "bg-slate-500"
                    }`}
                  />
                  <span>{feature}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
