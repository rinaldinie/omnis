import React, { useState } from "react";
import { Play, Download, Pencil, Search, Info, FolderOpen, Monitor, ShieldCheck, Trash2, XCircle, CheckCircle2, ChevronRight, Check, Eye, EyeOff, Layers, Star } from "lucide-react";
import { GameDto } from "../types";
import { StoreIcon } from "./StoreBadge";
import { useTranslation } from "../i18n";

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
  if (!contextMenu) return null;

  const currentStatus = contextMenu.game.completion_status || "NotPlayed";

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

        {contextMenu.game.is_installed ? (
          <button
            onClick={() => {
              onLaunch(contextMenu.game.id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-emerald-400" />
            <span>{t("context_menu.launch")}</span>
          </button>
        ) : (
          <button
            onClick={() => {
              onLaunch(contextMenu.game.id);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>{t("context_menu.install_native")}</span>
          </button>
        )}

        <button
          onClick={() => {
            onEdit(contextMenu.game);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5 text-indigo-400" />
          <span>{t("context_menu.edit_manual")}</span>
        </button>

        <button
          onClick={() => {
            onResolve(contextMenu.game);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-bold text-sky-300 hover:bg-sky-500/10 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-sky-400" />
          <span>{t("context_menu.identify_metadata")}</span>
        </button>

        <button
          onClick={() => {
            onShowDetails(contextMenu.game);
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-white/90 hover:bg-white/5 transition-colors"
        >
          <Info className="w-3.5 h-3.5 text-slate-400" />
          <span>{t("context_menu.view_details")}</span>
        </button>

        {/* Completion Status Submenu Trigger */}
        {onUpdateCompletionStatus && (
          <div
            className="relative"
            onMouseEnter={() => setShowStatusSubmenu(true)}
            onMouseLeave={() => setShowStatusSubmenu(false)}
          >
            <button
              type="button"
              onClick={() => setShowStatusSubmenu((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-left font-medium text-slate-200 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("groups.completion_status")}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showStatusSubmenu && (
              <div
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
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onUpdateCompletionStatus(contextMenu.game, opt.value);
                        onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-indigo-600/20 text-white font-semibold"
                          : "text-slate-300 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                        <span>{t(`completion_status.${opt.key}`)}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </button>
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
              <button
                type="button"
                onClick={() => setShowCopiesSubmenu((v) => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2 text-left font-medium text-slate-200 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t("duplicate_hider.other_copies")}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded text-slate-400 bg-white/5">
                    {contextMenu.game.other_copies.length}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </button>

              {showCopiesSubmenu && (
                <div
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
                        <button
                          type="button"
                          onClick={() => {
                            onLaunch(copy.id);
                            onClose();
                          }}
                          className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 text-[10px] font-semibold transition-colors cursor-pointer"
                          title={t("duplicate_hider.launch_copy", { store: copy.library.toUpperCase() })}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{copy.is_installed ? t("common.play") : t("common.install")}</span>
                        </button>
                        {onPromoteCopy && (
                          <button
                            type="button"
                            onClick={() => {
                              onPromoteCopy(copy.id);
                              onClose();
                            }}
                            className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-[10px] font-medium transition-colors cursor-pointer"
                            title={t("duplicate_hider.promote_copy", { store: copy.library.toUpperCase() })}
                          >
                            <span>{t("duplicate_hider.active_copy")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        <div className="my-1 border-t" style={{ borderColor: "var(--border-color)" }} />

        {/* Management Actions */}
        {contextMenu.game.is_installed && onOpenFolder && (
          <button
            onClick={() => {
              onOpenFolder(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>{t("context_menu.open_install_dir")}</span>
          </button>
        )}

        {onCreateShortcut && (
          <button
            onClick={() => {
              onCreateShortcut(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Monitor className="w-3.5 h-3.5 text-cyan-400" />
            <span>{t("context_menu.create_desktop_shortcut")}</span>
          </button>
        )}

        {["steam", "epic"].includes((contextMenu.game.library || "").toLowerCase()) && onVerifyFiles && (
          <button
            onClick={() => {
              onVerifyFiles(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("context_menu.verify_files")}</span>
          </button>
        )}

        {contextMenu.game.is_installed && onUninstall && (
          <button
            onClick={() => {
              onUninstall(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{t("context_menu.uninstall")}</span>
          </button>
        )}

        {onToggleFavorite && (
          <button
            onClick={() => {
              onToggleFavorite(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
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
          </button>
        )}

        {onToggleHidden && (
          <button
            onClick={() => {
              onToggleHidden(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            {contextMenu.game.is_hidden ? (
              <>
                <Eye className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t("duplicate_hider.unhide_game")}</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>{t("duplicate_hider.hide_game")}</span>
              </>
            )}
          </button>
        )}

        {onRemoveFromLibrary && (
          <button
            onClick={() => {
              onRemoveFromLibrary(contextMenu.game);
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>{t("context_menu.remove_from_library")}</span>
          </button>
        )}
      </div>
    </>
  );
}
