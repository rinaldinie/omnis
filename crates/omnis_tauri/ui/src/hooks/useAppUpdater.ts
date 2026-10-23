import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "readyToInstall"
  | "error";

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
}

function formatErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err) || fallback;
  }
}

export function useAppUpdater(defaultAppVersion: string = "0.2.0") {
  const [currentVersion, setCurrentVersion] = useState<string>(defaultAppVersion);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const updateRef = useRef<any>(null);

  useEffect(() => {
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => {
        getVersion().then(setCurrentVersion).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const checkForUpdates = useCallback(async (silent: boolean = false): Promise<boolean> => {
    try {
      setStatus("checking");
      setErrorMessage(null);

      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (update && (update.available ?? true)) {
        updateRef.current = update;
        setAvailableVersion(update.version);
        setReleaseNotes(update.body || null);
        setStatus("available");
        return true;
      } else {
        updateRef.current = null;
        setStatus("upToDate");
        return false;
      }
    } catch (err: any) {
      console.error("Update check error:", err);
      updateRef.current = null;
      if (!silent) {
        setErrorMessage(formatErrorMessage(err, "Impossibile verificare gli aggiornamenti"));
        setStatus("error");
      } else {
        // In silent mode (at startup), fail gracefully without alerting
        setStatus("idle");
      }
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;

    try {
      setStatus("downloading");
      setErrorMessage(null);
      setProgress({ downloadedBytes: 0, totalBytes: 0, percentage: 0 });

      let downloaded = 0;
      let total = 0;

      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength || 0;
          const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          setProgress({ downloadedBytes: downloaded, totalBytes: total, percentage });
        } else if (event.event === "Finished") {
          setProgress({ downloadedBytes: total, totalBytes: total, percentage: 100 });
        }
      });

      setStatus("readyToInstall");
    } catch (err: any) {
      console.error("Update download/install error:", err);
      setErrorMessage(formatErrorMessage(err, "Download dell'aggiornamento fallito"));
      setStatus("error");
    }
  }, []);

  const relaunch = useCallback(async () => {
    try {
      const { relaunch: triggerRelaunch } = await import("@tauri-apps/plugin-process");
      await triggerRelaunch();
    } catch {
      window.location.reload();
    }
  }, []);

  return {
    status,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress,
    errorMessage,
    error: errorMessage,
    checkForUpdates,
    downloadAndInstall,
    relaunch,
  };
}

export type AppUpdater = ReturnType<typeof useAppUpdater>;

export const UpdaterContext = createContext<AppUpdater | null>(null);

export function useUpdater(): AppUpdater | null {
  return useContext(UpdaterContext);
}
