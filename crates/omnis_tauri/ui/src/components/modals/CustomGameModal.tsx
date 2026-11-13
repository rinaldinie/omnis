import React, { useState } from "react";
import { PlusCircle, X, FolderOpen, Folder } from "lucide-react";
import { api } from "../../api";
import { useTranslation } from "../../i18n";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CustomGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (gameTitle: string) => void;
}

export default function CustomGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CustomGameModalProps) {
  const { t } = useTranslation();
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customExePath, setCustomExePath] = useState<string>("");
  const [customArguments, setCustomArguments] = useState<string[]>([]);
  const [customWorkingDir, setCustomWorkingDir] = useState<string | null>(null);
  const [customCoverPath, setCustomCoverPath] = useState<string>("");
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  const handlePickCustomExe = async () => {
    try {
      const pickedPath = await api.games.pickExecutableFile();
      if (pickedPath) {
        let exeToSet = pickedPath;
        let argsToSet: string[] = [];
        let workingDirToSet: string | null = null;
        let suggestedName = "";

        try {
          const resolved = await api.games.resolveExecutablePath(pickedPath);
          if (resolved) {
            exeToSet = resolved.executable_path || pickedPath;
            argsToSet = resolved.arguments || [];
            workingDirToSet = resolved.working_dir || null;
            if (resolved.shortcut_name) {
              suggestedName = resolved.shortcut_name;
            }
          }
        } catch (resolveErr) {
          console.warn(
            "Could not resolve shortcut details, using raw path:",
            resolveErr
          );
        }

        setCustomExePath(exeToSet);
        setCustomArguments(argsToSet);
        setCustomWorkingDir(workingDirToSet);

        if (!customTitle.trim()) {
          if (suggestedName) {
            const formatted = suggestedName.replace(/[_-]/g, " ").trim();
            setCustomTitle(formatted);
          } else {
            const sep = exeToSet.includes("\\") ? "\\" : "/";
            const filename = exeToSet.split(sep).pop() || "";
            const formatted = filename
              .replace(/\.(exe|bat|cmd|lnk)$/i, "")
              .replace(/[_-]/g, " ")
              .trim();
            setCustomTitle(formatted);
          }
        }
      }
    } catch (e) {
      console.error("Failed to pick executable:", e);
    }
  };

  const handlePickCustomFolder = async () => {
    try {
      const dir = await api.games.pickDirectory();
      if (dir) {
        const exes = await api.games.findExecutablesInFolder(dir);
        if (exes && exes.length > 0) {
          setCustomExePath(exes[0]);
          setCustomArguments([]);
          setCustomWorkingDir(dir);
        } else {
          setCustomExePath(dir);
          setCustomArguments([]);
          setCustomWorkingDir(dir);
        }
        if (!customTitle.trim()) {
          const sep = dir.includes("\\") ? "\\" : "/";
          const folderName = dir.split(sep).filter(Boolean).pop() || "";
          setCustomTitle(folderName.replace(/[_-]/g, " ").trim());
        }
      }
    } catch (e) {
      console.error("Failed to pick directory:", e);
    }
  };

  const handlePickCustomCover = async () => {
    try {
      const path = await api.games.pickImageFile();
      if (path) {
        setCustomCoverPath(path);
      }
    } catch (e) {
      console.error("Failed to pick cover:", e);
    }
  };

  const handleAddCustomGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customExePath.trim()) return;
    setIsAddingCustom(true);
    try {
      await api.games.addCustomGame({
        title: customTitle.trim(),
        executable_path: customExePath.trim(),
        arguments: customArguments,
        working_dir: customWorkingDir,
        cover_image_path: customCoverPath.trim() || null,
      });
      const title = customTitle;
      setCustomTitle("");
      setCustomExePath("");
      setCustomArguments([]);
      setCustomWorkingDir(null);
      setCustomCoverPath("");
      onSuccess(title);
    } catch (err) {
      console.error("Errore aggiunta custom game:", err);
    } finally {
      setIsAddingCustom(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isAddingCustom) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="max-w-md rounded-2xl bg-card p-6 gap-0"
        onEscapeKeyDown={(e) => {
          if (isAddingCustom) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isAddingCustom) e.preventDefault();
        }}
      >
        <DialogHeader className="flex-row items-center justify-between pb-4 border-b border-border space-y-0">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <DialogTitle className="text-base font-semibold tracking-wide text-foreground">
              {t("custom_game.title")}
            </DialogTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isAddingCustom}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>
        <DialogDescription className="sr-only">
          {t("custom_game.title")}
        </DialogDescription>

        <form onSubmit={handleAddCustomGame} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("custom_game.field_title")} *
            </label>
            <Input
              type="text"
              required
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t("custom_game.title_placeholder")}
              className="bg-black/30 focus-visible:ring-emerald-500/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("custom_game.field_exe")} *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="text"
                required
                value={customExePath}
                onChange={(e) => setCustomExePath(e.target.value)}
                placeholder={t("custom_game.exe_placeholder")}
                className="flex-1 bg-black/30 text-xs font-mono focus-visible:ring-emerald-500/50"
              />
              <div className="flex gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePickCustomExe}
                  className="h-9 border-border bg-white/5 hover:bg-white/10"
                  title={t("custom_game.browse_exe_title")}
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t("custom_game.browse_exe")}</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePickCustomFolder}
                  className="h-9 border-border bg-white/5 hover:bg-white/10"
                  title={t("custom_game.browse_folder_title")}
                >
                  <Folder className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t("custom_game.browse_folder")}</span>
                </Button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("custom_game.field_cover")}
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={customCoverPath}
                onChange={(e) => setCustomCoverPath(e.target.value)}
                placeholder={t("custom_game.cover_placeholder")}
                className="flex-1 bg-black/30 text-xs font-mono focus-visible:ring-emerald-500/50"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handlePickCustomCover}
                className="h-9 border-border bg-white/5 hover:bg-white/10 shrink-0"
                title={t("custom_game.browse_cover_title")}
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t("custom_game.browse")}</span>
              </Button>
            </div>
          </div>

          <DialogFooter className="flex-row justify-end gap-2 pt-4 border-t border-border sm:space-x-0">
            <Button
              type="submit"
              disabled={isAddingCustom}
              className="shadow-lg"
            >
              <PlusCircle className="w-4 h-4" />
              <span>
                {isAddingCustom
                  ? t("custom_game.adding")
                  : t("custom_game.add")}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isAddingCustom}
              onClick={onClose}
            >
              {t("common.cancel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
