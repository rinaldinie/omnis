import React, { useEffect, useRef, useState } from "react";
import { Play, Download, Pencil, Search, Info, FolderOpen, Monitor, ShieldCheck, Trash2, XCircle, CheckCircle2, ChevronRight, Check, Eye, EyeOff, Layers, Star } from "lucide-react";
import { GameDto } from "../../types";
import { StoreIcon } from "./StoreBadge";
import { useTranslation } from "../../i18n";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ActionTooltip } from "../ui/tooltip";
import { cn } from "@/lib/utils";

const COMPLETION_STATUS_OPTIONS = [
  { value: "NotPlayed", key: "not_played", dot: "bg-slate-400" },
  { value: "Playing", key: "playing", dot: "bg-sky-400" },
  { value: "Beaten", key: "beaten", dot: "bg-purple-400" },
  { value: "Completed", key: "completed", dot: "bg-emerald-400" },
  { value: "PlanToPlay", key: "plan_to_play", dot: "bg-indigo-400" },
  { value: "Backlog", key: "backlog", dot: "bg-amber-400" },
  { value: "Abandoned", key: "abandoned", dot: "bg-rose-400" },
];

interface GlobalContextMenuProps {
  contextMenu: {
    x: number;
    y: number;
    game: GameDto;
  } | null;
  onClose: () => void;
  onLaunch: (gameId: string) => void;
  onEdit: (game: GameDto) => void;
  onResolve: (game: GameDto) => void;
  onShowDetails: (game: GameDto) => void;
  onUpdateCompletionStatus?: (game: GameDto, status: string) => void;
  onOpenFolder?: (game: GameDto) => void;
  onCreateShortcut?: (game: GameDto) => void;
  onVerifyFiles?: (game: GameDto) => void;
  onUninstall?: (game: GameDto) => void;
  onRemoveFromLibrary?: (game: GameDto) => void;
  onToggleHidden?: (game: GameDto) => void;
  onToggleFavorite?: (game: GameDto) => void;
  onPromoteCopy?: (copyId: string) => void;
}

export default function GlobalContextMenu({
  contextMenu,
  onClose,
  onLaunch,
  onEdit,
  onResolve,
  onShowDetails,
  onUpdateCompletionStatus,
  onOpenFolder,
  onCreateShortcut,
  onVerifyFiles,
  onUninstall,
  onRemoveFromLibrary,
  onToggleHidden,
  onToggleFavorite,
  onPromoteCopy,
}: GlobalContextMenuProps) {
  const { t } = useTranslation();
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const [showCopiesSubmenu, setShowCopiesSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) {
      setShowStatusSubmenu(false);
      setShowCopiesSubmenu(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(
          menuRef.current?.querySelectorAll<HTMLButtonElement>(':scope > [role="menuitem"], :scope > div > [role="menuitem"]') ?? []
        );
        if (items.length === 0) return;
        e.preventDefault();
        const activeIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        const nextIdx =
          e.key === "ArrowDown"
            ? (activeIdx + 1) % items.length
            : (activeIdx - 1 + items.length) % items.length;
        items[nextIdx]?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [contextMenu, onClose]);

  if (!contextMenu) return null;

  const currentStatus = contextMenu.game.completion_status || "NotPlayed";

  const renderMenuButton = ({
    onClick,
    className,
    children,
  }: {
    onClick: () => void;
    className?: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      role="menuitem"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "w-full h-auto justify-start gap-2.5 px-3.5 py-2 rounded-none text-left text-xs font-medium text-slate-300 hover:text-white hover:bg-white/5",
        className
      )}
    >
      {children}
    </Button>
  );

  return (
    <>
      {/* Transparent Backdrop to dismiss context menu safely on any click outside */}
      <div
        className="fixed inset-0 z-[9998]"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label={contextMenu.game.title}
        className="fixed z-[9999] py-1.5 w-60 rounded-xl border shadow-2xl backdrop-blur-xl select-none text-xs"
        style={{
          left: `${contextMenu.x}px`,
          top: `${contextMenu.y}px`,
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 py-2 border-b mb-1" style={{ borderColor: "var(--border-color)" }}>
          <span className="font-extrabold text-white truncate block text-xs">
            {contextMenu.game.title}
          </span>
          <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
            {(contextMenu.game.library || "").toUpperCase()} •{" "}
            {contextMenu.game.is_installed ? t("groups.installed") : t("groups.available")}
          </span>
        </div>

        {contextMenu.game.is_installed
          ? renderMenuButton({
              onClick: () => {
                onLaunch(contextMenu.game.id);
                onClose();
              },
              className: "font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10",
              children: (
                <>
                  <Play className="w-3.5 h-3.5 fill-emerald-400" />
                  <span>{t("context_menu.launch")}</span>
                </>
              ),
            })
          : renderMenuButton({
              onClick: () => {
                onLaunch(contextMenu.game.id);
                onClose();
              },
              className: "font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10",
              children: (
                <>
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t("context_menu.install_native")}</span>
                </>
              ),
            })}

        {renderMenuButton({
          onClick: () => {
            onEdit(contextMenu.game);
            onClose();
          },
          className: "font-bold text-indigo-300 hover:text-indigo-200 hover:bg-indigo-500/10",
          children: (
            <>
              <Pencil className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t("context_menu.edit_manual")}</span>
            </>
          ),
        })}

        {renderMenuButton({
          onClick: () => {
            onResolve(contextMenu.game);
            onClose();
          },
          className: "font-bold text-sky-300 hover:text-sky-200 hover:bg-sky-500/10",
          children: (
            <>
              <Search className="w-3.5 h-3.5 text-sky-400" />
              <span>{t("context_menu.identify_metadata")}</span>
            </>
          ),
        })}

        {renderMenuButton({
          onClick: () => {
            onShowDetails(contextMenu.game);
            onClose();
          },
          className: "text-white/90 hover:text-white",
          children: (
            <>
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>{t("context_menu.view_details")}</span>
            </>
          ),
        })}

        {/* Completion Status Submenu Trigger */}
        {onUpdateCompletionStatus && (
          <div
            className="relative"
            onMouseEnter={() => setShowStatusSubmenu(true)}
            onMouseLeave={() => setShowStatusSubmenu(false)}
          >
            <Button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={showStatusSubmenu}
              variant="ghost"
              onClick={() => setShowStatusSubmenu((v) => !v)}
              className="w-full h-auto justify-between px-3.5 py-2 rounded-none text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-white/5"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("groups.completion_status")}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </Button>

            {showStatusSubmenu && (
              <div
                role="menu"
                aria-label={t("groups.completion_status")}
                className={`absolute top-0 ${
                  contextMenu.x + 440 > window.innerWidth ? "right-full mr-1" : "left-full ml-1"
                } w-48 py-1.5 rounded-xl border shadow-2xl backdrop-blur-xl z-[10000]`}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  boxShadow: "0 12px 36px rgba(0,0,0,0.8)",
                }}
              >
                {COMPLETION_STATUS_OPTIONS.map((opt) => {
                  const isSelected = currentStatus.toLowerCase() === opt.value.toLowerCase();
                  return (
                    <Button
                      key={opt.value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      variant="ghost"
                      onClick={() => {
                        onUpdateCompletionStatus(contextMenu.game, opt.value);
                        onClose();
                      }}
                      className={`w-full h-auto justify-between px-3 py-1.5 rounded-none text-left text-xs ${
                        isSelected
                          ? "bg-indigo-600/20 text-white font-semibold hover:bg-indigo-600/30"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                        <span>{t(`completion_status.${opt.key}`)}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Other Copies Submenu Trigger */}
        {contextMenu.game.other_copies &&
          contextMenu.game.other_copies.length > 0 &&
          (typeof localStorage === "undefined" ||
            localStorage.getItem("omnis_dh_copies_in_menu") !== "false") && (
            <div
              className="relative"
              onMouseEnter={() => setShowCopiesSubmenu(true)}
              onMouseLeave={() => setShowCopiesSubmenu(false)}
            >
              <Button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={showCopiesSubmenu}
                variant="ghost"
                onClick={() => setShowCopiesSubmenu((v) => !v)}
                className="w-full h-auto justify-between px-3.5 py-2 rounded-none text-left text-xs font-medium text-slate-200 hover:text-white hover:bg-white/5"
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t("duplicate_hider.other_copies")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 text-slate-300 bg-white/5 border-transparent">
                    {contextMenu.game.other_copies.length}
                  </Badge>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </Button>

              {showCopiesSubmenu && (
                <div
                  role="menu"
                  aria-label={t("duplicate_hider.other_copies")}
                  className={`absolute top-0 ${
                    contextMenu.x + 440 > window.innerWidth ? "right-full mr-1" : "left-full ml-1"
                  } w-64 py-1.5 rounded-xl border shadow-2xl backdrop-blur-xl z-[10000]`}
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.8)",
                  }}
                >
                  <div
                    className="px-3 py-1.5 border-b text-[10px] font-bold text-slate-400 uppercase tracking-wider"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    {t("duplicate_hider.available_copies")}
                  </div>
                  {contextMenu.game.other_copies.map((copy) => (
                    <div
                      key={copy.id}
                      className="p-2 border-b last:border-b-0 space-y-1.5"
                      style={{ borderColor: "var(--border-color)" }}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <StoreIcon library={copy.library} className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-semibold text-white truncate text-xs">
                            {copy.library.toUpperCase()}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              copy.is_installed ? "bg-emerald-400" : "bg-slate-500"
                            }`}
                          />
                          <span>{copy.is_installed ? t("groups.installed") : t("groups.available")}</span>
                        </span>
                      </div>
                      {copy.playtime_formatted && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {copy.playtime_formatted}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <ActionTooltip label={t("duplicate_hider.launch_copy", { store: copy.library.toUpperCase() })}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              onLaunch(copy.id);
                              onClose();
                            }}
                            className="flex-1 h-auto py-1 px-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[10px] font-semibold"
                            aria-label={t("duplicate_hider.launch_copy", { store: copy.library.toUpperCase() })}
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>{copy.is_installed ? t("common.play") : t("common.install")}</span>
                          </Button>
                        </ActionTooltip>
                        {onPromoteCopy && (
                          <ActionTooltip label={t("duplicate_hider.promote_copy", { store: copy.library.toUpperCase() })}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => {
                                onPromoteCopy(copy.id);
                                onClose();
                              }}
                              className="flex-1 h-auto py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-[10px] font-medium"
                              aria-label={t("duplicate_hider.promote_copy", { store: copy.library.toUpperCase() })}
                            >
                              <span>{t("duplicate_hider.active_copy")}</span>
                            </Button>
                          </ActionTooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        <div role="separator" className="my-1 border-t" style={{ borderColor: "var(--border-color)" }} />

        {/* Management Actions */}
        {contextMenu.game.is_installed &&
          onOpenFolder &&
          renderMenuButton({
            onClick: () => {
              onOpenFolder(contextMenu.game);
              onClose();
            },
            children: (
              <>
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("context_menu.open_install_dir")}</span>
              </>
            ),
          })}

        {onCreateShortcut &&
          renderMenuButton({
            onClick: () => {
              onCreateShortcut(contextMenu.game);
              onClose();
            },
            children: (
              <>
                <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t("context_menu.create_desktop_shortcut")}</span>
              </>
            ),
          })}

        {["steam", "epic"].includes((contextMenu.game.library || "").toLowerCase()) &&
          onVerifyFiles &&
          renderMenuButton({
            onClick: () => {
              onVerifyFiles(contextMenu.game);
              onClose();
            },
            children: (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t("context_menu.verify_files")}</span>
              </>
            ),
          })}

        {contextMenu.game.is_installed &&
          onUninstall &&
          renderMenuButton({
            onClick: () => {
              onUninstall(contextMenu.game);
              onClose();
            },
            className: "font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10",
            children: (
              <>
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>{t("context_menu.uninstall")}</span>
              </>
            ),
          })}

        {onToggleFavorite &&
          renderMenuButton({
            onClick: () => {
              onToggleFavorite(contextMenu.game);
              onClose();
            },
            children: (
              <>
                <Star
                  className={`w-3.5 h-3.5 ${
                    contextMenu.game.is_favorite
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-400"
                  }`}
                />
                <span>
                  {contextMenu.game.is_favorite
                    ? (t("sidebar.remove_favorite") || "Rimuovi dai preferiti")
                    : (t("sidebar.add_favorite") || "Aggiungi ai preferiti")}
                </span>
              </>
            ),
          })}

        {onToggleHidden &&
          renderMenuButton({
            onClick: () => {
              onToggleHidden(contextMenu.game);
              onClose();
            },
            children: contextMenu.game.is_hidden ? (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("duplicate_hider.unhide_game")}</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>{t("duplicate_hider.hide_game")}</span>
              </>
            ),
          })}

        {onRemoveFromLibrary &&
          renderMenuButton({
            onClick: () => {
              onRemoveFromLibrary(contextMenu.game);
              onClose();
            },
            className: "text-slate-400 hover:text-rose-300 hover:bg-rose-500/10",
            children: (
              <>
                <XCircle className="w-3.5 h-3.5 text-slate-500" />
                <span>{t("context_menu.remove_from_library")}</span>
              </>
            ),
          })}
      </div>
    </>
  );
}
