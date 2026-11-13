import React from "react";
import { Puzzle, Database, Award, Image } from "lucide-react";
import { ProviderInfo } from "../../../types";
import { SteamIcon, EpicIcon, GogIcon, XboxIcon } from "../../common/StoreBadge";

export type PluginCategory = "all" | "libraries" | "metadata" | "generic";

export interface PriorityProviderMeta {
  id: string;
  name: string;
  description: string;
  badges: string[];
}

export const BUILTIN_LIBRARIES: ProviderInfo[] = [
  {
    id: "steam_library",
    name: "Steam Library Scanner",
    description: "plugin_manager.lib_steam_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["plugin_manager.field_installed_games", "plugin_manager.field_playtime", "Cloud Sync"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "epic_library",
    name: "Epic Games Launcher Scanner",
    description: "plugin_manager.lib_epic_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["plugin_manager.field_installed_games", "Manifest .item", "Cloud OAuth"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "gog_library",
    name: "GOG Galaxy Scanner",
    description: "plugin_manager.lib_gog_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["DRM-Free", "plugin_manager.field_windows_registry", "Cloud Galaxy"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
  {
    id: "xbox_library",
    name: "Xbox / PC Game Pass Scanner",
    description: "plugin_manager.lib_xbox_desc",
    author: "Omnis Core Team",
    requires_api_key: false,
    supported_fields: ["MSIX Packages", "Microsoft Store", "Xbox Cloud"],
    is_enabled: true,
    is_builtin: true,
    version: "1.0.0",
    plugin_type: "library",
    settings_values: {},
    has_configured_key: true,
  },
];

export const PROVIDER_METAS: Record<string, PriorityProviderMeta> = {
  steam: {
    id: "steam",
    name: "Steam Store Engine",
    description: "plugin_manager.meta_steam_desc",
    badges: ["plugin_manager.badge_posters", "plugin_manager.badge_backgrounds", "plugin_manager.badge_synopsis_tags", "plugin_manager.badge_metacritic"],
  },
  gog: {
    id: "gog",
    name: "GOG.com Catalog",
    description: "plugin_manager.meta_gog_desc",
    badges: ["plugin_manager.badge_posters", "plugin_manager.badge_hero_backgrounds", "plugin_manager.badge_drm_free_synopsis"],
  },
  steamgriddb: {
    id: "steamgriddb",
    name: "SteamGridDB",
    description: "plugin_manager.meta_sgdb_desc",
    badges: ["plugin_manager.badge_posters_hd", "plugin_manager.badge_hero_4k", "Community Art"],
  },
  opencritic: {
    id: "opencritic",
    name: "OpenCritic",
    description: "plugin_manager.meta_opencritic_desc",
    badges: ["Top Critic Score", "plugin_manager.badge_recommendation", "plugin_manager.badge_press_reviews"],
  },
  igdb: {
    id: "igdb",
    name: "IGDB (Internet Game Database)",
    description: "plugin_manager.meta_igdb_desc",
    badges: ["plugin_manager.badge_global_db", "Screenshot HD", "Total Rating"],
  },
};

export function renderProviderIcon(provId: string, isEnabled: boolean) {
  const iconCls = isEnabled ? "w-4 h-4" : "w-4 h-4 opacity-50";
  switch (provId) {
    case "steam":
    case "steam_library":
      return <SteamIcon className={iconCls} />;
    case "epic":
    case "epic_library":
      return <EpicIcon className={iconCls} />;
    case "gog":
    case "gog_library":
      return <GogIcon className={iconCls} />;
    case "xbox":
    case "xbox_library":
      return <XboxIcon className={iconCls} />;
    case "steamgriddb":
      return <Image className={iconCls} />;
    case "opencritic":
      return <Award className={iconCls} />;
    case "igdb":
      return <Database className={iconCls} />;
    default:
      return <Puzzle className={iconCls} />;
  }
}

export function getProviderColor(provId: string): string {
  switch (provId) {
    case "steam":
    case "steam_library":
      return "#1b2838";
    case "epic":
    case "epic_library":
      return "#2a2a2a";
    case "gog":
    case "gog_library":
      return "#5c2e91";
    case "xbox":
    case "xbox_library":
      return "#107c10";
    case "steamgriddb":
      return "#00aaff";
    case "opencritic":
      return "#ff5900";
    case "igdb":
      return "#9146ff";
    default:
      return "#6366f1";
  }
}
