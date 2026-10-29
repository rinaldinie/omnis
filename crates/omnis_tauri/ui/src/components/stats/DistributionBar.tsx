import React from "react";
import { CategoryShareDto } from "../../types";
import {
  SteamIcon,
  GogIcon,
  EpicIcon,
  XboxIcon,
  AmazonIcon,
  EaIcon,
  UbisoftIcon,
  BattlenetIcon,
  ItchIcon,
  StoreIcon,
} from "../StoreBadge";
import { Gamepad2 } from "lucide-react";

interface DistributionBarProps {
  title: string;
  items: CategoryShareDto[];
  type: "store" | "genre";
}

const STORE_COLORS: Record<string, string> = {
  steam: "#2a475e",
  gog: "#86328a",
  epic: "#0078f2",
  xbox: "#107c10",
  amazon: "#ff9900",
  ea: "#ff4747",
  ubisoft: "#0070ff",
  battlenet: "#00aeef",
  itch: "#fa5c5c",
  custom: "#6366f1",
};

const GENRE_PALETTE = [
  "#6366f1", // Indigo
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#06b6d4", // Cyan
  "#f97316", // Orange
  "#64748b", // Slate
];

export default function DistributionBar({ title, items, type }: DistributionBarProps) {
  const formatDuration = (seconds: number) => {
    if (seconds <= 0) return "0m";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
  };

  const getColor = (name: string, index: number) => {
    if (type === "store") {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return STORE_COLORS[key] || GENRE_PALETTE[index % GENRE_PALETTE.length];
    }
    return GENRE_PALETTE[index % GENRE_PALETTE.length];
  };

  const renderIcon = (name: string) => {
    if (type === "store") {
      const key = name.toLowerCase();
      if (key.includes("steam")) return <SteamIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("gog")) return <GogIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("epic")) return <EpicIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("xbox")) return <XboxIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("amazon")) return <AmazonIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("ea") || key.includes("origin")) return <EaIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("ubisoft") || key.includes("uplay")) return <UbisoftIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("battle")) return <BattlenetIcon className="w-3.5 h-3.5 shrink-0" />;
      if (key.includes("itch")) return <ItchIcon className="w-3.5 h-3.5 shrink-0" />;
      return <StoreIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
    }
    return <Gamepad2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />;
  };

  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {title}
        </span>
        <span className="text-xs text-slate-400 font-mono">
          {items.length} {type === "store" ? "Store" : "Generi"}
        </span>
      </div>

      {/* Segmented Horizontal Progress Bar */}
      {items.length > 0 ? (
        <>
          <div className="h-3 w-full rounded-full overflow-hidden flex bg-white/[0.04] p-0.5 border border-white/5">
            {items.map((item, idx) => (
              <div
                key={idx}
                title={`${item.name}: ${item.percentage.toFixed(1)}% (${formatDuration(
                  item.duration_seconds
                )})`}
                className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300 hover:opacity-90"
                style={{
                  width: `${Math.max(item.percentage, 1)}%`,
                  backgroundColor: getColor(item.name, idx),
                }}
              />
            ))}
          </div>

          {/* Breakdown List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {items.slice(0, 8).map((item, idx) => {
              const color = getColor(item.name, idx);
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    {renderIcon(item.name)}
                    <span className="truncate font-medium text-slate-200 capitalize">
                      {item.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-400 text-[11px] font-mono">
                      {formatDuration(item.duration_seconds)}
                    </span>
                    <span className="text-emerald-400 font-semibold text-[11px] bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      {item.percentage.toFixed(0)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-xs text-slate-500">
          Nessun dato registrato al momento
        </div>
      )}
    </div>
  );
}
