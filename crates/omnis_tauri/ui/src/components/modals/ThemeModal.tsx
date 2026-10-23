import React, { useState } from "react";
import { Palette, PlusCircle, Folder, Check, Film, Tv, Monitor } from "lucide-react";
import { ThemeConfig } from "../../types";
import { useTranslation } from "../../i18n";

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  themes: ThemeConfig[];
  currentTheme: ThemeConfig;
  onSelectTheme: (theme: ThemeConfig) => void;
  onSaveCustomTheme: (theme: ThemeConfig) => Promise<void>;
  onOpenThemesFolder: () => void;
}

export default function ThemeModal({
  isOpen,
  onClose,
  themes,
  currentTheme,
  onSelectTheme,
  onSaveCustomTheme,
  onOpenThemesFolder,
}: ThemeModalProps) {
  const { t } = useTranslation();
  const [themeModalTab, setThemeModalTab] = useState<"list" | "create">("list");
  const [newThemeDraft, setNewThemeDraft] = useState<Partial<ThemeConfig>>({
    id: "mio_tema_custom",
    name: "Mio Nuovo Tema",
    description: "Tema personalizzato con colori custom",
    author: "Utente",
    bg_base: "#0c0d14",
    bg_surface: "#141724",
    bg_card: "#1e2235",
    text_primary: "#ffffff",
    text_muted: "#94a3b8",
    accent_primary: "#10b981",
    accent_glow: "rgba(16, 185, 129, 0.4)",
    border_color: "#2d344d",
    card_radius: "12px",
    font_family: "system-ui, sans-serif",
  });

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!newThemeDraft.name || !newThemeDraft.id) return;
    const fullTheme: ThemeConfig = {
      id: newThemeDraft.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
      name: newThemeDraft.name || "Tema Personalizzato",
      description: newThemeDraft.description || "Creato dall'editor integrato",
      author: newThemeDraft.author || "Utente",
      is_custom: true,
      bg_base: newThemeDraft.bg_base || "#0b0e14",
      bg_surface: newThemeDraft.bg_surface || "#131822",
      bg_card: newThemeDraft.bg_card || "#1a2130",
      text_primary: newThemeDraft.text_primary || "#ffffff",
      text_muted: newThemeDraft.text_muted || "#94a3b8",
      accent_primary: newThemeDraft.accent_primary || "#6366f1",
      accent_glow: newThemeDraft.accent_glow || "rgba(99, 102, 241, 0.4)",
      border_color: newThemeDraft.border_color || "#242e42",
      card_radius: newThemeDraft.card_radius || "12px",
      font_family: newThemeDraft.font_family || "system-ui, sans-serif",
      custom_css: newThemeDraft.custom_css || null,
      target_mode: newThemeDraft.target_mode || "all",
      enable_video_backdrop: !!newThemeDraft.enable_video_backdrop,
      video_backdrop_opacity: newThemeDraft.video_backdrop_opacity ?? 0.55,
      video_delay_ms: newThemeDraft.video_delay_ms ?? 1000,
    };
    await onSaveCustomTheme(fullTheme);
    setThemeModalTab("list");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-2xl w-full rounded-3xl border shadow-2xl max-h-[85vh] flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
        }}
      >
        {/* Modal Header */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5" style={{ color: "var(--accent-primary)" }} />
            <h3 className="text-lg font-black text-white">{t("topbar.themes_title")}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              color: "var(--text-muted)",
            }}
          >
            ✕
          </button>
        </div>

        {/* TAB SELECTOR: TEMI DISPONIBILI vs CREA TEMA */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div
            className="flex p-1 rounded-xl border"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <button
              onClick={() => setThemeModalTab("list")}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center"
              style={{
                backgroundColor: themeModalTab === "list" ? "var(--accent-primary)" : "transparent",
                color: themeModalTab === "list" ? "#ffffff" : "var(--text-muted)",
              }}
            >
              Temi Disponibili ({themes.length})
            </button>
            <button
              onClick={() => {
                setThemeModalTab("create");
                // Initialize draft with currently selected theme colors
                setNewThemeDraft({
                  id: "custom_" + Date.now(),
                  name: "Tema Personalizzato",
                  description: "Tema creato con colori custom",
                  author: "Utente",
                  bg_base: currentTheme.bg_base,
                  bg_surface: currentTheme.bg_surface,
                  bg_card: currentTheme.bg_card,
                  text_primary: currentTheme.text_primary,
                  text_muted: currentTheme.text_muted,
                  accent_primary: currentTheme.accent_primary,
                  accent_glow: currentTheme.accent_glow,
                  border_color: currentTheme.border_color,
                  card_radius: currentTheme.card_radius,
                  font_family: currentTheme.font_family,
                  target_mode: currentTheme.target_mode || "all",
                  enable_video_backdrop: currentTheme.enable_video_backdrop || false,
                  video_backdrop_opacity: currentTheme.video_backdrop_opacity ?? 0.55,
                  video_delay_ms: currentTheme.video_delay_ms ?? 1000,
                });
              }}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: themeModalTab === "create" ? "var(--accent-primary)" : "transparent",
                color: themeModalTab === "create" ? "#ffffff" : "var(--text-muted)",
              }}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Crea Nuovo Tema</span>
            </button>
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
          {/* TAB 1: LISTA TEMI DISPONIBILI */}
          {themeModalTab === "list" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span
                className="text-xs font-black tracking-widest uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Scegli un tema da applicare all'istante
              </span>
              <button
                onClick={onOpenThemesFolder}
                className="flex items-center gap-1.5 text-xs font-bold"
                style={{ color: "var(--accent-primary)" }}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Apri Cartella Temi JSON</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              {themes.map((t) => {
                const isCurrent = currentTheme.id === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => onSelectTheme(t)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-3 shadow-md ${
                      isCurrent ? "ring-2" : "hover:border-slate-500"
                    }`}
                    style={{
                      backgroundColor: t.bg_card,
                      borderColor: isCurrent ? t.accent_primary : "var(--border-color)",
                      boxShadow: isCurrent ? `0 0 20px ${t.accent_glow}` : undefined,
                    }}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <span className="font-extrabold text-sm text-white block truncate">{t.name}</span>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {t.enable_video_backdrop && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                <Film className="w-2.5 h-2.5" />
                                TRAILER
                              </span>
                            )}
                            {(t.target_mode === "fullscreen" || t.target_mode === "bigpicture") && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                <Tv className="w-2.5 h-2.5" />
                                FULLSCREEN
                              </span>
                            )}
                            {t.target_mode === "desktop" && (
                              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                <Monitor className="w-2.5 h-2.5" />
                                DESKTOP
                              </span>
                            )}
                            {t.is_custom && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-500/20 text-indigo-300">
                                CUSTOM
                              </span>
                            )}
                          </div>
                        </div>
                        {isCurrent && (
                          <span
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black text-white shrink-0"
                            style={{ backgroundColor: t.accent_primary }}
                          >
                            <Check className="w-3 h-3" />
                            ATTIVO
                          </span>
                        )}
                      </div>
                      <p
                        className="text-[11px] mt-1.5 line-clamp-2 leading-relaxed"
                        style={{ color: t.text_muted }}
                      >
                        {t.description}
                      </p>
                    </div>

                    {/* Swatches preview bar */}
                    <div
                      className="flex items-center justify-between pt-2 border-t"
                      style={{ borderColor: t.border_color }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: t.bg_base }}
                          title="Colore Sfondo Base"
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: t.bg_surface }}
                          title="Colore Superficie"
                        />
                        <span
                          className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: t.accent_primary }}
                          title="Colore Accento Primario"
                        />
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTheme(t);
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-bold text-white transition-all shadow"
                        style={{
                          backgroundColor: isCurrent ? "rgba(255,255,255,0.15)" : t.accent_primary,
                        }}
                      >
                        {isCurrent ? "In Uso" : "Attiva"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: CREA NUOVO TEMA */}
        {themeModalTab === "create" && (
          <div
            className="p-5 rounded-2xl border space-y-4"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div className="space-y-1">
              <span className="text-xs font-black tracking-widest uppercase text-white">
                Editor Tema Personalizzato (Power User)
              </span>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                I temi creati vengono salvati come file JSON standard in %LOCALAPPDATA%\OmnisGameLibrary\themes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Nome del Tema
                </label>
                <input
                  type="text"
                  value={newThemeDraft.name || ""}
                  onChange={(e) => setNewThemeDraft({ ...newThemeDraft, name: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border text-white font-bold"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                />
              </div>
              <div>
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Identificativo ID univoco
                </label>
                <input
                  type="text"
                  value={newThemeDraft.id || ""}
                  onChange={(e) => setNewThemeDraft({ ...newThemeDraft, id: e.target.value })}
                  className="w-full mt-1 p-2 rounded-lg border font-mono text-white"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    borderColor: "var(--border-color)",
                  }}
                />
              </div>
            </div>

            {/* Color Pickers */}
            <div className="grid grid-cols-3 gap-3 text-xs pt-2">
              <div
                className="p-3 rounded-xl border flex flex-col gap-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sfondo Base
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newThemeDraft.bg_base || "#090c14"}
                    onChange={(e) => setNewThemeDraft({ ...newThemeDraft, bg_base: e.target.value })}
                    className="w-8 h-8 rounded border-none cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-white font-bold">
                    {newThemeDraft.bg_base}
                  </span>
                </div>
              </div>

              <div
                className="p-3 rounded-xl border flex flex-col gap-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Superficie Menu
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newThemeDraft.bg_surface || "#0e1320"}
                    onChange={(e) =>
                      setNewThemeDraft({ ...newThemeDraft, bg_surface: e.target.value })
                    }
                    className="w-8 h-8 rounded border-none cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-white font-bold">
                    {newThemeDraft.bg_surface}
                  </span>
                </div>
              </div>

              <div
                className="p-3 rounded-xl border flex flex-col gap-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <label
                  className="text-[10px] font-bold uppercase"
                  style={{ color: "var(--text-muted)" }}
                >
                  Accento Primario
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newThemeDraft.accent_primary || "#6366f1"}
                    onChange={(e) =>
                      setNewThemeDraft({
                        ...newThemeDraft,
                        accent_primary: e.target.value,
                        accent_glow: `${e.target.value}66`,
                      })
                    }
                    className="w-8 h-8 rounded border-none cursor-pointer"
                  />
                  <span className="font-mono text-[11px] text-white font-bold">
                    {newThemeDraft.accent_primary}
                  </span>
                </div>
              </div>

              {/* Opzioni Avanzate & Video Trailer */}
              <div
                className="p-3 rounded-xl border flex items-center justify-between col-span-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Film className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <label className="text-xs font-bold text-white block">
                      Abilita Video Trailer di Sfondo
                    </label>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Riproduce i trailer dinamici dei giochi in loop e muti durante la selezione
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!newThemeDraft.enable_video_backdrop}
                  onChange={(e) =>
                    setNewThemeDraft({ ...newThemeDraft, enable_video_backdrop: e.target.checked })
                  }
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                onClick={() => setThemeModalTab("list")}
                className="px-5 py-2.5 rounded-xl text-xs font-bold border"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-muted)",
                }}
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2.5 rounded-xl font-black text-xs text-white shadow-lg transition-all"
                style={{ backgroundColor: "var(--accent-primary)" }}
              >
                Crea, Salva & Applica Tema
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
