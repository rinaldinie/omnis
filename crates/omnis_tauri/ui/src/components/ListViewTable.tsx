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
  Download,
} from "lucide-react";
import { StoreBadge } from "./StoreBadge";
import { useTranslation, TranslationSchema } from "../i18n";

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
  features?: string[];
  custom_links?: Array<{ title: string; url: string }>;
  extra_metadata?: string | null;
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
  const { t } = useTranslation();
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
      return <span style={{ color: "var(--text-muted)", opacity: 0.7 }}>{t('game_details.not_played')}</span>;
    }
    return <span className="font-mono text-emerald-400 font-semibold">{formatted}</span>;
  };

  const renderScoreBadge = (score: number | null) => {
    if (score === null || score === undefined || score <= 0) {
      return <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>-</span>;
    }
    let bg = "bg-rose-500/15";
    let text = "text-rose-400";
    let border = "border-rose-500/25";

    if (score >= 85) {
      bg = "bg-emerald-500/15";
      text = "text-emerald-400";
      border = "border-emerald-500/25";
    } else if (score >= 70) {
      bg = "bg-amber-500/15";
      text = "text-amber-300";
      border = "border-amber-500/25";
    }

    return (
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border ${bg} ${text} ${border}`}
      >
        <span className="text-[9px]">★</span>
        <span>{score}</span>
      </span>
    );
  };

  const renderCompletionBadge = (status: string | null | undefined) => {
    const key = status || "NotPlayed";
    const cfg = COMPLETION_STATUS_MAP[key] || {
      label: key,
      bg: "rgba(148, 163, 184, 0.1)",
      text: "#94a3b8",
      border: "rgba(148, 163, 184, 0.25)",
      dot: "#94a3b8",
    };

    const statusMap: Record<string, string> = {
      NotPlayed: t('completion_status.not_played'),
      Playing: t('completion_status.playing'),
      Beaten: t('completion_status.beaten'),
      Completed: t('completion_status.completed'),
      Abandoned: t('completion_status.abandoned'),
      Backlog: t('completion_status.backlog'),
      PlanToPlay: t('completion_status.plan_to_play'),
    };
    const displayLabel = statusMap[key] || cfg.label;

    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border tracking-tight whitespace-nowrap"
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
        <span>{displayLabel}</span>
      </span>
    );
  };

  return (
    <div
      className={`w-full overflow-x-auto select-none rounded-xl border border-white/[0.06] shadow-xl ${
        isGroupedChild ? "border-t-0 rounded-t-none" : ""
      } ${className}`}
      style={{
        backgroundColor: "var(--bg-card)",
      }}
    >
      <table className="w-full text-left border-collapse text-xs">
        {/* TABLE HEADER */}
        <thead>
          <tr
            className="border-b border-white/[0.06] text-[10px] font-black uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            {/* 1. Icon */}
            <th className="py-2 px-2.5 w-10 text-center">{t('table.cover')}</th>

            {/* 2. Title */}
            <th
              onClick={() => handleHeaderClick("title")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group min-w-[160px]"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.title')}</span>
                {renderSortArrow("title")}
              </div>
            </th>

            {/* 3. Store / Platform */}
            <th
              onClick={() => handleHeaderClick("library")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.platform')}</span>
                {renderSortArrow("library")}
              </div>
            </th>

            {/* 4. Status (Installed / Available) */}
            <th
              onClick={() => handleHeaderClick("is_installed")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.status')}</span>
                {renderSortArrow("is_installed")}
              </div>
            </th>

            {/* 5. Playtime */}
            <th
              onClick={() => handleHeaderClick("playtime_seconds")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.playtime')}</span>
                {renderSortArrow("playtime_seconds")}
              </div>
            </th>

            {/* 6. Critic Score */}
            <th
              onClick={() => handleHeaderClick("critic_score")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-16 text-center"
            >
              <div className="flex items-center justify-center gap-1">
                <span>{t('table.critic_score')}</span>
                {renderSortArrow("critic_score")}
              </div>
            </th>

            {/* 7. Series */}
            <th
              onClick={() => handleHeaderClick("series")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-28"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.series')}</span>
                {renderSortArrow("series")}
              </div>
            </th>

            {/* 8. Completion Status */}
            <th
              onClick={() => handleHeaderClick("completion_status")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-28"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.completion')}</span>
                {renderSortArrow("completion_status")}
              </div>
            </th>

            {/* 9. Release Date */}
            <th
              onClick={() => handleHeaderClick("release_date")}
              className="py-2 px-2.5 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.release_date')}</span>
                {renderSortArrow("release_date")}
              </div>
            </th>

            {/* 10. Actions */}
            <th className="py-2 px-2.5 text-right pr-3 w-28">{t('table.actions')}</th>
          </tr>
        </thead>

        {/* TABLE BODY */}
        <tbody
          className="divide-y divide-white/[0.04] font-medium transition-colors"
        >
          {sortedGames.length === 0 ? (
            <tr>
              <td
                colSpan={10}
                className="py-8 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t('table.no_games_found')}
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
                    isSelected ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                  } ${index % 2 === 1 ? "bg-white/[0.01]" : ""}`}
                  style={{
                    backgroundColor: isSelected ? "var(--bg-surface)" : undefined,
                    contentVisibility: "auto",
                    containIntrinsicSize: "0 34px",
                  }}
                  title={t("list_table.row_hint")}
                >
                  {/* 1. Icon / Thumbnail (24x24 rounded with fallback) */}
                  <td className="py-1 px-2.5 text-center">
                    <div className="flex items-center justify-center">
                      <div
                        className="w-6 h-6 rounded overflow-hidden flex items-center justify-center border border-white/[0.08] shadow-xs shrink-0"
                        style={{
                          backgroundColor: "var(--bg-surface)",
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
                            className="w-full h-full flex items-center justify-center text-[9px] font-black"
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
                  <td className="py-1 px-2.5 font-medium text-white max-w-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold" title={game.title}>
                        {game.title}
                      </span>
                    </div>
                  </td>

                  {/* 3. Store / Platform */}
                  <td className="py-1 px-2.5 whitespace-nowrap">
                    <StoreBadge library={game.library} showName={true} className="scale-95 origin-left" />
                  </td>

                  {/* 4. Status (Installed / Available) */}
                  <td className="py-1 px-2.5 whitespace-nowrap">
                    {game.is_installed ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>{t("groups.installed")}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800/30 text-slate-400 border border-slate-700/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span>Cloud</span>
                      </span>
                    )}
                  </td>

                  {/* 5. Playtime */}
                  <td className="py-1 px-2.5 whitespace-nowrap text-xs">
                    {formatPlaytime(game.playtime_seconds, game.playtime_formatted)}
                  </td>

                  {/* 6. Critic Score */}
                  <td className="py-1 px-2.5 text-center whitespace-nowrap">
                    {renderScoreBadge(game.critic_score)}
                  </td>

                  {/* 7. Series */}
                  <td
                    className="py-1 px-2.5 truncate max-w-[120px] text-xs"
                    style={{ color: "var(--text-primary)" }}
                    title={game.series || ""}
                  >
                    {game.series ? (
                      <span className="text-slate-300 font-medium">{game.series}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)", opacity: 0.4 }}>-</span>
                    )}
                  </td>

                  {/* 8. Completion Status */}
                  <td className="py-1 px-2.5 whitespace-nowrap">
                    {renderCompletionBadge(game.completion_status)}
                  </td>

                  {/* 9. Release Date */}
                  <td
                    className="py-1 px-2.5 whitespace-nowrap text-[11px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {game.release_date || "-"}
                  </td>

                  {/* 10. Quick Actions */}
                  <td className="py-1 px-2.5 text-right pr-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {/* Play Button (if installed) */}
                      {game.is_installed ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchGame(game.id);
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-white transition-all hover:brightness-125 active:opacity-90 shadow-xs"
                          style={{
                            backgroundColor: "var(--accent-primary)",
                          }}
                          title={t('common.play')}
                        >
                          <Play className="w-3 h-3 fill-white" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchGame(game.id);
                          }}
                          className="w-6 h-6 rounded flex items-center justify-center text-indigo-300 hover:text-white border border-indigo-500/40 hover:bg-indigo-500/20 transition-all shadow-xs"
                          style={{ backgroundColor: "rgba(99, 102, 241, 0.15)" }}
                          title={t('common.install')}
                        >
                          <Download className="w-3 h-3 text-indigo-300" />
                        </button>
                      )}

                      {/* Details Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(game);
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center border text-slate-300 hover:text-white transition-all hover:bg-white/10"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                        title={t("context_menu.view_details")}
                      >
                        <Info className="w-3 h-3" />
                      </button>

                      {/* Edit Modal Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditGame(game);
                        }}
                        className="w-6 h-6 rounded flex items-center justify-center border text-slate-300 hover:text-white transition-all hover:bg-white/10"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                        }}
                        title={t("game_details.edit_manual")}
                      >
                        <Sliders className="w-3 h-3 text-indigo-400" />
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
