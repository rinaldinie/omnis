import { invokeIpc } from "./client";
import type {
  PlayniteBackupInspection,
  PlayniteBackupImportOptions,
  PlayniteImportStats,
} from "../types";

export const playniteApi = {
  /** Open file picker for Playnite .pnbak / .zip archive */
  pickBackupFile: (): Promise<string | null> =>
    invokeIpc<string | null>("pick_playnite_backup_file"),

  /** Inspect Playnite backup archive contents without importing */
  inspectBackup: (zipPath: string): Promise<PlayniteBackupInspection> =>
    invokeIpc<PlayniteBackupInspection>("inspect_playnite_backup", { zipPath }),

  /** Execute Playnite library and media import */
  executeImport: (
    zipPath: string,
    options?: PlayniteBackupImportOptions
  ): Promise<PlayniteImportStats> =>
    invokeIpc<PlayniteImportStats>("execute_playnite_import", { zipPath, options }),
};
