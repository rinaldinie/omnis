import React, { useState, useMemo } from "react";
import {
  Play,
  Info,
  Sliders,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Download,
  EyeOff,
} from "lucide-react";
import { StoreBadge, StoreIcon } from "../common/StoreBadge";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { ActionTooltip } from "../ui/tooltip";

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
  is_hidden?: boolean;
  other_copies?: Array<{
    id: string;
    title: string;
    library: string;
    is_installed: boolean;
    playtime_seconds: number;
    playtime_formatted: string;
    is_hidden: boolean;
  }>;
}

export type SortField =
  | "title"
  | "library"
  | "is_installed"
  | "playtime_seconds"
  | "critic_score"
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
      let cmp: number;
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
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold border ${bg} ${text} ${border}`}
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
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border tracking-tight whitespace-nowrap"
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
      <Table>
        {/* TABLE HEADER */}
        <TableHeader>
          <TableRow
            className="border-b border-white/[0.08] text-[10px] font-black uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md hover:bg-transparent"
            style={{
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-muted)",
            }}
          >
            {/* 1. Cover */}
            <TableHead className="py-2 px-3 w-12 text-center">{t('table.cover')}</TableHead>

            {/* 2. Title */}
            <TableHead
              onClick={() => handleHeaderClick("title")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group min-w-[180px]"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.title')}</span>
                {renderSortArrow("title")}
              </div>
            </TableHead>

            {/* 3. Store / Platform */}
            <TableHead
              onClick={() => handleHeaderClick("library")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-28"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.platform')}</span>
                {renderSortArrow("library")}
              </div>
            </TableHead>

            {/* 4. Status (Installed / Available) */}
            <TableHead
              onClick={() => handleHeaderClick("is_installed")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.status')}</span>
                {renderSortArrow("is_installed")}
              </div>
            </TableHead>

            {/* 5. Playtime */}
            <TableHead
              onClick={() => handleHeaderClick("playtime_seconds")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.playtime')}</span>
                {renderSortArrow("playtime_seconds")}
              </div>
            </TableHead>

            {/* 6. Critic Score */}
            <TableHead
              onClick={() => handleHeaderClick("critic_score")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-20 text-center"
            >
              <div className="flex items-center justify-center gap-1">
                <span>{t('table.critic_score')}</span>
                {renderSortArrow("critic_score")}
              </div>
            </TableHead>

            {/* 7. Completion Status */}
            <TableHead
              onClick={() => handleHeaderClick("completion_status")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-32"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.completion')}</span>
                {renderSortArrow("completion_status")}
              </div>
            </TableHead>

            {/* 8. Release Date */}
            <TableHead
              onClick={() => handleHeaderClick("release_date")}
              className="py-2 px-3 cursor-pointer hover:text-white transition-colors group w-24"
            >
              <div className="flex items-center gap-1">
                <span>{t('table.release_date')}</span>
                {renderSortArrow("release_date")}
              </div>
            </TableHead>

            {/* 9. Actions */}
            <TableHead className="py-2 px-3 text-right pr-3 w-28">{t('table.actions')}</TableHead>
          </TableRow>
        </TableHeader>

        {/* TABLE BODY */}
        <TableBody className="divide-y divide-white/[0.04] font-medium transition-colors">
          {sortedGames.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={9}
                className="py-8 text-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t('table.no_games_found')}
              </TableCell>
            </TableRow>
          ) : (
            sortedGames.map((game, index) => {
              const isSelected = selectedGameId === game.id;
              const thumbnailSrc = game.icon_image || game.cover_image;

              return (
                <TableRow
                  key={game.id}
                  data-state={isSelected ? "selected" : undefined}
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
                    containIntrinsicSize: "0 46px",
                  }}
                  title={t("list_table.row_hint")}
                >
                  {/* 1. Icon / Thumbnail (Compact vertical cover poster with fallback) */}
                  <TableCell className="py-1.5 px-3 text-center">
                    <div className="flex items-center justify-center">
                      <div
                        className="w-8 h-10.5 rounded-md overflow-hidden flex items-center justify-center border border-white/10 shadow-xs shrink-0 transition-transform group-hover:scale-105"
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
                  </TableCell>

                  {/* 2. Title */}
                  <TableCell className="py-1.5 px-3 font-semibold text-white max-w-xs md:max-w-sm">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate block text-xs md:text-sm font-bold tracking-tight text-white group-hover:text-indigo-300 transition-colors"
                        title={game.title}
                      >
                        {game.title}
                      </span>
                      {game.is_hidden && (
                        <Badge variant="outline" className="gap-1 px-1.5 py-0 rounded text-[9px] font-semibold bg-rose-500/15 text-rose-300 border-rose-500/30 shrink-0">
                          <EyeOff className="w-2.5 h-2.5" />
                          <span>{t("sidebar.hidden")}</span>
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* 3. Store / Platform */}
                  <TableCell className="py-1.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <StoreBadge library={game.library} />
                      {game.other_copies && game.other_copies.length > 0 && (
                        <ActionTooltip label={t("duplicate_hider.other_copies")}>
                          <span className="flex items-center gap-1 pl-1 border-l border-white/10">
                            {game.other_copies.map((copy) => (
                              <ActionTooltip
                                key={copy.id}
                                label={`${copy.library.toUpperCase()} ${
                                  copy.is_installed ? `(${t("groups.installed")})` : ""
                                }`}
                              >
                                <span
                                  className={`inline-flex items-center justify-center p-1 rounded-full bg-slate-900/80 border border-white/20 ${
                                    copy.is_installed
                                      ? "border-emerald-400/70 text-emerald-300 ring-1 ring-emerald-400/30"
                                      : "text-white/80"
                                  }`}
                                >
                                  <StoreIcon library={copy.library} className="w-3.5 h-3.5" />
                                </span>
                              </ActionTooltip>
                            ))}
                          </span>
                        </ActionTooltip>
                      )}
                    </div>
                  </TableCell>

                  {/* 4. Status (Installed / Available) */}
                  <TableCell className="py-1.5 px-3 whitespace-nowrap">
                    {game.is_installed ? (
                      <Badge variant="success" className="gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>{t("groups.installed")}</span>
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800/40 text-slate-400 border-slate-700/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span>Cloud</span>
                      </Badge>
                    )}
                  </TableCell>

                  {/* 5. Playtime */}
                  <TableCell className="py-1.5 px-3 whitespace-nowrap text-xs font-semibold">
                    {formatPlaytime(game.playtime_seconds, game.playtime_formatted)}
                  </TableCell>

                  {/* 6. Critic Score */}
                  <TableCell className="py-1.5 px-3 text-center whitespace-nowrap">
                    {renderScoreBadge(game.critic_score)}
                  </TableCell>

                  {/* 7. Completion Status */}
                  <TableCell className="py-1.5 px-3 whitespace-nowrap">
                    {renderCompletionBadge(game.completion_status)}
                  </TableCell>

                  {/* 8. Release Date */}
                  <TableCell
                    className="py-1.5 px-3 whitespace-nowrap text-xs font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {game.release_date || "-"}
                  </TableCell>

                  {/* 9. Quick Actions */}
                  <TableCell className="py-1.5 px-3 text-right pr-3 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      {/* Play Button (if installed) */}
                      {game.is_installed ? (
                        <ActionTooltip label={t('common.play')}>
                          <Button
                            type="button"
                            size="icon-xs"
                            aria-label={t('common.play')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchGame(game.id);
                            }}
                            className="w-7 h-7 rounded-md text-white hover:scale-105 hover:brightness-125 active:scale-95 shadow-xs"
                            style={{
                              backgroundColor: "var(--accent-primary)",
                            }}
                          >
                            <Play className="w-3 h-3 fill-white" />
                          </Button>
                        </ActionTooltip>
                      ) : (
                        <ActionTooltip label={t('common.install')}>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-xs"
                            aria-label={t('common.install')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onLaunchGame(game.id);
                            }}
                            className="w-7 h-7 rounded-md text-indigo-300 hover:text-white border-indigo-500/40 hover:bg-indigo-500/25 hover:scale-105 active:scale-95 shadow-xs"
                            style={{ backgroundColor: "rgba(99, 102, 241, 0.15)" }}
                          >
                            <Download className="w-3 h-3 text-indigo-300" />
                          </Button>
                        </ActionTooltip>
                      )}

                      {/* Details Button */}
                      <ActionTooltip label={t("context_menu.view_details")}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          aria-label={t("context_menu.view_details")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetails(game);
                          }}
                          className="w-7 h-7 rounded-md text-slate-300 hover:text-white hover:bg-white/10 hover:border-slate-400 shadow-xs"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <Info className="w-3 h-3" />
                        </Button>
                      </ActionTooltip>

                      {/* Edit Modal Button */}
                      <ActionTooltip label={t("game_details.edit_manual")}>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-xs"
                          aria-label={t("game_details.edit_manual")}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditGame(game);
                          }}
                          className="w-7 h-7 rounded-md text-slate-300 hover:text-white hover:bg-white/10 hover:border-slate-400 shadow-xs"
                          style={{
                            backgroundColor: "var(--bg-surface)",
                            borderColor: "var(--border-color)",
                          }}
                        >
                          <Sliders className="w-3 h-3 text-indigo-400" />
                        </Button>
                      </ActionTooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
