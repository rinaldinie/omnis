import React from "react";
import { Image, Key, ExternalLink, RefreshCw, Check, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "../../../i18n";
import { openExternalUrl } from "../../../utils/openUrl";
import { ProviderInfo } from "../../../types";
import { SettingGroup, SettingRow, ToggleSwitch } from "../SettingsControls";

export interface SteamGridDbSectionProps {
  provider?: ProviderInfo;
  settings: Record<string, any>;
  showSecret: boolean;
  onToggleSecret: () => void;
  onSettingChange: (key: string, value: string) => void;
  onToggleEnabled: (enabled: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  isSaving: boolean;
  testStatus?: { loading: boolean; success?: boolean; message?: string };
}

export const SteamGridDbSection: React.FC<SteamGridDbSectionProps> = ({
  provider,
  settings,
  showSecret,
  onToggleSecret,
  onSettingChange,
  onToggleEnabled,
  onSave,
  onTest,
  isSaving,
  testStatus,
}) => {
  const { t } = useTranslation();
  const isEnabled = provider?.is_enabled ?? true;
  const hasKey = provider?.has_configured_key ?? false;

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
            <Image className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">SteamGridDB</h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border border-white/10 bg-white/5 text-slate-400">
                Native Artwork
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-xl">
              {t("metadata_settings.steamgriddb_desc", {
                defaultValue: "Community-driven artwork repository for vertical grids, horizontal banners, hero art, logos, and high-DPI icons.",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-center">
          <span className="text-xs font-semibold text-slate-300">
            {isEnabled ? t("common.enabled", { defaultValue: "Attivo" }) : t("common.disabled", { defaultValue: "Disattivato" })}
          </span>
          <ToggleSwitch checked={isEnabled} onChange={(val) => onToggleEnabled(val)} ariaLabel="Toggle SteamGridDB provider" />
        </div>
      </div>

      {/* Credentials */}
      <SettingGroup
        title={t("metadata_settings.steamgriddb_auth_title", { defaultValue: "Autenticazione SteamGridDB" })}
        description={t("metadata_settings.steamgriddb_auth_desc", {
          defaultValue: "La chiave API personale è necessaria per scaricare artwork ad alta risoluzione direttamente da SteamGridDB.",
        })}
      >
        <SettingRow
          title={t("metadata_settings.api_key_label", { defaultValue: "API Key" })}
          description={
            <span>
              {t("metadata_settings.steamgriddb_key_desc", { defaultValue: "Genera la tua chiave gratuita dalle preferenze profilo di SteamGridDB." })}{" "}
              <a
                href="https://www.steamgriddb.com/profile/preferences/api"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  openExternalUrl("https://www.steamgriddb.com/profile/preferences/api");
                }}
                className="inline-flex items-center gap-1 font-semibold hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                SteamGridDB Preferences <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          }
        >
          <div className="relative w-full max-w-sm flex items-center">
            <input
              type={showSecret ? "text" : "password"}
              value={settings.api_key || ""}
              onChange={(e) => onSettingChange("api_key", e.target.value.trim())}
              placeholder={hasKey && !settings.api_key ? "••••••••••••••••••••••••" : "es. d41d8cd98f00b204e9800998ecf8427e"}
              className="w-full bg-slate-900/90 border rounded-xl pl-3 pr-10 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none"
              style={{ borderColor: "var(--border-color)" }}
            />
            <button
              type="button"
              onClick={onToggleSecret}
              className="absolute right-2.5 text-slate-400 hover:text-white p-1"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
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
              <RefreshCw className="w-4 h-4 animate-spin" /> Verifica connessione in corso...
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
            <span className="text-slate-400">Salva e verifica la chiave API con SteamGridDB</span>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={onTest}
            disabled={testStatus?.loading}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-white/20 bg-white/5 hover:bg-white/10 active:scale-95 text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Key className="w-3.5 h-3.5" /> Test Connessione
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "var(--accent-primary)" }}
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{t("common.save", { defaultValue: "Salva" })}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
