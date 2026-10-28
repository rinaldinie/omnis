import React, { useState } from "react";
import { Play, Download, Pencil, Search, Info, FolderOpen, Monitor, ShieldCheck, Trash2, XCircle, CheckCircle2, ChevronRight, Check } from "lucide-react";
import { GameDto } from "../types";
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
}: GlobalContextMenuProps) {
  const { t } = useTranslation();
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
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
            {contextMenu.game.library.toUpperCase()} •{" "}
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

        {["steam", "epic"].includes(contextMenu.game.library.toLowerCase()) && onVerifyFiles && (
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
