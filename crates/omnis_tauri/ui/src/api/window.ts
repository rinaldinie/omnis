import { invokeIpc } from "./client";

export const windowApi = {
  /** Toggle OS window fullscreen state */
  setFullscreen: (fullscreen: boolean): Promise<void> =>
    invokeIpc<void>("window_set_fullscreen", { fullscreen }),

  /** Check if app was started with --fullscreen CLI switch */
  isFullscreenLaunch: (): Promise<boolean> =>
    invokeIpc<boolean>("is_fullscreen_launch"),

  /** Start native window dragging gesture */
  startDragging: (): Promise<void> => invokeIpc<void>("window_start_dragging"),

  /** Minimize window to taskbar/dock */
  minimize: (): Promise<void> => invokeIpc<void>("window_minimize"),

  /** Unminimize window */
  unminimize: (): Promise<void> => invokeIpc<void>("window_unminimize"),

  /** Focus window */
  setFocus: (): Promise<void> => invokeIpc<void>("window_set_focus"),

  /** Toggle window maximized state */
  toggleMaximize: (): Promise<void> => invokeIpc<void>("window_toggle_maximize"),

  /** Close application window */
  close: (): Promise<void> => invokeIpc<void>("window_close"),

  /** Open system folder (cache, logs, covers, etc.) */
  openFolder: (folderType: string): Promise<void> =>
    invokeIpc<void>("open_folder", { folderType }),

  /** Open URL in external default browser */
  openExternalUrl: (url: string): Promise<void> =>
    invokeIpc<void>("open_external_url", { url }),

  /** Configure minimize-to-system-tray behavior */
  setMinimizeToTray: (enabled: boolean): Promise<void> =>
    invokeIpc<void>("set_minimize_to_tray", { enabled }),
};
