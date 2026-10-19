import React from "react";
import { Check } from "lucide-react";

interface LocalStoreCardProps {
  name: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  cardBorder: string;
  badgeColor: { bg: string; text: string; border: string };
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
}) => {
  return (
    <div
      className="p-4 rounded-2xl border flex items-center justify-between gap-3"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: cardBorder,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
          style={{
            background: iconBg,
            borderColor: iconBorder,
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h5 className="text-xs font-bold text-white flex items-center gap-1.5">
            {name}
            <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono ${badgeColor.bg} ${badgeColor.text}`}>
              {badge}
            </span>
          </h5>
          <p className="text-[11px] truncate text-slate-400">
            {description}
          </p>
        </div>
      </div>
      <span className={`shrink-0 flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${badgeColor.bg} ${badgeColor.text} border ${badgeColor.border}`}>
        <Check className="w-3 h-3" />
        Attivo
      </span>
    </div>
  );
};
