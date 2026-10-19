import React from "react";
import { Gamepad2 } from "lucide-react";

interface FutureStoreCardProps {
  name: string;
  publisher: string;
  color: string;
}

export const FutureStoreCard: React.FC<FutureStoreCardProps> = ({ name, publisher, color }) => {
  return (
    <div
      className="p-3 rounded-2xl border flex items-center justify-between gap-2.5 opacity-75 hover:opacity-100 transition-all"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border text-xs font-black"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "var(--border-color)",
            color: color,
          }}
        >
          <Gamepad2 className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold text-white truncate">{name}</div>
          <div className="text-[10px] text-slate-400 truncate">{publisher}</div>
        </div>
      </div>
      <span className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
        Prossimamente
      </span>
    </div>
  );
};
