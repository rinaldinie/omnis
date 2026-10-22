import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lock, Eye, Sparkles, Award } from "lucide-react";
import { Achievement } from "../../types";

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: "md" | "lg";
  isFocused?: boolean;
  onClick?: () => void;
  onFocus?: () => void;
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievement,
  size = "md",
  isFocused = false,
  onClick,
  onFocus,
}) => {
  const [revealed, setRevealed] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const isUltraRare =
    achievement.rarity_percentage !== null &&
    achievement.rarity_percentage !== undefined &&
    achievement.rarity_percentage < 10.0;

  const isRare =
    achievement.rarity_percentage !== null &&
    achievement.rarity_percentage !== undefined &&
    achievement.rarity_percentage >= 10.0 &&
    achievement.rarity_percentage < 25.0;

  const isSecretLocked =
    achievement.is_hidden && !achievement.is_unlocked && !revealed;

  // Resolve image source
  const imageSource = React.useMemo(() => {
    if (achievement.local_icon_path) {
      try {
        return convertFileSrc(achievement.local_icon_path);
      } catch {
        return achievement.icon_unlocked_url;
      }
    }
    if (achievement.is_unlocked || !achievement.icon_locked_url) {
      return achievement.icon_unlocked_url;
    }
    return achievement.icon_locked_url;
  }, [
    achievement.local_icon_path,
    achievement.icon_unlocked_url,
    achievement.icon_locked_url,
    achievement.is_unlocked,
  ]);

  const sizeClasses =
    size === "lg" ? "w-[72px] h-[72px]" : "w-[56px] h-[56px]";

  const formatUnlockDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="relative group select-none outline-hidden"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => {
        setShowTooltip(true);
        onFocus?.();
      }}
      onBlur={() => setShowTooltip(false)}
      onClick={onClick}
      tabIndex={0}
    >
      <div
        className={`relative ${sizeClasses} rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 transform ${
          isFocused
            ? "scale-110 ring-4 ring-indigo-500 shadow-2xl z-20"
            : "hover:scale-105"
        } ${
          isUltraRare && achievement.is_unlocked
            ? "ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]"
            : isRare && achievement.is_unlocked
            ? "ring-1.5 ring-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.35)]"
            : "border border-white/10"
        } ${
          achievement.is_unlocked
            ? "bg-slate-900"
            : "bg-slate-950/80 grayscale contrast-125"
        }`}
      >
        {isSecretLocked ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 text-slate-500">
            <span className="text-xl font-black">?</span>
            <Lock className="w-3.5 h-3.5 text-slate-500/80 mt-0.5" />
          </div>
        ) : !imgError && imageSource ? (
          <img
            src={imageSource}
            alt={achievement.display_name}
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              achievement.is_unlocked ? "opacity-100" : "opacity-35"
            }`}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
            <Award className="w-6 h-6" />
          </div>
        )}

        {/* Locked padlock overlay */}
        {!achievement.is_unlocked && !isSecretLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Lock className="w-4 h-4 text-white/70 drop-shadow-md" />
          </div>
        )}

        {/* Ultra-rare sparkles marker */}
        {isUltraRare && achievement.is_unlocked && (
          <div className="absolute top-1 right-1 p-0.5 bg-amber-500/90 rounded-full shadow-xs">
            <Sparkles className="w-2.5 h-2.5 text-slate-950" />
          </div>
        )}

        {/* Gamerscore points pill */}
        {achievement.points !== null && achievement.points !== undefined && (
          <div className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/75 backdrop-blur-xs rounded text-[9px] font-black text-emerald-400 border border-emerald-500/30">
            {achievement.points}G
          </div>
        )}
      </div>

      {/* Interactive Tooltip Popover */}
      {(showTooltip || isFocused) && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl z-50 pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: isUltraRare
              ? "rgba(251, 191, 36, 0.6)"
              : "rgba(255, 255, 255, 0.12)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-slate-800 border border-white/10">
              {isSecretLocked ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-lg">
                  ?
                </div>
              ) : (
                <img
                  src={imageSource}
                  alt=""
                  className={`w-full h-full object-cover ${
                    achievement.is_unlocked ? "" : "grayscale opacity-50"
                  }`}
                />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-xs font-black text-white truncate">
                  {isSecretLocked ? "Obiettivo Segreto" : achievement.display_name}
                </h4>
                {achievement.points !== null && achievement.points !== undefined && (
                  <span className="text-[10px] font-black text-emerald-400 shrink-0">
                    +{achievement.points} G
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                {achievement.is_unlocked ? (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    ✓ Sbloccato
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Bloccato
                  </span>
                )}

                {achievement.rarity_percentage !== null &&
                  achievement.rarity_percentage !== undefined && (
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        isUltraRare
                          ? "bg-amber-400/20 text-amber-300 border border-amber-400/40"
                          : isRare
                          ? "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                          : "bg-white/10 text-slate-300"
                      }`}
                    >
                      {achievement.rarity_percentage.toFixed(1)}%
                    </span>
                  )}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="mt-2.5 pt-2 border-t border-white/10">
            {isSecretLocked ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-400 italic">
                  I dettagli di questo obiettivo sono nascosti per evitare spoiler.
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevealed(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Eye className="w-3 h-3" /> Rivela dettagli segreti
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-200 leading-relaxed">
                {achievement.description || "Nessuna descrizione disponibile."}
              </p>
            )}

            {achievement.unlock_time && (
              <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Data sblocco:</span>
                <span className="text-white font-medium">
                  {formatUnlockDate(achievement.unlock_time)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
