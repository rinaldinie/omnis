import React from "react";
import { LogIn, LogOut } from "lucide-react";
import { useTranslation } from "../../../i18n/i18nContext";
import type { StoreAccount } from "../../../types";
import { formatLastSync } from "./helpers";
import { Button } from "@/components/ui/button";

export interface OAuthStoreSectionProps {
  storeId: string;
  storeName: string;
  account: StoreAccount;
  isLoading: boolean;
  onConnect: () => void;
  onRequestDisconnect: (storeId: string, storeName: string) => void;
}

export const OAuthStoreSection: React.FC<OAuthStoreSectionProps> = ({
  storeId,
  storeName,
  account,
  isLoading,
  onConnect,
  onRequestDisconnect,
}) => {
  const { t, locale } = useTranslation();

  return (
    <div
      className="p-4 rounded-2xl border space-y-3 shadow-xs"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-300">
          {t("store_accounts.cloud_auth")}
        </span>
        {account.last_sync && (
          <span className="text-[11px] text-slate-400">
            {t("store_accounts.last_sync", {
              time: formatLastSync(account.last_sync, locale, t("store_accounts.never_synced")),
            })}
          </span>
        )}
      </div>

      {account.is_connected ? (
        <div
          className="flex items-center justify-between p-3.5 rounded-xl border"
          style={{
            backgroundColor: "color-mix(in srgb, var(--accent-primary) 10%, transparent)",
            borderColor: "color-mix(in srgb, var(--accent-primary) 25%, transparent)",
          }}
        >
          <div className="flex items-center gap-3">
            {account.avatar_url ? (
              <img
                src={account.avatar_url}
                alt="Avatar"
                className="w-8 h-8 rounded-full border object-cover"
                style={{ borderColor: "var(--accent-primary)" }}
              />
            ) : (
              <div
                className="w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent-primary) 20%, transparent)",
                  borderColor: "var(--accent-primary)",
                  color: "var(--accent-primary)",
                }}
              >
                {account.username?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-white">
                {account.username || t("store_accounts.connected_user")}
              </p>
              <p className="text-[11px]" style={{ color: "var(--accent-primary)" }}>
                {t("store_accounts.active_session")}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRequestDisconnect(storeId, storeName)}
            disabled={isLoading}
            className="h-auto px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 text-xs font-bold gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{t("store_accounts.disconnect")}</span>
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/10">
          <p className="text-xs text-slate-400">
            {t("store_accounts.oauth_desc")}
          </p>
          <Button
            type="button"
            onClick={onConnect}
            disabled={isLoading}
            className="h-auto px-4 py-2 rounded-xl text-white text-xs font-bold shadow-md gap-1.5 shrink-0 hover:brightness-110 active:scale-95"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 4px 14px var(--accent-glow)",
            }}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{t("store_accounts.connect")}</span>
          </Button>
        </div>
      )}
    </div>
  );
};
