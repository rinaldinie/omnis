import { useState, useEffect, useCallback } from "react";
import { ThemeConfig, BUILTIN_THEMES } from "../types";
import { api } from "../api";
import { useUiStore } from "../stores";

export interface UseThemeEngineOptions {
  setStatusMessage?: (msg: string) => void;
  statusText: (key: string, params?: Record<string, string | number>) => string;
}

export function useThemeEngine({
  setStatusMessage: propSetStatusMessage,
  statusText,
}: UseThemeEngineOptions) {
  const storeSetStatusMessage = useUiStore((s) => s.setStatusMessage);
  const showThemeModal = useUiStore((s) => s.showThemeModal);
  const setShowThemeModal = useUiStore((s) => s.setShowThemeModal);
  const setStatusMessage = propSetStatusMessage ?? storeSetStatusMessage;

  const [themes, setThemes] = useState<ThemeConfig[]>(BUILTIN_THEMES);
  const [currentTheme, setCurrentTheme] = useState<ThemeConfig>(BUILTIN_THEMES[0]);

  const loadThemes = useCallback(async () => {
    try {
      const loadedThemes = await api.themes.getThemes();
      if (loadedThemes && loadedThemes.length > 0) {
        setThemes(loadedThemes);
        const savedThemeId = localStorage.getItem("omnis_selected_theme_id");
        if (savedThemeId) {
          const found = loadedThemes.find((th) => th.id === savedThemeId);
          if (found) {
            setCurrentTheme(found);
            return;
          }
        }
        setCurrentTheme(loadedThemes[0]);
      }
    } catch (err) {
      console.warn("Failed loading themes:", err);
    }
  }, []);

  const selectTheme = useCallback((theme: ThemeConfig) => {
    setCurrentTheme(theme);
    localStorage.setItem("omnis_selected_theme_id", theme.id);
    setStatusMessage(statusText("theme_activated", { name: theme.name }));
  }, [setStatusMessage, statusText]);

  const handleSaveCustomTheme = useCallback(async (fullTheme: ThemeConfig) => {
    await api.themes.saveCustomTheme(fullTheme);
    await loadThemes();
    selectTheme(fullTheme);
    setStatusMessage(statusText("theme_saved", { name: fullTheme.name }));
  }, [loadThemes, selectTheme, setStatusMessage, statusText]);

  // Apply theme to CSS variables and custom stylesheets
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg-base", currentTheme.bg_base);
    root.style.setProperty("--bg-surface", currentTheme.bg_surface);
    root.style.setProperty("--bg-card", currentTheme.bg_card);
    root.style.setProperty("--text-primary", currentTheme.text_primary);
    root.style.setProperty("--text-muted", currentTheme.text_muted);
    root.style.setProperty("--accent-primary", currentTheme.accent_primary);
    root.style.setProperty("--accent-glow", currentTheme.accent_glow);
    root.style.setProperty("--border-color", currentTheme.border_color);
    root.style.setProperty("--card-radius", currentTheme.card_radius);
    const epicFontStack = '"Brutal", "Brutal Type", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    if (currentTheme.font_family && !currentTheme.font_family.startsWith("system-ui")) {
      root.style.fontFamily = currentTheme.font_family;
    } else {
      root.style.fontFamily = epicFontStack;
    }
    if (currentTheme.tokens && typeof currentTheme.tokens === "object") {
      Object.entries(currentTheme.tokens).forEach(([tokenKey, tokenValue]) => {
        if (tokenKey.startsWith("--")) {
          root.style.setProperty(tokenKey, tokenValue);
        }
      });
    }
    document.body.style.backgroundColor = currentTheme.bg_base;
    document.body.style.color = currentTheme.text_primary;

    let styleTag = document.getElementById("omnis-custom-theme-css") as HTMLStyleElement | null;
    if (currentTheme.custom_css && currentTheme.custom_css.trim()) {
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "omnis-custom-theme-css";
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = currentTheme.custom_css;
    } else if (styleTag) {
      styleTag.textContent = "";
    }
  }, [currentTheme]);

  return {
    themes,
    setThemes,
    currentTheme,
    setCurrentTheme,
    showThemeModal,
    setShowThemeModal,
    loadThemes,
    selectTheme,
    handleSaveCustomTheme,
  };
}
