import { invokeIpc } from "./client";
import type { ThemeConfig } from "../types";

export const themesApi = {
  /** Fetch all builtin and user-defined themes */
  getThemes: (): Promise<ThemeConfig[]> => invokeIpc<ThemeConfig[]>("get_themes"),

  /** Save or update a custom theme */
  saveCustomTheme: (theme: ThemeConfig): Promise<void> =>
    invokeIpc<void>("save_custom_theme", { theme }),
};
