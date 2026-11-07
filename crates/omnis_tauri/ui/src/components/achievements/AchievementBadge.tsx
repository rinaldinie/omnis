import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lock, Eye, Award } from "lucide-react";
import { Achievement } from "../../types";
import { useTranslation } from "../../i18n/i18nContext";
import {
  AchievementsConfig,
  useAchievementsConfig,
} from "./AchievementsSettingsTab";
import {
  getRarityTier,
  getRarityColor,
} from "./useGameAchievements";
import { RarityIcon, getRarityBadgeClasses } from "./RarityIcon";

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: "md" | "lg";
  isFocused?: boolean;
  onClick?: () => void;
  onFocus?: () => void;
  config?: AchievementsConfig;
}

export const AchievementBadge: React.FC<AchievementBadgeProps> = ({
  achievement,
  size,
  isFocused = false,
  onClick,
  onFocus,
  config: propConfig,
}) => {
  const { t, locale } = useTranslation();
  const activeConfig = useAchievementsConfig();
  const config = propConfig ?? activeConfig;

  const [revealed, setRevealed] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const badgeRef = React.useRef<HTMLDivElement>(null);
  const [horizontalAlign, setHorizontalAlign] = useState<"center" | "left" | "right">("center");
  const [verticalAlign, setVerticalAlign] = useState<"top" | "bottom">("top");

  // Dynamically compute boundary-safe tooltip positioning
  React.useEffect(() => {
    if (!showTooltip && !isFocused) return;
    if (!badgeRef.current) return;

    const badgeEl = badgeRef.current;
    const badgeRect = badgeEl.getBoundingClientRect();
    const container =
      badgeEl.closest(".overflow-y-auto, [data-omnis='fullscreen'], [data-omnis='bigpicture'], main, body") ||
      document.body;
    const containerRect = container.getBoundingClientRect();

    const tooltipWidth = 288; // w-72 = 18rem = 288px
    const halfWidth = tooltipWidth / 2;

    const spaceLeft = badgeRect.left - containerRect.left;
    const spaceRight = containerRect.right - badgeRect.right;

    // Check if centering overflows to the left or right of the container
    if (spaceLeft < halfWidth - badgeRect.width / 2 + 12) {
      setHorizontalAlign("left");
    } else if (spaceRight < halfWidth - badgeRect.width / 2 + 12) {
      setHorizontalAlign("right");
    } else {
      setHorizontalAlign("center");
    }

    // Check vertical space (if badge is too close to top of container or viewport)
    const spaceTop = Math.min(badgeRect.top - containerRect.top, badgeRect.top);
    if (spaceTop < 180) {
      setVerticalAlign("bottom");
    } else {
      setVerticalAlign("top");
    }
  }, [showTooltip, isFocused]);

  const positionClasses = React.useMemo(() => {
    const vClass = verticalAlign === "bottom" ? "top-full mt-3" : "bottom-full mb-3";
    let hClass = "left-1/2 -translate-x-1/2";
    if (horizontalAlign === "left") {
      hClass = "left-0 translate-x-0";
    } else if (horizontalAlign === "right") {
      hClass = "right-0 left-auto translate-x-0";
    }
    return `${vClass} ${hClass}`;
  }, [horizontalAlign, verticalAlign]);

  const tier = getRarityTier(
    achievement.rarity_percentage,
    config.ultraRareThreshold,
    config.rareThreshold,
    config.uncommonThreshold
  );
  const rarityClasses = getRarityBadgeClasses(tier);

  const isSecretLocked =
    achievement.is_hidden &&
    !achievement.is_unlocked &&
    !revealed &&
    !config.revealSecretsByDefault;

  // Resolve image source
  const imageSource = React.useMemo(() => {
    let raw: string;
    if (achievement.local_icon_path) {
      try {
        return convertFileSrc(achievement.local_icon_path);
      } catch {
        raw = achievement.icon_unlocked_url;
      }
    } else if (achievement.is_unlocked || !achievement.icon_locked_url) {
      raw = achievement.icon_unlocked_url;
    } else {
      raw = achievement.icon_locked_url;
    }

    if (raw && raw.includes("images-eds.xboxlive.com/")) {
      raw = raw.replace("images-eds.xboxlive.com/", "images-eds-ssl.xboxlive.com/");
    }
    if (
      raw &&
      raw.includes("images-eds-ssl.xboxlive.com/image?url=") &&
      !raw.includes("&w=") &&
      !raw.includes("&h=")
    ) {
      raw = `${raw}&format=png&w=128&h=128`;
    }
    return raw;
  }, [
    achievement.local_icon_path,
    achievement.icon_unlocked_url,
    achievement.icon_locked_url,
    achievement.is_unlocked,
  ]);

  const effectiveSize = size || config.badgeSize || "md";
  const sizeClasses =
    effectiveSize === "lg" ? "w-[72px] h-[72px]" : "w-[56px] h-[56px]";

  const formatUnlockDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(locale, {
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
      ref={badgeRef}
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
          achievement.rarity_percentage !== null &&
          achievement.rarity_percentage !== undefined
            ? achievement.is_unlocked
              ? tier === "ultra_rare" && !config.goldenGlowUltraRare
                ? "border-2 border-amber-400/80"
                : rarityClasses.glow
              : `border ${rarityClasses.border}`
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

        {/* Rarity marker */}
        {config.showRarityBadges &&
          achievement.rarity_percentage !== null &&
          achievement.rarity_percentage !== undefined && (
            <div
              className={`absolute top-1 right-1 p-0.5 rounded-full ${
                achievement.is_unlocked
                  ? rarityClasses.markerBadge
                  : `${rarityClasses.bg} ${rarityClasses.text} border ${rarityClasses.border}`
              }`}
              title={t("achievements.tier_" + tier)}
            >
              <RarityIcon tier={tier} className="w-2.5 h-2.5" />
            </div>
          )}

        {/* Gamerscore points pill */}
        {config.showPoints && achievement.points !== null && achievement.points !== undefined && (
          <div className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/75 backdrop-blur-xs rounded text-[9px] font-black text-emerald-400 border border-emerald-500/30">
            {achievement.points}G
          </div>
        )}
      </div>

      {/* Interactive Tooltip Popover */}
      {(showTooltip || isFocused) && (
        <div
          className={`absolute ${positionClasses} w-72 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl z-50 pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150`}
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            borderColor: getRarityColor(
              achievement.rarity_percentage,
              config.ultraRareThreshold,
              config.rareThreshold,
              config.uncommonThreshold
            ),
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
                  {isSecretLocked
                    ? t("achievements.secret_title")
                    : achievement.display_name}
                </h4>
                {config.showPoints && achievement.points !== null && achievement.points !== undefined && (
                  <span className="text-[10px] font-black text-emerald-400 shrink-0">
                    +{achievement.points} G
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {achievement.is_unlocked ? (
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                    ✓ {t("achievements.unlocked")}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> {t("achievements.locked")}
                  </span>
                )}

                {config.showRarityBadges &&
                  achievement.rarity_percentage !== null &&
                  achievement.rarity_percentage !== undefined && (
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.5 rounded-full flex items-center gap-1 border ${rarityClasses.bg} ${rarityClasses.text} ${rarityClasses.border}`}
                    >
                      <RarityIcon tier={tier} className="w-2.5 h-2.5 shrink-0" />
                      <span>{t("achievements.tier_" + tier)}</span>
                      <span className="opacity-70 font-mono">({achievement.rarity_percentage.toFixed(1)}%)</span>
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
                  {t("achievements.secret_desc")}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRevealed(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Eye className="w-3 h-3" />{" "}
                  {t("achievements.reveal")}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-slate-200 leading-relaxed">
                {achievement.description || t("achievements.no_desc")}
              </p>
            )}

            {achievement.unlock_time && (
              <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                <span>{t("achievements.unlocked_on")}</span>
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
