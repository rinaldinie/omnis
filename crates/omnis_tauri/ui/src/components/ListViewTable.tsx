import React, { useState, useMemo } from "react";
import {
  Play,
  Info,
  Sliders,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Gamepad2,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { StoreBadge } from "./StoreBadge";

export interface GameItem {
  id: string;
  title: string;
  library: string;
  is_installed: boolean;
  playtime_seconds: number;
  playtime_formatted: string;
  critic_score: number | null;
  release_date: string | null;
  description: string | null;
  cover_image: string | null;
  background_image: string | null;
  icon_image?: string | null;
  series?: string | null;
  completion_status?: string | null;
  user_notes?: string | null;
  custom_links?: Array<{ title: string; url: string }>;
  genres: string[];
  developers: string[];
  publishers?: string[];
}

export type SortField =
  | "title"
  | "library"
  | "is_installed"
  | "playtime_seconds"
  | "critic_score"
  | "series"
  | "completion_status"
  | "release_date";

export type SortDirection = "asc" | "desc";

export interface ListViewTableProps {
  games: GameItem[];
  selectedGameId: string | null;
  onSelectGame: (game: GameItem) => void;
  onOpenDetails: (game: GameItem) => void;
  onLaunchGame: (gameId: string) => void;
  onEditGame: (game: GameItem) => void;
  onContextMenu?: (e: React.MouseEvent, game: GameItem) => void;
  className?: string;
  isGroupedChild?: boolean;
}

// Completion status visual configuration
const COMPLETION_STATUS_MAP: Record<
  string,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  NotPlayed: {
    label: "Non giocato",
    bg: "rgba(148, 163, 184, 0.12)",
    text: "#94a3b8",
    border: "rgba(148, 163, 184, 0.3)",
    dot: "#94a3b8",
  },
  Playing: {
    label: "In corso",
    bg: "rgba(56, 189, 248, 0.12)",
    text: "#38bdf8",
    border: "rgba(56, 189, 248, 0.3)",
    dot: "#38bdf8",
  },
  Beaten: {
    label: "Finito",
    bg: "rgba(168, 85, 247, 0.12)",
    text: "#c084fc",
    border: "rgba(168, 85, 247, 0.3)",
    dot: "#a855f7",
  },
  Completed: {
    label: "Completato 100%",
    bg: "rgba(34, 197, 94, 0.12)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.3)",
    dot: "#22c55e",
  },
  Abandoned: {
    label: "Abbandonato",
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.3)",
    dot: "#ef4444",
  },
  Backlog: {
    label: "Backlog",
    bg: "rgba(245, 158, 11, 0.12)",
    text: "#fbbf24",
    border: "rgba(245, 158, 11, 0.3)",
    dot: "#f59e0b",
  },
  PlanToPlay: {
    label: "Da iniziare",
    bg: "rgba(99, 102, 241, 0.12)",
    text: "#818cf8",
    border: "rgba(99, 102, 241, 0.3)",
    dot: "#6366f1",
  },
};

export default function ListViewTable({
  games,
  selectedGameId,
  onSelectGame,
  onOpenDetails,
  onLaunchGame,
  onEditGame,
  onContextMenu,
  className = "",
  isGroupedChild = false,
}: ListViewTableProps) {
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // For score or playtime, descending order is often the natural first click
      if (field === "critic_score" || field === "playtime_seconds") {
        setSortDirection("desc");
      } else {
        setSortDirection("asc");
      }
    }
  };

  const sortedGames = useMemo(() => {
    const list = [...games];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "title":
          cmp = (a.title || "").localeCompare(b.title || "", undefined, {
            numeric: true,
            sensitivity: "base",
          });
          break;
        case "library":
          cmp = (a.library || "").localeCompare(b.library || "");
          break;
        case "is_installed":
          cmp = (a.is_installed ? 1 : 0) - (b.is_installed ? 1 : 0);
          break;
        case "playtime_seconds":
          cmp = (a.playtime_seconds || 0) - (b.playtime_seconds || 0);
          break;
        case "critic_score":
          cmp = (a.critic_score ?? -1) - (b.critic_score ?? -1);
          break;
        case "series":
          cmp = (a.series || "").localeCompare(b.series || "");
          break;
        case "completion_status":
          cmp = (a.completion_status || "NotPlayed").localeCompare(
            b.completion_status || "NotPlayed"
          );
          break;
        case "release_date":
          cmp = (a.release_date || "").localeCompare(b.release_date || "");
          break;
        default:
          cmp = 0;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return list;
  }, [games, sortField, sortDirection]);

  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) {
      return (
        <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-75 transition-opacity inline-block ml-1" />
      );
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-400 inline-block ml-1 shrink-0" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-400 inline-block ml-1 shrink-0" />
    );
  };

  const formatPlaytime = (seconds: number, formatted: string) => {
    if (!seconds || seconds <= 0) {
      return <span style={{ color: "var(--text-muted)", opacity: 0.7 }}>Non giocato</span>;
    }
    return <span className="font-mono text-emerald-400 font-semibold">{formatted}</span>;
  };

  const renderScoreBadge = (score: number | null) => {
    if (score === null || score === undefined || score <= 0) {
      return <span style={{ color: "var(--text-muted)", opacity: 0.6 }}>-</span>;
    }
    let bg = "bg-rose-500/20";
    let text = "text-rose-400";
    let border = "border-rose-500/30";

    if (score >= 85) {
      bg = "bg-emerald-500/20";
      text = "text-emerald-400";
      border = "border-emerald-500/30";
    } else if (score >= 70) {
      bg = "bg-amber-500/20";
      text = "text-amber-300";
      border = "border-amber-500/30";
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-black border ${bg} ${text} ${border} shadow-sm`}
      >
        <span className="text-[10px]">★</span>
        <span>{score}</span>
      </span>
    );
  };

  const renderCompletionBadge = (status: string | null | undefined) => {
    const key = status || "NotPlayed";
    const cfg = COMPLETION_STATUS_MAP[key] || {
      label: key,
      bg: "rgba(148, 163, 184, 0.12)",
      text: "#94a3b8",
      border: "rgba(148, 163, 184, 0.3)",
      dot: "#94a3b8",
    };

    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide whitespace-nowrap"
        style={{
          backgroundColor: cfg.bg,
          color: cfg.text,
          borderColor: cfg.border,
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: cfg.dot }}
        />
        <span>{cfg.label}</span>
      </span>
    );
  };

  return (
    <div
      className={`w-full overflow-x-auto select-none rounded-xl border shadow-lg ${
        isGroupedChild ? "border-t-0 rounded-t-none" : ""
      } ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <table className="w-full text-left border-collapse text-xs">
        {/* TABLE HEADER */}
        <thead>
          <tr
            className="border-b text-[10px] font-black uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md"
            style={{
              backgroundColor: "var(--bg-surface)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
          >
            {/* 1. Icon */}
            <th className="py-2.5 px-3 w-12 text-center">Icona</th>

            {/* 2. Title */}
            <th
              onClick={() => handleHeaderClick("title")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group"
            >
              <div className="flex items-center gap-1">
                <span>Titolo</span>
                {renderSortArrow("title")}
              </div>
            </th>

            {/* 3. Store / Platform */}
            <th
              onClick={() => handleHeaderClick("library")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-28"
            >
              <div className="flex items-center gap-1">
                <span>Store</span>
                {renderSortArrow("library")}
              </div>
            </th>

            {/* 4. Status (Installed / Available) */}
            <th
              onClick={() => handleHeaderClick("is_installed")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-28"
            >
              <div className="flex items-center gap-1">
                <span>Stato</span>
                {renderSortArrow("is_installed")}
              </div>
            </th>

            {/* 5. Playtime */}
            <th
              onClick={() => handleHeaderClick("playtime_seconds")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-32"
            >
              <div className="flex items-center gap-1">
                <span>Tempo Gioco</span>
                {renderSortArrow("playtime_seconds")}
              </div>
            </th>

            {/* 6. Critic Score */}
            <th
              onClick={() => handleHeaderClick("critic_score")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-24 text-center"
            >
              <div className="flex items-center justify-center gap-1">
                <span>Voto</span>
                {renderSortArrow("critic_score")}
              </div>
            </th>

            {/* 7. Series */}
            <th
              onClick={() => handleHeaderClick("series")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-36"
            >
              <div className="flex items-center gap-1">
                <span>Serie</span>
                {renderSortArrow("series")}
              </div>
            </th>

            {/* 8. Completion Status */}
            <th
              onClick={() => handleHeaderClick("completion_status")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-36"
            >
              <div className="flex items-center gap-1">
                <span>Completamento</span>
                {renderSortArrow("completion_status")}
              </div>
            </th>

            {/* 9. Release Date */}
            <th
              onClick={() => handleHeaderClick("release_date")}
              className="py-2.5 px-3.5 cursor-pointer hover:text-white transition-colors group w-32"
            >
              <div className="flex items-center gap-1">
                <span>Uscita</span>
                {renderSortArrow("release_date")}
              </div>
            </th>

            {/* 10. Actions */}
            <th className="py-2.5 px-3.5 text-right pr-4 w-44">Azioni</th>
          </tr>
        </thead>

        {/* TABLE BODY */}
        <tbody
          className="divide-y font-medium transition-colors"
          style={{ borderColor: "var(--border-color)" }}
        >
          {sortedGames.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="py-8 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Nessun gioco corrisponde ai criteri attuali
              </td>
            </tr>
          ) : (
            sortedGames.map((game, index) => {
              const isSelected = selectedGameId === game.id;
              const thumbnailSrc = game.icon_image || game.cover_image;

              return (
                <tr
                  key={game.id}
                  onClick={() => onSelectGame(game)}
                  onContextMenu={(e) => onContextMenu && onContextMenu(e, game)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    if (game.is_installed) {
                      onLaunchGame(game.id);
                    } else {
                      onOpenDetails(game);
                    }
                  }}
                  className={`cursor-pointer transition-colors group ${
                    isSelected ? "ring-1 ring-inset" : "hover:bg-white/[0.04]"
                  } ${index % 2 === 1 ? "bg-black/[0.12]" : ""}`}
                  style={{
                    backgroundColor: isSelected ? "var(--bg-surface)" : undefined,
                    outlineColor: isSelected ? "var(--accent-primary)" : undefined,
                    contentVisibility: "auto",
                    containIntrinsicSize: "0 48px",
                  }}
                  title="Fai doppio clic per avviare o aprire la scheda"
                >
                  {/* 1. Icon / Thumbnail (32x32 rounded with fallback) */}
                  <td className="py-2 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <div
                        className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center border shadow-sm shrink-0"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                      >
                        {thumbnailSrc ? (
                          <img
                            src={thumbnailSrc}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-[10px] font-black"
                            style={{
                              backgroundColor: "var(--accent-glow)",
                              color: "var(--accent-primary)",
                            }}
                          >
                            {game.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Title */}
                  <td className="py-2.5 px-3.5 font-bold text-white max-w-xs">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={game.title}>
                        {game.title}
                      </span>
                    </div>
                  </td>

                  {/* 3. Store / Platform */}
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    <StoreBadge library={game.library} showName={true} />
                  </td>

                  {/* 4. Status (Installed / Available) */}
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    {game.is_installed ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                        <span>Installato</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800/40 text-slate-400 border border-slate-700/50">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span>Disponibile</span>
                      </span>
                    )}
                  </td>

                  {/* 5. Playtime */}
                  <td className="py-2.5 px-3.5 whitespace-nowrap text-xs">
                    {formatPlaytime(game.playtime_seconds, game.playtime_formatted)}
                  </td>

                  {/* 6. Critic Score */}
                  <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                    {renderScoreBadge(game.critic_score)}
                  </td>

                  {/* 7. Series */}
                  <td
                    className="py-2.5 px-3.5 truncate max-w-[140px]"
                    style={{ color: "var(--text-primary)" }}
                    title={game.series || ""}
                  >
                    {game.series ? (
                      <span className="font-semibold text-slate-300">{game.series}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>-</span>
                    )}
                  </td>

                  {/* 8. Completion Status */}
                  <td className="py-2.5 px-3.5 whitespace-nowrap">
                    {renderCompletionBadge(game.completion_status)}
                  </td>

                  {/* 9. Release Date */}
                  <td
                    className="py-2.5 px-3.5 whitespace-nowrap text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {game.release_date || "-"}
                  </td>

                  {/* 10. Quick Actions */}
                  <td className="py-2 px-3.5 text-right pr-4 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Play Button (if installed) */}
                      {game.is_installed ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchGame(game.id);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-white transition-all transform hover:scale-105 active:scale-95 shadow-sm"
                          style={{
                            backgroundColor: "var(--accent-primary)",
                            boxShadow: `0 0 10px var(--accent-glow)`,
                          }}
                          title="Avvia gioco"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Gioca</span>
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetails(game);
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-500 transition-colors"
                          style={{ backgroundColor: "var(--bg-surface)" }}
                          title="Installa o visualizza dettagli"
                        >
                          <span>Installa</span>
                        </button>
                      )}

                      {/* Details Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(game);
                        }}
                        className="p-1 rounded-md border text-slate-300 hover:text-white transition-all hover:bg-white/10"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                        title="Apri scheda dettagli completa"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>

                      {/* Edit Modal Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditGame(game);
                        }}
                        className="p-1 rounded-md border text-slate-300 hover:text-white transition-all hover:bg-white/10"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                        title="Modifica metadati (GameEditorModal)"
                      >
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
