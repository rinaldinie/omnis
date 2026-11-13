export interface MetadataCandidateDto {
  provider_id: string;
  provider_game_id: string;
  title: string;
  release_year?: number | null;
  cover_url?: string | null;
  background_url?: string | null;
  description?: string | null;
  raw_patch: {
    name?: string | null;
    description?: string | null;
    release_date?: string | null;
    cover_url?: string | null;
    background_url?: string | null;
    icon_url?: string | null;
    critic_score?: number | null;
    community_score?: number | null;
    genres?: string[];
    developers?: string[];
    publishers?: string[];
    features?: string[];
    tags?: string[];
    series?: string | null;
    age_rating?: string | null;
    region?: string | null;
    platform?: string | null;
    custom_links?: Array<{ title: string; url: string }>;
    install_size_bytes?: number | null;
  };
}

export interface ProviderBadgeStyle {
  name: string;
  bg: string;
  border: string;
  text: string;
}

const PROVIDER_BADGE_MAP: Record<string, ProviderBadgeStyle> = {
  steam: { name: "Steam Store", bg: "rgba(23, 53, 77, 0.9)", border: "#66c0f4", text: "#66c0f4" },
  gog: { name: "GOG Store", bg: "rgba(50, 15, 70, 0.9)", border: "#a855f7", text: "#c084fc" },
  steamgriddb: { name: "SteamGridDB HD", bg: "rgba(35, 38, 46, 0.9)", border: "#e5e7eb", text: "#ffffff" },
  opencritic: { name: "OpenCritic", bg: "rgba(50, 20, 20, 0.9)", border: "#f87171", text: "#f87171" },
  igdb: { name: "IGDB", bg: "rgba(45, 20, 80, 0.9)", border: "#9146ff", text: "#a970ff" },
  howlongtobeat: { name: "HLTB", bg: "rgba(20, 45, 40, 0.9)", border: "#34d399", text: "#6ee7b7" },
  hltb: { name: "HLTB", bg: "rgba(20, 45, 40, 0.9)", border: "#34d399", text: "#6ee7b7" },
};

export function getProviderBadge(providerId: string): ProviderBadgeStyle {
  const key = providerId.toLowerCase();
  return (
    PROVIDER_BADGE_MAP[key] ?? {
      name: providerId,
      bg: "rgba(30, 41, 59, 0.9)",
      border: "#94a3b8",
      text: "#cbd5e1",
    }
  );
}
