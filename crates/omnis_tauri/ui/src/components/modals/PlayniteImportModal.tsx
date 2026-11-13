import { useState, useEffect, useRef } from "react";
import { Archive, RefreshCw, Check, DownloadCloud } from "lucide-react";
import { api } from "../../api";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  PlayniteBackupInspection,
  PlayniteBackupImportOptions,
  PlayniteImportStats,
  PlayniteImportProgressPayload,
  TAURI_EVENTS,
} from "../../types";
import { useTranslation } from "../../i18n";
import soundEffects from "../../utils/soundEffects";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PlaynitePreviewStep } from "./playnite_import/PlaynitePreviewStep";
import {
  PlayniteIdleStep,
  PlayniteInspectingStep,
  PlayniteImportingStep,
  PlayniteCompletedStep,
  PlayniteErrorStep,
} from "./playnite_import/PlayniteStatusSteps";

export type PlayniteImportStep =
  | "idle"
  | "inspecting"
  | "preview"
  | "importing"
  | "completed"
  | "error";

export interface PlayniteImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function extractErrorMessage(err: unknown): string {
  return typeof err === "string"
    ? err
    : (err as { message?: string })?.message || String(err);
}

/** Multi-step modal for inspecting and importing a Playnite `.zip` backup into the library. */
export default function PlayniteImportModal({
  isOpen,
  onClose,
  onSuccess,
}: PlayniteImportModalProps) {
  const { t } = useTranslation();

  const [step, setStep] = useState<PlayniteImportStep>("idle");
  const [zipPath, setZipPath] = useState<string>("");
  const [inspection, setInspection] = useState<PlayniteBackupInspection | null>(null);
  const [updatePlaytime, setUpdatePlaytime] = useState<boolean>(true);
  const [importImages, setImportImages] = useState<boolean>(true);
  const [progress, setProgress] = useState<PlayniteImportProgressPayload | null>(null);
  const [stats, setStats] = useState<PlayniteImportStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [previewTab, setPreviewTab] = useState<"matched" | "unmatched">("matched");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Reset state whenever modal is opened
  useEffect(() => {
    if (isOpen) {
      setStep("idle");
      setZipPath("");
      setInspection(null);
      setUpdatePlaytime(true);
      setImportImages(true);
      setProgress(null);
      setStats(null);
      setErrorMessage("");
      setPreviewTab("matched");
      setSearchQuery("");
    }
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    if (step === "importing") return; // Prevent closing while import is executing
    soundEffects.playSelect();
    onClose();
  };

  const startInspection = async (filePath: string) => {
    setStep("inspecting");
    setErrorMessage("");
    try {
      const result = await api.playnite.inspectBackup(filePath);
      setInspection(result);
      setStep("preview");
      soundEffects.playSelect();
    } catch (err: unknown) {
      console.error("Inspection failed:", err);
      setErrorMessage(extractErrorMessage(err));
      setStep("error");
    }
  };

  const handleFileSelected = (filePath: string) => {
    setZipPath(filePath);
    void startInspection(filePath);
  };

  const handlePickFile = async () => {
    soundEffects.playSelect();
    try {
      const selected = await api.playnite.pickBackupFile();
      if (selected) {
        handleFileSelected(selected);
      }
    } catch (err: unknown) {
      console.error("Failed to pick backup file:", err);
      setErrorMessage(typeof err === "string" ? err : String(err));
      setStep("error");
    }
  };

  const handleStartImport = async () => {
    if (!zipPath) return;
    soundEffects.playSelect();
    setStep("importing");
    setProgress({
      current: 0,
      total: inspection?.matching_games_in_library || 0,
      message: "",
    });
    setErrorMessage("");

    try {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      unlistenRef.current = await listen<PlayniteImportProgressPayload>(
        TAURI_EVENTS.PLAYNITE_IMPORT_PROGRESS,
        (event) => {
          setProgress(event.payload);
        }
      );

      const options: PlayniteBackupImportOptions = {
        image_cache_dir: null,
        import_images: importImages,
        update_playtime: updatePlaytime,
        dry_run: false,
      };

      const result = await api.playnite.executeImport(zipPath, options);

      setStats(result);
      setStep("completed");
      soundEffects.playUnlock();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      console.error("Execute import failed:", err);
      setErrorMessage(extractErrorMessage(err));
      setStep("error");
    } finally {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && step !== "importing") {
          handleClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={step !== "importing"}
        closeButtonDisabled={step === "importing"}
        className="max-w-3xl w-full rounded-3xl max-h-[90vh] p-0 flex flex-col overflow-hidden gap-0"
      >
        <DialogHeader className="flex-row items-center gap-3 px-6 py-4 border-b border-border space-y-0 text-left pr-14 shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-border bg-card shadow-md shrink-0">
            <Archive className="w-5 h-5 text-purple-400" />
          </div>
          <div className="min-w-0">
            <DialogTitle className="text-lg font-black text-foreground">
              {t("playnite_import.modal_title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {t("playnite_import.modal_subtitle")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* BODY */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            {step === "idle" && (
              <PlayniteIdleStep
                onPickFile={() => void handlePickFile()}
                onFileDropped={handleFileSelected}
                t={t}
              />
            )}

            {step === "inspecting" && <PlayniteInspectingStep zipPath={zipPath} t={t} />}

            {step === "preview" && inspection && (
              <PlaynitePreviewStep
                inspection={inspection}
                zipPath={zipPath}
                onPickFile={() => void handlePickFile()}
                updatePlaytime={updatePlaytime}
                onToggleUpdatePlaytime={setUpdatePlaytime}
                importImages={importImages}
                onToggleImportImages={setImportImages}
                previewTab={previewTab}
                onPreviewTabChange={setPreviewTab}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                t={t}
              />
            )}

            {step === "importing" && <PlayniteImportingStep progress={progress} t={t} />}

            {step === "completed" && stats && <PlayniteCompletedStep stats={stats} t={t} />}

            {step === "error" && <PlayniteErrorStep errorMessage={errorMessage} t={t} />}
          </div>
        </ScrollArea>

        <DialogFooter className="sm:justify-between items-center px-6 py-4 border-t border-border bg-black/40 shrink-0">
          <div>
            {step === "preview" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  soundEffects.playSelect();
                  setStep("idle");
                }}
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("playnite_import.change_file")}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {step === "idle" && (
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="px-5 py-2 h-auto font-bold"
              >
                {t("common.cancel")}
              </Button>
            )}

            {step === "preview" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="px-5 py-2 h-auto font-bold"
                >
                  {t("playnite_import.btn_cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleStartImport()}
                  disabled={inspection?.matching_games_in_library === 0}
                  className="px-6 py-2 h-auto font-bold shadow-lg"
                >
                  <DownloadCloud className="w-4 h-4" />
                  <span>{t("playnite_import.btn_start_import")}</span>
                </Button>
              </>
            )}

            {step === "completed" && (
              <Button
                type="button"
                onClick={handleClose}
                className="px-6 py-2 h-auto font-bold shadow-lg"
              >
                <Check className="w-4 h-4" />
                <span>{t("playnite_import.btn_close")}</span>
              </Button>
            )}

            {step === "error" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="px-5 py-2 h-auto font-bold"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    soundEffects.playSelect();
                    setStep("idle");
                  }}
                  className="px-5 py-2 h-auto font-bold shadow-md"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>{t("playnite_import.btn_retry")}</span>
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
