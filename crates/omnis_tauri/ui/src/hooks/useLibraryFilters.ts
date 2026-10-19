import { useState, useMemo } from "react";
import { GameDto, GroupBy, FILTER_ORDER } from "../types";

export function useLibraryFilters(games: GameDto[]) {
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [detailsSearchQuery, setDetailsSearchQuery] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const cycleFilter = (direction: number, onCycle?: (nextFilter: string) => void) => {
    const currentIndex = FILTER_ORDER.indexOf(activeFilter);
    const nextIndex = (currentIndex + direction + FILTER_ORDER.length) % FILTER_ORDER.length;
    const nextFilter = FILTER_ORDER[nextIndex];
    setActiveFilter(nextFilter);
    if (onCycle) onCycle(nextFilter);
  };

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (activeFilter === "installed" && !g.is_installed) return false;
      if (activeFilter === "recent" && g.playtime_seconds === 0) return false;
      if (activeFilter === "favorites" && (g.critic_score || 0) < 90) return false;
      if (activeFilter === "steam" && g.library.toLowerCase() !== "steam") return false;
      if (activeFilter === "gog" && g.library.toLowerCase() !== "gog") return false;
      if (activeFilter === "epic" && g.library.toLowerCase() !== "epic") return false;
      if (activeFilter === "xbox" && g.library.toLowerCase() !== "xbox") return false;
      if (
        activeFilter === "action" &&
        !g.genres.some((x) => x.toLowerCase().includes("azione") || x.toLowerCase().includes("action"))
      )
        return false;
      if (
        activeFilter === "rpg" &&
        !g.genres.some((x) => x.toLowerCase().includes("gdr") || x.toLowerCase().includes("rpg"))
      )
        return false;
      if (
        activeFilter === "strategy" &&
        !g.genres.some((x) => x.toLowerCase().includes("strategia") || x.toLowerCase().includes("puzzle"))
      )
        return false;
      if (activeFilter === "indie" && !g.genres.some((x) => x.toLowerCase().includes("indie"))) return false;

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        return g.title.toLowerCase().includes(query) || g.developers.some((d) => d.toLowerCase().includes(query));
      }
      return true;
    });
  }, [games, activeFilter, searchQuery]);

  const groupedGames = useMemo<Record<string, GameDto[]>>(() => {
    if (groupBy === "none") {
      return { "Tutti i Giochi": filteredGames };
    }

    const groups: Record<string, GameDto[]> = {};

    filteredGames.forEach((game) => {
      let key = "Altro";
      switch (groupBy) {
        case "library":
          key = game.library ? game.library.toUpperCase() : "ALTRO";
          break;
        case "is_installed":
          key = game.is_installed ? "Installati" : "Disponibili per il download";
          break;
        case "genre":
          key = game.genres && game.genres.length > 0 ? game.genres[0] : "Senza Genere";
          break;
        case "developer":
          key = game.developers && game.developers.length > 0 ? game.developers[0] : "Sconosciuto";
          break;
        case "release_year": {
          if (game.release_date) {
            const match = game.release_date.match(/\b(19\d\d|20\d\d)\b/);
            key = match ? match[1] : "Data Sconosciuta";
          } else {
            key = "Data Sconosciuta";
          }
          break;
        }
        case "completion_status": {
          const statusMap: Record<string, string> = {
            NotPlayed: "Non giocato",
            Playing: "In corso",
            Beaten: "Finito",
            Completed: "Completato 100%",
            Abandoned: "Abbandonato",
            Backlog: "Backlog",
            PlanToPlay: "Da iniziare",
          };
          key = statusMap[game.completion_status || "NotPlayed"] || game.completion_status || "Non giocato";
          break;
        }
        default:
          key = "Tutti i Giochi";
      }

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(game);
    });

    return groups;
  }, [filteredGames, groupBy]);

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

  return {
    activeFilter,
    setActiveFilter,
    groupBy,
    setGroupBy,
    searchQuery,
    setSearchQuery,
    detailsSearchQuery,
    setDetailsSearchQuery,
    collapsedGroups,
    setCollapsedGroups,
    toggleGroup,
    cycleFilter,
    filteredGames,
    groupedGames,
    detailsFilteredGames,
  };
}
