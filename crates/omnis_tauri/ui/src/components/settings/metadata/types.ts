import { FieldPipelineRule } from "../../../types";

export const ALL_METADATA_SOURCES = [
  "official_store",
  "steamgriddb",
  "steam",
  "igdb",
  "opencritic",
  "howlongtobeat",
  "gog",
];

export interface MetadataFieldDefinition {
  id: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  category: "text" | "media" | "ratings" | "technical";
}

export const METADATA_FIELDS_DEFINITIONS: MetadataFieldDefinition[] = [
  {
    id: "name",
    labelKey: "metadata_settings.field_name",
    defaultLabel: "Game Title",
    descriptionKey: "metadata_settings.field_name_desc",
    defaultDescription: "Official title displayed across the library.",
    category: "text",
  },
  {
    id: "genres",
    labelKey: "metadata_settings.field_genres",
    defaultLabel: "Genres",
    descriptionKey: "metadata_settings.field_genres_desc",
    defaultDescription: "Thematic categories of the game (RPG, Action, Strategy).",
    category: "text",
  },
  {
    id: "release_date",
    labelKey: "metadata_settings.field_release_date",
    defaultLabel: "Release Date",
    descriptionKey: "metadata_settings.field_release_date_desc",
    defaultDescription: "Official release day or year.",
    category: "text",
  },
  {
    id: "developers",
    labelKey: "metadata_settings.field_developers",
    defaultLabel: "Developers",
    descriptionKey: "metadata_settings.field_developers_desc",
    defaultDescription: "Primary development studios or team.",
    category: "text",
  },
  {
    id: "publishers",
    labelKey: "metadata_settings.field_publishers",
    defaultLabel: "Publishers",
    descriptionKey: "metadata_settings.field_publishers_desc",
    defaultDescription: "Publishing companies or labels.",
    category: "text",
  },
  {
    id: "features",
    labelKey: "metadata_settings.field_features",
    defaultLabel: "Features",
    descriptionKey: "metadata_settings.field_features_desc",
    defaultDescription: "Controller support, cloud saves, multiplayer, and achievements.",
    category: "technical",
  },
  {
    id: "tags",
    labelKey: "metadata_settings.field_tags",
    defaultLabel: "Tags",
    descriptionKey: "metadata_settings.field_tags_desc",
    defaultDescription: "Community and store descriptive tags.",
    category: "text",
  },
  {
    id: "description",
    labelKey: "metadata_settings.field_description",
    defaultLabel: "Description & Synopsis",
    descriptionKey: "metadata_settings.field_description_desc",
    defaultDescription: "Plot synopsis and gameplay overview.",
    category: "text",
  },
  {
    id: "links",
    labelKey: "metadata_settings.field_links",
    defaultLabel: "Links",
    descriptionKey: "metadata_settings.field_links_desc",
    defaultDescription: "Store pages, guides, and wiki links.",
    category: "text",
  },
  {
    id: "critic_score",
    labelKey: "metadata_settings.field_critic_score",
    defaultLabel: "Critic Score",
    descriptionKey: "metadata_settings.field_critic_score_desc",
    defaultDescription: "Specialized press review scores (OpenCritic/Metacritic).",
    category: "ratings",
  },
  {
    id: "community_score",
    labelKey: "metadata_settings.field_community_score",
    defaultLabel: "Community Score",
    descriptionKey: "metadata_settings.field_community_score_desc",
    defaultDescription: "Player recommendation percentage or average rating.",
    category: "ratings",
  },
  {
    id: "age_rating",
    labelKey: "metadata_settings.field_age_rating",
    defaultLabel: "Age Rating",
    descriptionKey: "metadata_settings.field_age_rating_desc",
    defaultDescription: "Recommended age advisory (PEGI, ESRB, USK).",
    category: "ratings",
  },
  {
    id: "series",
    labelKey: "metadata_settings.field_series",
    defaultLabel: "Series / Franchise",
    descriptionKey: "metadata_settings.field_series_desc",
    defaultDescription: "Video game series or franchise.",
    category: "text",
  },
  {
    id: "region",
    labelKey: "metadata_settings.field_region",
    defaultLabel: "Region",
    descriptionKey: "metadata_settings.field_region_desc",
    defaultDescription: "Publication region (Global, EU, US, JP).",
    category: "technical",
  },
  {
    id: "platform",
    labelKey: "metadata_settings.field_platform",
    defaultLabel: "Platform",
    descriptionKey: "metadata_settings.field_platform_desc",
    defaultDescription: "Target hardware platform or operating system.",
    category: "technical",
  },
  {
    id: "cover_image",
    labelKey: "metadata_settings.field_cover",
    defaultLabel: "Main Cover",
    descriptionKey: "metadata_settings.field_cover_desc",
    defaultDescription: "Vertical 2:3 high-definition cover art (600x900).",
    category: "media",
  },
  {
    id: "icon",
    labelKey: "metadata_settings.field_icon",
    defaultLabel: "Icon",
    descriptionKey: "metadata_settings.field_icon_desc",
    defaultDescription: "Square application or launcher icon.",
    category: "media",
  },
  {
    id: "background_image",
    labelKey: "metadata_settings.field_background",
    defaultLabel: "Hero Background",
    descriptionKey: "metadata_settings.field_background_desc",
    defaultDescription: "Horizontal 16:9 panoramic background artwork (1080p / 4K).",
    category: "media",
  },
  {
    id: "install_size",
    labelKey: "metadata_settings.field_install_size",
    defaultLabel: "Install Size",
    descriptionKey: "metadata_settings.field_install_size_desc",
    defaultDescription: "Estimated or required installation disk space.",
    category: "technical",
  },
];

export function getDefaultFieldRules(): Record<string, FieldPipelineRule> {
  return {
    name: { enabled: true, sources: ["official_store", "steam", "igdb"] },
    genres: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    release_date: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    developers: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    publishers: { enabled: true, sources: ["official_store", "igdb", "steam", "gog"] },
    features: { enabled: true, sources: ["official_store", "steam", "igdb", "gog"] },
    tags: { enabled: true, sources: ["steam", "gog", "official_store", "igdb"] },
    description: { enabled: true, sources: ["official_store", "steam", "gog", "igdb"] },
    links: { enabled: true, sources: ["official_store", "igdb", "steam"] },
    critic_score: { enabled: true, sources: ["opencritic", "igdb", "steam"] },
    community_score: { enabled: true, sources: ["steam", "igdb", "gog"] },
    age_rating: { enabled: true, sources: ["official_store", "igdb", "steam"] },
    series: { enabled: true, sources: ["igdb", "official_store"] },
    region: { enabled: false, sources: ["official_store"] },
    platform: { enabled: true, sources: ["official_store"] },
    cover_image: {
      enabled: true,
      sources: ["steamgriddb", "official_store", "steam", "igdb", "gog"],
    },
    icon: {
      enabled: true,
      sources: ["official_store", "steamgriddb", "steam", "gog"],
    },
    background_image: {
      enabled: true,
      sources: ["steamgriddb", "official_store", "steam", "igdb", "gog"],
    },
    install_size: { enabled: true, sources: ["official_store", "gog"] },
  };
}

export function normalizeProviderPriority(raw?: string[]): string[] {
  const result: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const normalized =
        item.toLowerCase() === "hltb" ? "howlongtobeat" : item.toLowerCase();
      if (ALL_METADATA_SOURCES.includes(normalized) && !result.includes(normalized)) {
        result.push(normalized);
      }
    }
  }
  for (const src of ALL_METADATA_SOURCES) {
    if (!result.includes(src)) {
      result.push(src);
    }
  }
  return result;
}

export type MetadataSubTab =
  | "igdb"
  | "steamgriddb"
  | "opencritic"
  | "hltb"
  | "pipeline";
