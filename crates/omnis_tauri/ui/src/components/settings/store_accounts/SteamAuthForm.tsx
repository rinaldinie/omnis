import React from "react";
import { ExternalLink } from "lucide-react";
import { openExternalUrl } from "../../../utils/openUrl";
import { useTranslation } from "../../../i18n/i18nContext";
import { StoreIntegrationSettings } from "../../store_accounts/types";
import { Input } from "@/components/ui/input";

export interface SteamAuthFormProps {
  settings: StoreIntegrationSettings;
  updateSetting: <K extends keyof StoreIntegrationSettings>(
    key: K,
    value: StoreIntegrationSettings[K]
  ) => void;
}

export const SteamAuthForm: React.FC<SteamAuthFormProps> = ({
  settings,
  updateSetting,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className="p-4 rounded-2xl border space-y-4 shadow-xs"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-bold text-white block">
            {t("store_accounts.steam_credentials")}
          </label>
        </div>
        <span
          className="text-[10px] uppercase font-mono px-2 py-0.5 rounded border"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
            borderColor: "color-mix(in srgb, var(--accent-primary) 30%, transparent)",
            color: "var(--accent-primary)",
          }}
        >
          {t("store_accounts.required_for_achievements")}
        </span>
      </div>

      {/* ID Account Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-slate-300">
            {t("store_accounts.account_id")}
          </label>
          <a
            href="https://steamcommunity.com/my"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl("https://steamcommunity.com/my");
            }}
            className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: "var(--accent-primary)" }}
          >
            <span>{t("store_accounts.get_account_id")}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Input
          type="text"
          value={settings.account_id || ""}
          onChange={(e) => updateSetting("account_id", e.target.value.trim())}
          placeholder={t("store_accounts.account_id_placeholder")}
          className="h-auto w-full bg-slate-900/90 border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 shadow-inner"
          style={{ borderColor: "var(--border-color)" }}
        />
      </div>

      {/* Chiave API Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-slate-300">
            {t("store_accounts.api_key")}
          </label>
          <a
            href="https://steamcommunity.com/dev/apikey"
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl("https://steamcommunity.com/dev/apikey");
            }}
            className="text-xs font-bold inline-flex items-center gap-1 cursor-pointer hover:underline"
            style={{ color: "var(--accent-primary)" }}
          >
            <span>{t("store_accounts.get_api_key")}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <Input
          type="password"
          value={settings.api_key || ""}
          onChange={(e) => updateSetting("api_key", e.target.value.trim())}
          placeholder={t("store_accounts.api_key_placeholder")}
          className="h-auto w-full bg-slate-900/90 border-white/20 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 shadow-inner"
          style={{ borderColor: "var(--border-color)" }}
        />
      </div>
    </div>
  );
};
