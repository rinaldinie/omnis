import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "../i18n";
import { GameDto, GroupBy, FILTER_ORDER } from "../types";
import { sortGames, GameSortMode } from "../utils/sortGames";
import { toCategoryId } from "../utils/consoleCategories";
import { getRecentSettings, RecentSettings } from "../utils/recentSettings";

export interface FilterChip {
  id: string;
  label: string;
  type: "store" | "status" | "flag" | "genre" | "feature";
}

function matchesGenre(g: GameDto, targetGenre: string): boolean {
  const tLower = targetGenre.toLowerCase().trim();
  if (tLower === "action") {
    return g.genres.some((x) => x.toLowerCase().includes("azione") || x.toLowerCase().includes("action"));
  }
  if (tLower === "rpg") {
    return g.genres.some((x) => x.toLowerCase().includes("gdr") || x.toLowerCase().includes("rpg"));
  }
  if (tLower === "strategy") {
    return g.genres.some(
      (x) =>
        x.toLowerCase().includes("strategia") ||
        x.toLowerCase().includes("puzzle") ||
        x.toLowerCase().includes("strategy")
    );
  }
  if (tLower === "indie") {
    return g.genres.some((x) => x.toLowerCase().includes("indie"));
  }
  return g.genres.some((x) => x.toLowerCase().trim() === tLower || x.toLowerCase().includes(tLower));
}

export function useLibraryFilters(games: GameDto[]) {
  const { t } = useTranslation();
  // Dimension 1: Selected Stores (e.g. ["steam", "gog"]) - OR within dimension
  const [selectedStores, setSelectedStores] = useState<string[]>([]);

  // Dimension 2: Selected Completion Statuses (e.g. ["Playing", "Completed"]) - OR within dimension
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  // Dimension 3: Quick Flags (e.g. ["installed", "favorites", "recent"]) - AND within dimension
  const [selectedFlags, setSelectedFlags] = useState<string[]>([]);

  // Dimension 4: Selected Genres (e.g. ["Action", "RPG"]) - OR within dimension
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  // Dimension 5: Selected Features (e.g. ["Single-player", "Co-op"]) - AND within dimension
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  // Dimension 6: Sort Mode
  const [sortMode, setSortMode] = useState<GameSortMode>("default");

  const [recentSettings, setRecentSettings] = useState<RecentSettings>(getRecentSettings);

  useEffect(() => {
    const handleSettingsChange = () => {
      setRecentSettings(getRecentSettings());
    };
    window.addEventListener("omnis_recent_settings_changed", handleSettingsChange);
    return () => {
      window.removeEventListener("omnis_recent_settings_changed", handleSettingsChange);
    };
  }, []);

  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [detailsSearchQuery, setDetailsSearchQuery] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleStore = (storeId: string) => {
    const sLower = storeId.toLowerCase().trim();
    setSelectedStores((prev) =>
      prev.map((s) => s.toLowerCase()).includes(sLower)
        ? prev.filter((s) => s.toLowerCase() !== sLower)
        : [...prev, sLower]
    );
  };

  const toggleStatus = (status: string) => {
    const stClean = status.startsWith("completion:") ? status.slice(11).trim() : status.trim();
    setSelectedStatuses((prev) =>
      prev.some((s) => s.toLowerCase() === stClean.toLowerCase())
        ? prev.filter((s) => s.toLowerCase() !== stClean.toLowerCase())
        : [...prev, stClean]
    );
  };

  const toggleFlag = (flag: string) => {
    const fLower = flag.toLowerCase().trim();
    setSelectedFlags((prev) =>
      prev.includes(fLower) ? prev.filter((f) => f !== fLower) : [...prev, fLower]
    );
  };

  const toggleGenre = (genre: string) => {
    const gClean = genre.startsWith("genre:") ? genre.slice(6).trim() : genre.trim();
    setSelectedGenres((prev) =>
      prev.some((g) => g.toLowerCase() === gClean.toLowerCase())
        ? prev.filter((g) => g.toLowerCase() !== gClean.toLowerCase())
        : [...prev, gClean]
    );
  };

  const toggleFeature = (feature: string) => {
    const fClean = feature.startsWith("feature:") ? feature.slice(8).trim() : feature.trim();
    setSelectedFeatures((prev) =>
      prev.some((f) => f.toLowerCase() === fClean.toLowerCase())
        ? prev.filter((f) => f.toLowerCase() !== fClean.toLowerCase())
        : [...prev, fClean]
    );
  };

  const clearAllFilters = () => {
    setSelectedStores([]);
    setSelectedStatuses([]);
    setSelectedFlags([]);
    setSelectedGenres([]);
    setSelectedFeatures([]);
  };

  const removeFilterChip = (chipId: string) => {
    if (chipId.startsWith("store:")) {
      const store = chipId.slice(6);
      setSelectedStores((prev) => prev.filter((s) => s.toLowerCase() !== store.toLowerCase()));
    } else if (chipId.startsWith("status:")) {
      const status = chipId.slice(7);
      setSelectedStatuses((prev) => prev.filter((st) => st.toLowerCase() !== status.toLowerCase()));
    } else if (chipId.startsWith("flag:")) {
      const flag = chipId.slice(5);
      setSelectedFlags((prev) => prev.filter((f) => f !== flag));
    } else if (chipId.startsWith("genre:")) {
      const genre = chipId.slice(6);
      setSelectedGenres((prev) => prev.filter((g) => g.toLowerCase() !== genre.toLowerCase()));
    } else if (chipId.startsWith("feature:")) {
      const feat = chipId.slice(8);
      setSelectedFeatures((prev) => prev.filter((f) => f.toLowerCase() !== feat.toLowerCase()));
    }
  };

  const isFilterActive = (id: string): boolean => {
    if (id === "all") {
      return (
        selectedStores.length === 0 &&
        selectedStatuses.length === 0 &&
        selectedFlags.length === 0 &&
        selectedGenres.length === 0 &&
        selectedFeatures.length === 0
      );
    }
    const idLower = id.toLowerCase().trim();
    if (["installed", "recent", "favorites", "hidden"].includes(idLower)) {
      return selectedFlags.includes(idLower);
    }
    if (["steam", "gog", "epic", "xbox"].includes(idLower)) {
      return selectedStores.some((s) => s.toLowerCase() === idLower);
    }
    if (id.startsWith("completion:")) {
      const st = id.slice(11).toLowerCase().trim();
      return selectedStatuses.some((s) => s.toLowerCase().trim() === st);
    }
    if (id.startsWith("genre:")) {
      const g = id.slice(6).toLowerCase().trim();
      return selectedGenres.some((x) => x.toLowerCase().trim() === g);
    }
    if (id.startsWith("feature:")) {
      const feat = id.slice(8).toLowerCase().trim();
      return selectedFeatures.some((x) => x.toLowerCase().trim() === feat);
    }
    if (["action", "rpg", "strategy", "indie"].includes(idLower)) {
      return selectedGenres.some((x) => x.toLowerCase() === idLower);
    }
    return false;
  };

  // Backwards-compatible activeFilter string
  const activeFilter = useMemo<string>(() => {
    const totalActive =
      selectedStores.length +
      selectedStatuses.length +
      selectedFlags.length +
      selectedGenres.length +
      selectedFeatures.length;

    if (totalActive === 0) return "all";
    if (totalActive === 1) {
      if (selectedFlags.length === 1) return selectedFlags[0];
      if (selectedStores.length === 1) return selectedStores[0];
      if (selectedStatuses.length === 1) return `completion:${selectedStatuses[0]}`;
      if (selectedGenres.length === 1) return `genre:${selectedGenres[0]}`;
      if (selectedFeatures.length === 1) return `feature:${selectedFeatures[0]}`;
    }
    return "custom";
  }, [selectedStores, selectedStatuses, selectedFlags, selectedGenres, selectedFeatures]);

  const setActiveFilter = (filter: string) => {
    if (filter === "all") {
      clearAllFilters();
      return;
    }
    const fLower = filter.toLowerCase().trim();
    if (["installed", "recent", "favorites", "hidden"].includes(fLower)) {
      toggleFlag(fLower);
    } else if (["steam", "gog", "epic", "xbox"].includes(fLower)) {
      toggleStore(fLower);
    } else if (filter.startsWith("completion:")) {
      toggleStatus(filter.slice(11));
    } else if (filter.startsWith("genre:")) {
      toggleGenre(filter.slice(6));
    } else if (["action", "rpg", "strategy", "indie"].includes(fLower)) {
      toggleGenre(fLower);
    } else {
      toggleGenre(filter);
    }
  };

  // Replaces every active filter with a single category
  const selectFilter = (filter: string) => {
    clearAllFilters();
    if (filter !== "all") {
      setActiveFilter(filter);
    }
  };

  const cycleFilter = (
    direction: number,
    onCycle?: (nextFilter: string) => void,
    order: string[] = FILTER_ORDER
  ) => {
    if (order.length === 0) return;
    const currentIndex = order.indexOf(toCategoryId(activeFilter));
    const nextIndex =
      currentIndex === -1
        ? direction > 0
          ? 0
          : order.length - 1
        : (currentIndex + direction + order.length) % order.length;
    const nextFilter = order[nextIndex];
    selectFilter(nextFilter);
    if (onCycle) onCycle(nextFilter);
  };

  const activeChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];

    // Stores
    const storeLabels: Record<string, string> = {
      steam: "Steam",
      gog: "GOG",
      epic: "Epic Games",
      xbox: "Xbox",
    };
    selectedStores.forEach((s) => {
      chips.push({
        id: `store:${s}`,
        label: storeLabels[s.toLowerCase()] || s.toUpperCase(),
        type: "store",
      });
    });

    // Statuses
    const statusKeys: Record<string, string> = {
      playing: "playing",
      completed: "completed",
      beaten: "beaten",
      plantoplay: "plan_to_play",
      backlog: "backlog",
      abandoned: "abandoned",
      notplayed: "not_played",
    };
    selectedStatuses.forEach((st) => {
      chips.push({
        id: `status:${st}`,
        label: t("filter_chips.status", {
          status: statusKeys[st.toLowerCase()] ? t(`completion_status.${statusKeys[st.toLowerCase()]}`) : st,
        }),
        type: "status",
      });
    });

    // Flags
    const flagLabels: Record<string, string> = {
      installed: t("sidebar.installed"),
      favorites: t("sidebar.favorites"),
      recent: t("sidebar.recent"),
      hidden: t("sidebar.hidden", { defaultValue: "Nascosti" }),
    };
    selectedFlags.forEach((f) => {
      chips.push({
        id: `flag:${f}`,
        label: flagLabels[f] || f,
        type: "flag",
      });
    });

    // Genres
    selectedGenres.forEach((g) => {
      chips.push({
        id: `genre:${g}`,
        label: t("filter_chips.genre", { genre: g }),
        type: "genre",
      });
    });

    // Features
    selectedFeatures.forEach((feat) => {
      chips.push({
        id: `feature:${feat}`,
        label: feat,
        type: "feature",
      });
    });

    return chips;
  }, [selectedStores, selectedStatuses, selectedFlags, selectedGenres, selectedFeatures, t]);

  const filteredGames = useMemo(() => {
    const showHiddenOnly = selectedFlags.includes("hidden");

    const list = games.filter((g) => {
      // 0. Hidden filter
      if (showHiddenOnly) {
        if (!g.is_hidden) return false;
      } else {
        if (g.is_hidden) return false;
      }

      // 1. Quick Flags (AND)
      if (selectedFlags.includes("installed") && !g.is_installed) return false;
      if (selectedFlags.includes("recent")) {
        if (!g.last_activity) return false;
        if (recentSettings.timeWindowDays > 0) {
          const playedTime = Date.parse(g.last_activity);
          if (!playedTime) return false;
          const cutoff = Date.now() - recentSettings.timeWindowDays * 24 * 60 * 60 * 1000;
          if (playedTime < cutoff) return false;
        }
      }
      if (selectedFlags.includes("favorites") && !g.is_favorite) return false;

      // 2. Stores Filter (OR within selected stores, AND with rest)
      if (selectedStores.length > 0) {
        const gLib = (g.library || "").toLowerCase();
        const matchesStore = selectedStores.some((s) => s.toLowerCase() === gLib);
        if (!matchesStore) return false;
      }

      // 3. Completion Statuses Filter (OR within selected statuses, AND with rest)
      if (selectedStatuses.length > 0) {
        const gStatus = (g.completion_status || "NotPlayed").toLowerCase().trim();
        const matchesStatus = selectedStatuses.some((st) => st.toLowerCase().trim() === gStatus);
        if (!matchesStatus) return false;
      }

      // 4. Genres Filter (OR within selected genres, AND with rest)
      if (selectedGenres.length > 0) {
        const matches = selectedGenres.some((target) => matchesGenre(g, target));
        if (!matches) return false;
      }

      // 5. Features Filter (AND across selected features)
      if (selectedFeatures.length > 0) {
        const matchesFeatures = selectedFeatures.every((targetFeature) =>
          g.features && g.features.some((f) => f.toLowerCase().includes(targetFeature.toLowerCase()))
        );
        if (!matchesFeatures) return false;
      }

      // 6. Search Query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        return (
          g.title.toLowerCase().includes(query) ||
          g.developers.some((d) => d.toLowerCase().includes(query))
        );
      }

      return true;
    });

    // When a sort mode is chosen, apply it
    if (sortMode !== "default") {
      const sorted = sortGames(list, sortMode);
      if (selectedFlags.includes("recent") && recentSettings.maxCount > 0) {
        return sorted.slice(0, recentSettings.maxCount);
      }
      return sorted;
    }

    // Default: When filtering by "recent", sort by last_activity descending (Steam / Playnite behavior)
    if (selectedFlags.includes("recent")) {
      const sorted = sortGames(list, "recent");
      if (recentSettings.maxCount > 0) {
        return sorted.slice(0, recentSettings.maxCount);
      }
      return sorted;
    }

    return list;
  }, [games, selectedFlags, selectedStores, selectedStatuses, selectedGenres, selectedFeatures, searchQuery, sortMode, recentSettings]);

  const groupedGames = useMemo<Record<string, GameDto[]>>(() => {
    if (groupBy === "none") {
      return { [t("sidebar.all_games")]: filteredGames };
    }

    const groups: Record<string, GameDto[]> = {};

    filteredGames.forEach((game) => {
      let key: string;
      switch (groupBy) {
        case "library":
          key = game.library ? game.library.toUpperCase() : t("library_groups.other").toUpperCase();
          break;
        case "is_installed":
        case "installed" as any:
          key = game.is_installed ? t("sidebar.installed") : t("library_groups.downloadable");
          break;
        case "genre":
          key = game.genres && game.genres.length > 0 ? game.genres[0] : t("library_groups.no_genre");
          break;
        case "developer":
          key = game.developers && game.developers.length > 0 ? game.developers[0] : t("library_groups.unknown");
          break;
        case "release_year": {
          if (game.release_date) {
            const match = game.release_date.match(/\b(19\d\d|20\d\d)\b/);
            key = match ? match[1] : t("library_groups.unknown_date");
          } else {
            key = t("library_groups.unknown_date");
          }
          break;
        }
        case "completion_status": {
          const statusKeys: Record<string, string> = {
            NotPlayed: "not_played",
            Playing: "playing",
            Beaten: "beaten",
            Completed: "completed",
            Abandoned: "abandoned",
            Backlog: "backlog",
            PlanToPlay: "plan_to_play",
          };
          const statusKey = statusKeys[game.completion_status || "NotPlayed"];
          key = statusKey ? t(`completion_status.${statusKey}`) : game.completion_status || t("completion_status.not_played");
          break;
        }
        default:
          key = t("sidebar.all_games");
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(game);
    });

    return groups;
  }, [filteredGames, groupBy, t]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  const detailsFilteredGames = useMemo(() => {
    if (!detailsSearchQuery.trim()) return filteredGames;
    const q = detailsSearchQuery.toLowerCase();
    return filteredGames.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.library.toLowerCase().includes(q) ||
        (g.series && g.series.toLowerCase().includes(q))
    );
  }, [filteredGames, detailsSearchQuery]);

  const filterCounts = useMemo(() => {
    const storeCounts: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};
    const genreCounts: Record<string, number> = {};
    const featureCounts: Record<string, number> = {};
    let installedCount = 0;
    let favoritesCount = 0;
    let recentCount = 0;
    let hiddenCount = 0;

    games.forEach((g) => {
      if (g.is_hidden) {
        hiddenCount++;
        return;
      }
      if (g.is_installed) installedCount++;
      if (g.is_favorite) favoritesCount++;
      if (g.last_activity) {
        if (recentSettings.timeWindowDays > 0) {
          const playedTime = Date.parse(g.last_activity);
          const cutoff = Date.now() - recentSettings.timeWindowDays * 24 * 60 * 60 * 1000;
          if (playedTime && playedTime >= cutoff) {
            recentCount++;
          }
        } else {
          recentCount++;
        }
      }

      const lib = (g.library || "other").toLowerCase();
      storeCounts[lib] = (storeCounts[lib] || 0) + 1;

      const st = (g.completion_status || "NotPlayed").toLowerCase();
      statusCounts[st] = (statusCounts[st] || 0) + 1;

      g.genres.forEach((genre) => {
        const trimmed = genre.trim();
        if (trimmed) {
          genreCounts[trimmed] = (genreCounts[trimmed] || 0) + 1;
        }
      });

      if (g.features) {
        g.features.forEach((feat) => {
          const trimmed = feat.trim();
          if (trimmed) {
            featureCounts[trimmed] = (featureCounts[trimmed] || 0) + 1;
          }
        });
      }
    });

    return {
      total: games.length - hiddenCount,
      installed: installedCount,
      favorites: favoritesCount,
      recent: recentCount,
      hidden: hiddenCount,
      stores: storeCounts,
      statuses: statusCounts,
      genres: genreCounts,
      features: featureCounts,
    };
  }, [games, recentSettings]);

  return {
    selectedStores,
    selectedStatuses,
    selectedFlags,
    selectedGenres,
    selectedFeatures,
    sortMode,
    setSortMode,
    filterCounts,
    activeChips,
    totalActiveFilters: activeChips.length,

    toggleStore,
    toggleStatus,
    toggleFlag,
    toggleGenre,
    toggleFeature,
    clearAllFilters,
    removeFilterChip,
    isFilterActive,

    activeFilter,
    setActiveFilter,
    selectFilter,
    cycleFilter,

    groupBy,
    setGroupBy,
    searchQuery,
    setSearchQuery,
    detailsSearchQuery,
    setDetailsSearchQuery,
    collapsedGroups,
    setCollapsedGroups,
    toggleGroup,

    filteredGames,
    groupedGames,
    detailsFilteredGames,
  };
}
