import React from "react";
import { Sparkles } from "lucide-react";
import { GameEditorFormData } from "./types";
import { useTranslation } from "../../../i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
  const { t } = useTranslation();
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
          {t("editor_description.synopsis")}
        </label>
        <Textarea
          rows={7}
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="px-4 py-3 text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 focus-visible:border-indigo-500"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
          placeholder={t("editor_description.synopsis_placeholder")}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t("editor_description.features")}</span>
          </label>
          <span className="text-[10px] text-slate-500">{t("editor_description.comma_separated")}</span>
        </div>

        <Input
          type="text"
          value={formData.featuresText}
          onChange={(e) => onChange({ featuresText: e.target.value })}
          className="h-10 px-4 py-2.5"
          placeholder={t("editor_description.features_placeholder")}
        />

        {/* Quick Suggestion Chips */}
        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] font-semibold text-slate-400">{t("editor_description.suggestions")}</span>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_KEY_FEATURES.map((feature) => {
              const isSelected = currentFeatures.some(
                (f) => f.toLowerCase() === feature.toLowerCase()
              );
              return (
                <Button
                  key={feature}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => toggleFeature(feature)}
                  className={`h-auto px-2.5 py-1 text-xs font-medium ${
                    isSelected
                      ? "bg-indigo-600/30 border-indigo-500 text-indigo-200 hover:bg-indigo-600/40 shadow-sm"
                      : "bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-slate-300 hover:text-white"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? "bg-indigo-400" : "bg-slate-500"
                    }`}
                  />
                  <span>{feature}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
