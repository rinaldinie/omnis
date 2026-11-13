import React from "react";
import {
  Sparkles,
  Calendar,
  Star,
  Image as ImageIcon,
  FileText,
  Gamepad2,
  Layers,
  Tag,
  Shield,
  ExternalLink,
} from "lucide-react";
import type { GameDto } from "../../../types";
import type { MetadataCandidateDto } from "./types";

export interface FieldDefinition {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  isPresent: (game: GameDto) => boolean;
  getValueSummary: (cand: MetadataCandidateDto) => string | null;
}

export type FieldOption = Pick<FieldDefinition, "key" | "label" | "description" | "icon">;

export const FIELD_DEFINITIONS: FieldDefinition[] = [
  {
    key: "name",
    label: "metadata_resolution.field_name",
    description: "metadata_resolution.field_name_desc",
    icon: <FileText className="w-3.5 h-3.5 text-blue-400" />,
    isPresent: (g) => Boolean(g.title && g.title.trim() !== ""),
    getValueSummary: (c) => c.raw_patch.name || c.title || null,
  },
  {
    key: "cover_image",
    label: "metadata_resolution.field_cover",
    description: "metadata_resolution.field_cover_desc",
    icon: <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />,
    isPresent: (g) => Boolean(g.cover_image && String(g.cover_image).trim() !== ""),
    getValueSummary: (c) => (c.cover_url || c.raw_patch.cover_url ? "URL Immagine" : null),
  },
  {
    key: "background_image",
    label: "metadata_resolution.field_background",
    description: "metadata_resolution.field_background_desc",
    icon: <Layers className="w-3.5 h-3.5 text-sky-400" />,
    isPresent: (g) => Boolean(g.background_image && String(g.background_image).trim() !== ""),
    getValueSummary: (c) => (c.background_url || c.raw_patch.background_url ? "URL Banner" : null),
  },
  {
    key: "icon",
    label: "metadata_resolution.field_icon",
    description: "metadata_resolution.field_icon_desc",
    icon: <ImageIcon className="w-3.5 h-3.5 text-teal-400" />,
    isPresent: (g) =>
      Boolean(
        (g.icon_image && String(g.icon_image).trim() !== "") ||
          (g.icon_image_path && String(g.icon_image_path).trim() !== "")
      ),
    getValueSummary: (c) => (c.raw_patch.icon_url ? "URL Icona" : null),
  },
  {
    key: "description",
    label: "metadata_resolution.field_description",
    description: "metadata_resolution.field_description_desc",
    icon: <FileText className="w-3.5 h-3.5 text-slate-300" />,
    isPresent: (g) => Boolean(g.description && String(g.description).trim() !== ""),
    getValueSummary: (c) => c.description || c.raw_patch.description || null,
  },
  {
    key: "genres",
    label: "metadata_resolution.field_genres",
    description: "metadata_resolution.field_genres_desc",
    icon: <Gamepad2 className="w-3.5 h-3.5 text-purple-400" />,
    isPresent: (g) => Boolean(g.genres && g.genres.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.genres && c.raw_patch.genres.length > 0 ? c.raw_patch.genres.join(", ") : null,
  },
  {
    key: "release_date",
    label: "metadata_resolution.field_release",
    description: "metadata_resolution.field_release_desc",
    icon: <Calendar className="w-3.5 h-3.5 text-rose-400" />,
    isPresent: (g) => Boolean(g.release_date && String(g.release_date).trim() !== ""),
    getValueSummary: (c) =>
      c.raw_patch.release_date || (c.release_year ? String(c.release_year) : null),
  },
  {
    key: "developers",
    label: "metadata_resolution.field_developers",
    description: "metadata_resolution.field_developers_desc",
    icon: <FileText className="w-3.5 h-3.5 text-emerald-400" />,
    isPresent: (g) => Boolean(g.developers && g.developers.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.developers && c.raw_patch.developers.length > 0
        ? c.raw_patch.developers.join(", ")
        : null,
  },
  {
    key: "publishers",
    label: "metadata_resolution.field_publishers",
    description: "metadata_resolution.field_publishers_desc",
    icon: <FileText className="w-3.5 h-3.5 text-cyan-400" />,
    isPresent: (g) => Boolean(g.publishers && g.publishers.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.publishers && c.raw_patch.publishers.length > 0
        ? c.raw_patch.publishers.join(", ")
        : null,
  },
  {
    key: "features",
    label: "metadata_resolution.field_features",
    description: "metadata_resolution.field_features_desc",
    icon: <Sparkles className="w-3.5 h-3.5 text-yellow-400" />,
    isPresent: (g) => Boolean(g.features && g.features.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.features && c.raw_patch.features.length > 0
        ? c.raw_patch.features.join(", ")
        : null,
  },
  {
    key: "tags",
    label: "metadata_resolution.field_tags",
    description: "metadata_resolution.field_tags_desc",
    icon: <Tag className="w-3.5 h-3.5 text-orange-400" />,
    isPresent: (g) => Boolean(g.tags && g.tags.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.tags && c.raw_patch.tags.length > 0
        ? c.raw_patch.tags.slice(0, 4).join(", ")
        : null,
  },
  {
    key: "series",
    label: "metadata_resolution.field_series",
    description: "metadata_resolution.field_series_desc",
    icon: <Layers className="w-3.5 h-3.5 text-violet-400" />,
    isPresent: (g) => Boolean(g.series && String(g.series).trim() !== ""),
    getValueSummary: (c) => c.raw_patch.series || null,
  },
  {
    key: "age_rating",
    label: "metadata_resolution.field_age_rating",
    description: "metadata_resolution.field_age_rating_desc",
    icon: <Shield className="w-3.5 h-3.5 text-red-400" />,
    isPresent: (g) => Boolean(g.age_rating && String(g.age_rating).trim() !== ""),
    getValueSummary: (c) => c.raw_patch.age_rating || null,
  },
  {
    key: "critic_score",
    label: "metadata_resolution.field_critic",
    description: "metadata_resolution.field_critic_desc",
    icon: <Star className="w-3.5 h-3.5 text-amber-400" />,
    isPresent: (g) => g.critic_score !== null && g.critic_score !== undefined,
    getValueSummary: (c) =>
      c.raw_patch.critic_score != null ? `${c.raw_patch.critic_score}/100` : null,
  },
  {
    key: "community_score",
    label: "metadata_resolution.field_community",
    description: "metadata_resolution.field_community_desc",
    icon: <Star className="w-3.5 h-3.5 text-emerald-400" />,
    isPresent: (g) => g.community_score !== null && g.community_score !== undefined,
    getValueSummary: (c) =>
      c.raw_patch.community_score != null ? `${c.raw_patch.community_score}%` : null,
  },
  {
    key: "links",
    label: "metadata_resolution.field_links",
    description: "metadata_resolution.field_links_desc",
    icon: <ExternalLink className="w-3.5 h-3.5 text-blue-300" />,
    isPresent: (g) => Boolean(g.custom_links && g.custom_links.length > 0),
    getValueSummary: (c) =>
      c.raw_patch.custom_links && c.raw_patch.custom_links.length > 0
        ? `${c.raw_patch.custom_links.length} collegamenti`
        : null,
  },
];

export const AVAILABLE_FIELDS: FieldOption[] = FIELD_DEFINITIONS.map(
  ({ key, label, description, icon }) => ({
    key,
    label,
    description,
    icon,
  })
);

export function isGameFieldPresent(game: GameDto | null, key: string): boolean {
  if (!game) return false;
  const def = FIELD_DEFINITIONS.find((d) => d.key === key);
  return def ? def.isPresent(game) : false;
}

export function computeMissingGameFields(game: GameDto | null): string[] {
  if (!game) return [];
  return FIELD_DEFINITIONS.filter((d) => d.key !== "name" && !d.isPresent(game)).map((d) => d.key);
}

export function getCandidateValueSummary(
  cand: MetadataCandidateDto,
  key: string
): string | null {
  const def = FIELD_DEFINITIONS.find((d) => d.key === key);
  return def ? def.getValueSummary(cand) : null;
}

export function isCandidateFieldAvailable(
  cand: MetadataCandidateDto | null,
  key: string
): boolean {
  if (!cand) return false;
  return getCandidateValueSummary(cand, key) !== null;
}
