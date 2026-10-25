import React from "react";
import { Check, XCircle } from "lucide-react";
import { useTranslation } from "../../i18n";

interface LocalStoreCardProps {
  name: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  cardBorder: string;
  badgeColor: { bg: string; text: string; border: string };
  isDetected: boolean;
}

export const LocalStoreCard: React.FC<LocalStoreCardProps> = ({
  name,
  badge,
  description,
  icon,
  iconBg,
  iconBorder,
  cardBorder,
  badgeColor,
  isDetected,
}) => {
  const { t } = useTranslation();
  return (
    <div
      className="p-4 rounded-2xl border flex items-center justify-between gap-3 transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: isDetected ? cardBorder : "rgba(255, 255, 255, 0.08)",
        opacity: isDetected ? 1 : 0.7,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background: iconBg,
            borderColor: isDetected ? iconBorder : "rgba(255, 255, 255, 0.15)",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h5 className="text-xs font-bold text-white">
              {name}
            </h5>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono shrink-0 ${badgeColor.bg} ${badgeColor.text}`}>
              {badge}
            </span>
          </div>
          <p className="text-[11px] truncate text-slate-400 mt-0.5">
            {description}
          </p>
        </div>
      </div>
      {isDetected ? (
        <span className={`shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeColor.bg} ${badgeColor.text} border ${badgeColor.border} whitespace-nowrap`}>
          <Check className="w-3 h-3" />
          {t("store_accounts.detected")}
        </span>
      ) : (
        <span className="shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20 whitespace-nowrap">
          <XCircle className="w-3 h-3 text-slate-500" />
          {t("store_accounts.not_found")}
        </span>
      )}
    </div>
  );
};

