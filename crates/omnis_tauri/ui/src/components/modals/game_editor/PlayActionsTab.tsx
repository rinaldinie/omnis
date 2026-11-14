import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, FolderOpen, Folder, Terminal } from "lucide-react";
import { LaunchConfiguration } from "./types";
import { useTranslation } from "../../../i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlayActionsTabProps {
  playActions: LaunchConfiguration[];
  isCustomGame?: boolean;
  useLibraryIntegration?: boolean;
  onToggleLibraryIntegration?: (enabled: boolean) => void;
  onAddAction: () => void;
  onRemoveAction: (index: number) => void;
  onUpdateAction: <K extends keyof LaunchConfiguration>(
    index: number,
    key: K,
    value: LaunchConfiguration[K]
  ) => void;
  onPickExe: (index: number) => void;
  onPickDir: (index: number) => void;
}

interface PlayActionCardProps {
  action: LaunchConfiguration;
  idx: number;
  onRemoveAction: (index: number) => void;
  onUpdateAction: <K extends keyof LaunchConfiguration>(
    index: number,
    key: K,
    value: LaunchConfiguration[K]
  ) => void;
  onPickExe: (index: number) => void;
  onPickDir: (index: number) => void;
}

const PlayActionCard: React.FC<PlayActionCardProps> = ({
  action,
  idx,
  onRemoveAction,
  onUpdateAction,
  onPickExe,
  onPickDir,
}) => {
  const { t } = useTranslation();
  const [argsText, setArgsText] = useState((action.arguments || []).join(" "));
  const argsTextRef = useRef(argsText);
  argsTextRef.current = argsText;

  useEffect(() => {
    const actionArgs = action.arguments || [];
    const parsedCurrent = argsTextRef.current.trim().split(/\s+/).filter(Boolean);
    if (JSON.stringify(parsedCurrent) !== JSON.stringify(actionArgs)) {
      setArgsText(actionArgs.join(" "));
    }
  }, [action.arguments]);

  const handleArgsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setArgsText(val);
    const parsed = val.trim().split(/\s+/).filter(Boolean);
    onUpdateAction(idx, "arguments", parsed);
  };

  const trackingType = action.tracking_mode?.type || "KernelJobObject";
  const trackingTarget =
    action.tracking_mode && "target" in action.tracking_mode ? action.tracking_mode.target : "";

  return (
    <div className="p-5 rounded-2xl border border-border bg-card space-y-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <span className="text-xs font-medium text-indigo-400">
          {t("play_actions.action_n", { n: idx + 1 })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => onRemoveAction(idx)}
          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{t("play_actions.remove")}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1 text-slate-300">
            {t("play_actions.executable")} *
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={action.executable || ""}
              onChange={(e) => onUpdateAction(idx, "executable", e.target.value)}
              className="flex-1 h-9 bg-popover text-xs font-mono"
              placeholder={t("play_actions.executable_placeholder")}
            />
            <ActionTooltip label={t("custom_game.browse_exe_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPickExe(idx)}
                className="h-9 bg-popover font-medium shrink-0"
                aria-label={t("custom_game.browse_exe_title")}
              >
                <FolderOpen className="w-4 h-4 text-emerald-400" />
                <span>{t("custom_game.browse")}</span>
              </Button>
            </ActionTooltip>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1 text-slate-300">
            {t("play_actions.working_dir")}
          </label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={action.working_dir || ""}
              onChange={(e) =>
                onUpdateAction(idx, "working_dir", e.target.value || null)
              }
              className="flex-1 h-9 bg-popover text-xs font-mono"
              placeholder={t("play_actions.working_dir_placeholder")}
            />
            <ActionTooltip label={t("play_actions.pick_folder_title")}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPickDir(idx)}
                className="h-9 bg-popover font-medium shrink-0"
                aria-label={t("play_actions.pick_folder_title")}
              >
                <Folder className="w-4 h-4 text-sky-400" />
                <span>{t("play_actions.pick_folder")}</span>
              </Button>
            </ActionTooltip>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-slate-300">
          {t("play_actions.arguments")}
        </label>
        <Input
          type="text"
          value={argsText}
          onChange={handleArgsChange}
          onBlur={() => setArgsText((action.arguments || []).join(" "))}
          className="h-9 bg-popover text-xs font-mono"
          placeholder={t("play_actions.arguments_placeholder")}
        />
      </div>

      <div>
        <label className="block text-xs font-medium mb-1 text-slate-300">
          {t("play_actions.tracking")}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Select
            value={trackingType}
            onValueChange={(val) => {
              if (val === "KernelJobObject") {
                onUpdateAction(idx, "tracking_mode", {
                  type: "KernelJobObject",
                });
              } else if (val === "ProcessName") {
                onUpdateAction(idx, "tracking_mode", {
                  type: "ProcessName",
                  target: trackingTarget || "game.exe",
                });
              } else {
                onUpdateAction(idx, "tracking_mode", {
                  type: "WatchDirectory",
                  target: trackingTarget || ".",
                });
              }
            }}
          >
            <SelectTrigger className="h-9 sm:w-auto min-w-[200px] px-3 py-2 bg-popover text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KernelJobObject">
                {t("play_actions.tracking_kernel")}
              </SelectItem>
              <SelectItem value="ProcessName">
                {t("play_actions.tracking_process")}
              </SelectItem>
              <SelectItem value="WatchDirectory">
                {t("play_actions.tracking_directory")}
              </SelectItem>
            </SelectContent>
          </Select>

          {trackingType === "ProcessName" && (
            <Input
              type="text"
              value={trackingTarget}
              onChange={(e) =>
                onUpdateAction(idx, "tracking_mode", {
                  type: "ProcessName",
                  target: e.target.value,
                })
              }
              placeholder="e.g. game.exe"
              className="flex-1 h-9 bg-popover text-xs font-mono"
            />
          )}

          {trackingType === "WatchDirectory" && (
            <Input
              type="text"
              value={trackingTarget}
              onChange={(e) =>
                onUpdateAction(idx, "tracking_mode", {
                  type: "WatchDirectory",
                  target: e.target.value,
                })
              }
              placeholder="e.g. ."
              className="flex-1 h-9 bg-popover text-xs font-mono"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PlayActionsTab: React.FC<PlayActionsTabProps> = ({
  playActions,
  isCustomGame,
  useLibraryIntegration = true,
  onToggleLibraryIntegration,
  onAddAction,
  onRemoveAction,
  onUpdateAction,
  onPickExe,
  onPickDir,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-normal text-slate-400">
          {t("play_actions.intro")}
        </span>
        <Button type="button" size="sm" onClick={onAddAction} className="font-medium">
          <Plus className="w-3.5 h-3.5" />
          <span>{t("play_actions.add")}</span>
        </Button>
      </div>

      {!isCustomGame && (
        <div className="p-4 rounded-2xl border border-border bg-card shadow-sm">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useLibraryIntegration}
              onChange={(e) => onToggleLibraryIntegration?.(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border bg-popover text-indigo-500 focus:ring-indigo-500"
            />
            <div className="space-y-0.5">
              <span className="block text-sm font-medium text-foreground">
                {t("play_actions.library_integration_title")}
              </span>
              <span className="block text-xs text-slate-400">
                {useLibraryIntegration
                  ? t("play_actions.library_integration_on_hint")
                  : t("play_actions.library_integration_off_hint")}
              </span>
            </div>
          </label>
        </div>
      )}

      {playActions.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-border bg-card text-center space-y-3">
          <Terminal className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            {t("play_actions.empty_title")}
          </p>
          <p className="text-xs text-slate-400">
            {t("play_actions.empty_desc")}
          </p>
        </div>
      ) : (
        playActions.map((action, idx) => (
          <PlayActionCard
            key={idx}
            action={action}
            idx={idx}
            onRemoveAction={onRemoveAction}
            onUpdateAction={onUpdateAction}
            onPickExe={onPickExe}
            onPickDir={onPickDir}
          />
        ))
      )}
    </div>
  );
};
