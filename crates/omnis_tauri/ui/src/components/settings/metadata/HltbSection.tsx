import React from "react";
import { Clock, RefreshCw, Check, CheckCircle2, AlertCircle, Key, ExternalLink } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { openExternalUrl } from "../../../utils/openUrl";
import { ProviderInfo } from "../../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "../SettingsControls";
import { Button } from "@/components/ui/button";

export interface HltbSectionProps {
  provider?: ProviderInfo;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  isSaving: boolean;
  testStatus?: { loading: boolean; success?: boolean; message?: string };
}

export const HltbSection: React.FC<HltbSectionProps> = ({
  provider,
  onToggleEnabled,
  onSave,
  onTest,
  isSaving,
  testStatus,
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
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">HowLongToBeat</h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-slate-400">
                Native Scraper
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              {t("metadata_settings.hltb_desc", {
                defaultValue: "Download community playtimes for Main Story, Main + Extra, and 100% Completionist styles.",
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
          <ToggleSwitch checked={isEnabled} onChange={(val) => onToggleEnabled(val)} ariaLabel="Toggle HowLongToBeat provider" />
        </div>
      </div>

      {/* Details Group */}
      <SettingGroup
        title={t("metadata_settings.hltb_integration_title", {
          defaultValue: "HLTB Scraper Information",
        })}
        description={t("metadata_settings.hltb_integration_desc", {
          defaultValue: "HLTB enriches game details with crowd-sourced completion times for various play styles.",
        })}
      >
        <SettingRow
          title={t("metadata_settings.public_scraper", { defaultValue: "Public Scraper" })}
          description={
            <span>
              {t("metadata_settings.hltb_scraper_desc", {
                defaultValue: "Data is gathered via anonymous scraping optimized with rate-limiting and local caching.",
              })}{" "}
              <a
                href="https://howlongtobeat.com"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalUrl("https://howlongtobeat.com");
                }}
                className="inline-flex items-center gap-1 font-semibold hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                HowLongToBeat.com <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          }
        >
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
            <CheckCircle2 className="w-4 h-4" />{" "}
            {t("metadata_settings.no_api_key_required", { defaultValue: "No API Key required" })}
          </div>
        </SettingRow>
      </SettingGroup>

      {/* Action Footer */}
      <div
        className="p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/20"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="flex items-center gap-2 text-xs">
          {testStatus?.loading ? (
            <span className="flex items-center gap-1.5 text-sky-400">
              <RefreshCw className="w-4 h-4 animate-spin" />{" "}
              {t("metadata_settings.verifying_hltb", { defaultValue: "Checking HLTB endpoint..." })}
            </span>
          ) : testStatus?.success === true ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> {testStatus.message}
            </span>
          ) : testStatus?.success === false ? (
            <span className="flex items-center gap-1.5 text-rose-400">
              <AlertCircle className="w-4 h-4" /> {testStatus.message}
            </span>
          ) : (
            <span className="text-slate-400">
              {t("metadata_settings.verify_service_reachability", {
                defaultValue: "Check reachability of the HowLongToBeat service",
              })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            onClick={onTest}
            disabled={testStatus?.loading}
            className="h-auto px-4 py-2 rounded-xl text-xs font-bold border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 text-white gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />{" "}
            <span>{t("metadata_settings.btn_test_connection", { defaultValue: "Test Connection" })}</span>
          </Button>
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
    </div>
  );
};
