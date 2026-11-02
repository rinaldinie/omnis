import { invokeIpc } from "./client";
import type {
  BackupInspectionDto,
  BackupResultDto,
  BackupScheduleConfigDto,
} from "../types";

export const backupApi = {
  /** Fetch automated backup schedule configuration */
  getSchedule: (): Promise<BackupScheduleConfigDto> =>
    invokeIpc<BackupScheduleConfigDto>("get_backup_schedule"),

  /** Save automated backup schedule configuration */
  saveSchedule: (config: BackupScheduleConfigDto): Promise<void> =>
    invokeIpc<void>("save_backup_schedule", { config }),

  /** Create a manual backup archive */
  createBackup: (params: {
    destinationDir: string;
    includeArtwork: boolean;
    keepLast?: number;
  }): Promise<BackupResultDto> =>
    invokeIpc<BackupResultDto>("create_backup", params as Record<string, unknown>),

  /** Inspect backup archive file contents */
  inspectBackup: (backupFilePath: string): Promise<BackupInspectionDto> =>
    invokeIpc<BackupInspectionDto>("inspect_backup", { backupFilePath }),

  /** Restore database and artwork from backup archive */
  restoreBackup: (backupFilePath: string): Promise<boolean> =>
    invokeIpc<boolean>("restore_backup", { backupFilePath }),

  /** Pick directory for backup destination */
  pickDestinationFolder: (): Promise<string | null> =>
    invokeIpc<string | null>("pick_backup_destination_folder"),

  /** Pick backup file (.zip) for restore */
  pickFileToRestore: (): Promise<string | null> =>
    invokeIpc<string | null>("pick_backup_file_to_restore"),
};
