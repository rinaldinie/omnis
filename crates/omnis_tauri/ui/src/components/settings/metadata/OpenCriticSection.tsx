import React from "react";
import { Award, RefreshCw, Check, CheckCircle2, ExternalLink } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { openExternalUrl } from "../../../utils/openUrl";
import { ProviderInfo } from "../../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "../SettingsControls";
import { Button } from "@/components/ui/button";

export interface OpenCriticSectionProps {
  provider?: ProviderInfo;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
  isSaving: boolean;
}

export const OpenCriticSection: React.FC<OpenCriticSectionProps> = ({
  provider,
  onToggleEnabled,
  onSave,
  isSaving,
}) => {
  const { t } = useTranslation();
  const isEnabled = provider?.is_enabled ?? true;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div
        className="p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              color: "var(--accent-primary)",
            }}
          >
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">OpenCritic</h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-slate-400">
                Native Scores
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              {t("metadata_settings.opencritic_desc", {
                defaultValue: "Aggregate critic reviews and tier badges from top gaming outlets without requiring an API key.",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-center">
          <span className="text-xs font-semibold text-slate-300">
            {isEnabled
              ? t("common.enabled", { defaultValue: "Enabled" })
              : t("common.disabled", { defaultValue: "Disabled" })}
          </span>
          <ToggleSwitch checked={isEnabled} onChange={(val) => onToggleEnabled(val)} ariaLabel="Toggle OpenCritic provider" />
        </div>
      </div>

      {/* Info Group */}
      <SettingGroup
        title={t("metadata_settings.opencritic_info_title", {
          defaultValue: "OpenCritic Integration",
        })}
        description={t("metadata_settings.opencritic_info_desc", {
          defaultValue: "OpenCritic provides critic recommendation percentages and average review scores.",
        })}
      >
        <SettingRow
          title={t("metadata_settings.public_source", { defaultValue: "Public Source" })}
          description={
            <span>
              {t("metadata_settings.opencritic_public_desc", {
                defaultValue: "Data is queried via OpenCritic public endpoints. No registration or API key required.",
              })}{" "}
              <a
                href="https://opencritic.com"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalUrl("https://opencritic.com");
                }}
                className="inline-flex items-center gap-1 font-semibold hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                OpenCritic.com <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          }
        >
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
            <CheckCircle2 className="w-4 h-4" />{" "}
            {t("metadata_settings.ready_to_use", { defaultValue: "Ready to use" })}
          </div>
        </SettingRow>
      </SettingGroup>

      {/* Save Footer */}
      <div
        className="p-4 rounded-2xl border flex items-center justify-between gap-3 bg-black/20"
        style={{ borderColor: "var(--border-color)" }}
      >
        <span className="text-xs text-slate-400">
          {t("metadata_settings.immediate_effect_note", {
            defaultValue: "Changes take effect immediately on subsequent scrapes.",
          })}
        </span>
        <Button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="h-auto px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 gap-1.5"
          style={{ backgroundColor: "var(--accent-primary)" }}
        >
          {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>{t("common.save", { defaultValue: "Save" })}</span>
        </Button>
      </div>
    </div>
  );
};
