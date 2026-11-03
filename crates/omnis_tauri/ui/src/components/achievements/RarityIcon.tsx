import React from "react";
import { Sparkles, Trophy, Medal, Award } from "lucide-react";
import { RarityTier } from "./useGameAchievements";

export interface RarityIconProps {
  tier: RarityTier;
  className?: string;
}

/** Distinctive icon for each achievement rarity tier */
export const RarityIcon: React.FC<RarityIconProps> = ({
  tier,
  className = "w-4 h-4",
}) => {
  switch (tier) {
    case "ultra_rare":
      return <Sparkles className={className} />;
    case "rare":
      return <Trophy className={className} />;
    case "uncommon":
      return <Medal className={className} />;
    case "common":
    default:
      return <Award className={className} />;
  }
};

/** Visual classes and colors for rarity tier representation across the UI */
export function getRarityBadgeClasses(tier: RarityTier): {
  bg: string;
  text: string;
  border: string;
  markerBadge: string;
  glow: string;
} {
  switch (tier) {
    case "ultra_rare":
      return {
        bg: "bg-amber-400/20",
        text: "text-amber-300",
        border: "border-amber-400/40",
        markerBadge: "bg-amber-500/90 text-slate-950 shadow-xs",
        glow: "ring-2 ring-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.45)]",
      };
    case "rare":
      return {
        bg: "bg-amber-500/20",
        text: "text-amber-400",
        border: "border-amber-500/40",
        markerBadge: "bg-amber-500 text-slate-950 shadow-xs",
        glow: "ring-1.5 ring-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.3)]",
      };
    case "uncommon":
      return {
        bg: "bg-sky-400/20",
        text: "text-sky-300",
        border: "border-sky-400/40",
        markerBadge: "bg-sky-400 text-slate-950 shadow-xs",
        glow: "ring-1.5 ring-sky-400/80 shadow-[0_0_10px_rgba(56,189,248,0.25)]",
      };
    case "common":
    default:
      return {
        bg: "bg-slate-400/15",
        text: "text-slate-300",
        border: "border-slate-400/30",
        markerBadge: "bg-slate-500 text-white shadow-xs",
        glow: "border border-white/10",
      };
  }
}
