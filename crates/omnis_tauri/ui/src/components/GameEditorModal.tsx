import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  Sliders,
  FileText,
  Image as ImageIcon,
  Terminal,
  Link as LinkIcon,
  Check,
  AlertCircle,
  Loader2,
  Gamepad2,
} from "lucide-react";
import { useTranslation } from "../i18n";
import {
  CustomLink,
  ProcessTrackingMode,
  LaunchConfiguration,
  GameEditorFormData,
} from "./game_editor/types";
import { GeneralTab } from "./game_editor/GeneralTab";
import { DescriptionTab } from "./game_editor/DescriptionTab";
import { MediaTab } from "./game_editor/MediaTab";
import { PlayActionsTab } from "./game_editor/PlayActionsTab";
import { CustomLinksTab } from "./game_editor/CustomLinksTab";

export type { CustomLink, ProcessTrackingMode, LaunchConfiguration, GameEditorFormData };

import { GameDto } from "../types";
import { api } from "../api";

export interface GameEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: GameDto | null;
  onSave: (updated: GameDto) => void;
}

export default function GameEditorModal({
  isOpen,
  onClose,
  game,
  onSave,
}: GameEditorModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<
    "general" | "description" | "media" | "actions" | "links"
  >("general");

  const [formData, setFormData] = useState<GameEditorFormData>({
    title: "",
    sorting_title: "",
    series: "",
    age_rating: "",
    completion_status: "NotPlayed",
    release_date: "",
    user_score: null,
    critic_score: null,
    community_score: null,
    genresText: "",
    developersText: "",
    publishersText: "",
    tagsText: "",
    featuresText: "",
    description: "",
    user_notes: "",
    cover_image_path: "",
    background_image_path: "",
    icon_image_path: "",
    play_actions: [],
    custom_links: [],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [initialMedia, setInitialMedia] = useState<{
    cover_image_path: string;
    background_image_path: string;
    icon_image_path: string;
  }>({
    cover_image_path: "",
    background_image_path: "",
    icon_image_path: "",
  });

  useEffect(() => {
    if (!isOpen || !game) return;

    setSaveError(null);
    setSaveSuccess(false);

    const initFromGame = (g: any) => {
      let parsedExtra: any = {};
      try {
        if (g.extra_metadata) {
          parsedExtra = typeof g.extra_metadata === "string" ? JSON.parse(g.extra_metadata) : g.extra_metadata;
        }
      } catch {}
      const hltb = parsedExtra?.howlongtobeat || {};

      const cleanRawMedia = (path?: string | null, img?: string | null) => {
        if (path && !path.startsWith("asset:") && !path.startsWith("http://asset.localhost")) {
          return path;
        }
        if (img && !img.startsWith("asset:") && !img.startsWith("http://asset.localhost")) {
          return img;
        }
        return path || img || "";
      };

      const coverPath = cleanRawMedia(g.cover_image_path, g.cover_image);
      const bgPath = cleanRawMedia(g.background_image_path, g.background_image);
      const iconPath = cleanRawMedia(g.icon_image_path, g.icon_image);

      setFormData({
        title: g.title || "",
        sorting_title: g.sorting_title || g.title?.toLowerCase() || "",
        series: g.series || "",
        age_rating: g.age_rating || "",
        completion_status: g.completion_status || "NotPlayed",
        release_date: g.release_date || "",
        user_score: g.user_score ?? null,
        critic_score: g.critic_score ?? null,
        community_score: g.community_score ?? null,
        genresText: Array.isArray(g.genres) ? g.genres.join(", ") : "",
        developersText: Array.isArray(g.developers) ? g.developers.join(", ") : "",
        publishersText: Array.isArray(g.publishers) ? g.publishers.join(", ") : "",
        tagsText: Array.isArray(g.tags) ? g.tags.join(", ") : "",
        featuresText: Array.isArray(g.features) ? g.features.join(", ") : "",
        description: g.description || "",
        user_notes: g.user_notes || "",
        cover_image_path: coverPath,
        background_image_path: bgPath,
        icon_image_path: iconPath,
        play_actions: Array.isArray(g.play_actions)
          ? g.play_actions.map((a: any) => ({
              executable: a.executable || "",
              arguments: Array.isArray(a.arguments) ? a.arguments : [],
              working_dir: a.working_dir || "",
              tracking_mode: a.tracking_mode || { type: "KernelJobObject" },
            }))
          : [],
        custom_links: Array.isArray(g.custom_links) ? g.custom_links : [],
      });

      setInitialMedia({
        cover_image_path: coverPath,
        background_image_path: bgPath,
        icon_image_path: iconPath,
      });

      if (coverPath) api.games.allowMediaFile(coverPath).catch(() => {});
      if (bgPath) api.games.allowMediaFile(bgPath).catch(() => {});
      if (iconPath) api.games.allowMediaFile(iconPath).catch(() => {});
    };

    initFromGame(game);

    api.games.getGame(game.id)
      .then((fullGame) => {
        if (fullGame) {
          initFromGame(fullGame);
        }
      })
      .catch((err) => {
        console.warn("Could not load detailed game fields, using provided game object", err);
      });
  }, [isOpen, game]);

  if (!isOpen || !game) return null;

  const updateFormData = (fields: Partial<GameEditorFormData>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);

      const parseCsv = (txt: string) =>
        txt
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

      const extraMetadataStr = game.extra_metadata || null;

      const cleanedPlayActions: LaunchConfiguration[] = formData.play_actions
        .filter((a) => a.executable && a.executable.trim().length > 0)
        .map((a) => ({
          executable: a.executable.trim(),
          arguments: Array.isArray(a.arguments) ? a.arguments : [],
          working_dir: a.working_dir && a.working_dir.trim().length > 0 ? a.working_dir.trim() : null,
          tracking_mode: a.tracking_mode || { type: "KernelJobObject" },
        }));

      const gameUpdate = {
        id: game.id,
        title: formData.title.trim(),
        sorting_title: formData.sorting_title.trim() || null,
        release_date: formData.release_date.trim() || null,
        description: formData.description.trim() || null,
        user_score:
          formData.user_score !== null && formData.user_score !== undefined
            ? Math.min(100, Math.max(0, Number(formData.user_score)))
            : null,
        critic_score:
          formData.critic_score !== null && formData.critic_score !== undefined
            ? Math.min(100, Math.max(0, Number(formData.critic_score)))
            : null,
        community_score:
          formData.community_score !== null && formData.community_score !== undefined
            ? Math.min(100, Math.max(0, Number(formData.community_score)))
            : null,
        series: formData.series.trim() || null,
        age_rating: formData.age_rating.trim() || null,
        completion_status: formData.completion_status || "NotPlayed",
        user_notes: formData.user_notes.trim() || null,
        extra_metadata: extraMetadataStr,
        genres: parseCsv(formData.genresText),
        developers: parseCsv(formData.developersText),
        publishers: parseCsv(formData.publishersText),
        tags: parseCsv(formData.tagsText),
        features: parseCsv(formData.featuresText),
        cover_image_path: formData.cover_image_path.trim() || null,
        background_image_path: formData.background_image_path.trim() || null,
        icon_image_path: formData.icon_image_path.trim() || null,
        play_actions: cleanedPlayActions,
        custom_links: formData.custom_links,
      };

      const result = await api.games.updateGameMetadata(gameUpdate);
      const updated = result
        ? {
            ...result,
            play_actions:
              Array.isArray(result.play_actions) && result.play_actions.length > 0
                ? result.play_actions
                : cleanedPlayActions,
          }
        : { ...game, ...gameUpdate };

      setSaveSuccess(true);
      setTimeout(() => {
        onSave(updated);
        onClose();
      }, 400);
    } catch (err: any) {
      setSaveError(typeof err === "string" ? err : err.message || t("editor_modal.save_error"));
    } finally {
      setIsSaving(false);
    }
  };

  // Play Actions handlers
  const handleAddAction = () => {
    const newAction: LaunchConfiguration = {
      executable: "",
      arguments: [],
      working_dir: "",
      tracking_mode: { type: "KernelJobObject" },
    };
    setFormData((prev) => ({
      ...prev,
      play_actions: [...prev.play_actions, newAction],
    }));
  };

  const handleRemoveAction = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      play_actions: prev.play_actions.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateAction = (index: number, key: keyof LaunchConfiguration, value: any) => {
    setFormData((prev) => {
      const updated = [...prev.play_actions];
      updated[index] = { ...updated[index], [key]: value };
      return { ...prev, play_actions: updated };
    });
  };

  // Custom Links handlers
  const handleAddLink = () => {
    const newLink: CustomLink = { title: "", url: "https://" };
    setFormData((prev) => ({
      ...prev,
      custom_links: [...prev.custom_links, newLink],
    }));
  };

  const handleRemoveLink = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      custom_links: prev.custom_links.filter((_, i) => i !== index),
    }));
  };

  const handleUpdateLink = (index: number, key: keyof CustomLink, value: string) => {
    setFormData((prev) => {
      const updated = [...prev.custom_links];
      updated[index] = { ...updated[index], [key]: value };
      return { ...prev, custom_links: updated };
    });
  };

  // Tauri File Dialog Pickers
  const handlePickExe = async (actionIdx: number) => {
    try {
      const path = await api.games.pickExecutableFile();
      if (path) {
        let exeToSet = path;
        let workingDirToSet: string | null = null;
        let argsToSet: string[] = [];

        try {
          const resolved = await api.games.resolveExecutablePath(path);
          if (resolved) {
            exeToSet = resolved.executable_path || path;
            if (resolved.working_dir) {
              workingDirToSet = resolved.working_dir;
            }
            if (resolved.arguments && resolved.arguments.length > 0) {
              argsToSet = resolved.arguments;
            }
          }
        } catch (resolveErr) {
          console.warn("Could not resolve shortcut details:", resolveErr);
        }

        handleUpdateAction(actionIdx, "executable", exeToSet);
        const currentAction = formData.play_actions[actionIdx];
        if (workingDirToSet && !currentAction?.working_dir) {
          handleUpdateAction(actionIdx, "working_dir", workingDirToSet);
        } else if (!currentAction?.working_dir) {
          const sep = exeToSet.includes("\\") ? "\\" : "/";
          const lastIdx = exeToSet.lastIndexOf(sep);
          if (lastIdx > 0) {
            handleUpdateAction(actionIdx, "working_dir", exeToSet.substring(0, lastIdx));
          }
        }
        if (argsToSet.length > 0 && (!currentAction?.arguments || currentAction.arguments.length === 0)) {
          handleUpdateAction(actionIdx, "arguments", argsToSet);
        }
      }
    } catch (err) {
      console.warn("Failed to pick executable:", err);
    }
  };

  const handlePickDir = async (actionIdx: number) => {
    try {
      const dir = await api.games.pickDirectory();
      if (dir) {
        handleUpdateAction(actionIdx, "working_dir", dir);
      }
    } catch (err) {
      console.warn("Failed to pick directory:", err);
    }
  };

  const handlePickImage = async (field: "cover_image_path" | "background_image_path" | "icon_image_path") => {
    try {
      const path = await api.games.pickImageFile();
      if (path) {
        await api.games.allowMediaFile(path).catch(() => {});
        setFormData((prev) => ({ ...prev, [field]: path }));
      }
    } catch (err) {
      console.warn("Failed to pick image:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {/* HEADER */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-normal text-white">
                {t('editor_modal.title')}
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formData.title || game.title} (ID: {game.id})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS NAVIGATION */}
        <div
          className="flex items-center px-6 border-b shrink-0 gap-1 overflow-x-auto"
          style={{
            backgroundColor: "var(--bg-surface)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === "general"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={{
              borderColor: activeTab === "general" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "general" ? "var(--accent-primary)" : undefined,
            }}
          >
            <Sliders className="w-4 h-4" />
            <span>{t('editor_modal.tab_general')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("description")}
            className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === "description"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={{
              borderColor: activeTab === "description" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "description" ? "var(--accent-primary)" : undefined,
            }}
          >
            <FileText className="w-4 h-4" />
            <span>{t('editor_modal.tab_description')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("media")}
            className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === "media"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={{
              borderColor: activeTab === "media" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "media" ? "var(--accent-primary)" : undefined,
            }}
          >
            <ImageIcon className="w-4 h-4" />
            <span>{t('editor_modal.tab_media')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("actions")}
            className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === "actions"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={{
              borderColor: activeTab === "actions" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "actions" ? "var(--accent-primary)" : undefined,
            }}
          >
            <Terminal className="w-4 h-4" />
            <span>{t('editor_modal.tab_launch')} ({formData.play_actions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`flex items-center gap-2 py-3 px-3.5 text-xs font-medium border-b-2 transition-all ${
              activeTab === "links"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
            style={{
              borderColor: activeTab === "links" ? "var(--accent-primary)" : "transparent",
              color: activeTab === "links" ? "var(--accent-primary)" : undefined,
            }}
          >
            <LinkIcon className="w-4 h-4" />
            <span>{t('editor_modal.tab_links')} ({formData.custom_links.length})</span>
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === "general" && (
            <GeneralTab formData={formData} onChange={updateFormData} />
          )}

          {activeTab === "description" && (
            <DescriptionTab formData={formData} onChange={updateFormData} />
          )}

          {activeTab === "media" && (
            <MediaTab
              formData={formData}
              initialMedia={initialMedia}
              onChange={updateFormData}
              onPickImage={handlePickImage}
            />
          )}

          {activeTab === "actions" && (
            <PlayActionsTab
              playActions={formData.play_actions}
              onAddAction={handleAddAction}
              onRemoveAction={handleRemoveAction}
              onUpdateAction={handleUpdateAction}
              onPickExe={handlePickExe}
              onPickDir={handlePickDir}
            />
          )}

          {activeTab === "links" && (
            <CustomLinksTab
              customLinks={formData.custom_links}
              onAddLink={handleAddLink}
              onRemoveLink={handleRemoveLink}
              onUpdateLink={handleUpdateLink}
            />
          )}
        </div>

        {/* FEEDBACK STATUS */}
        {saveError && (
          <div className="px-6 py-2.5 bg-rose-500/20 border-t border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-t border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{t("editor_modal.saved")}</span>
          </div>
        )}

        {/* FOOTER BUTTONS */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !formData.title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-medium text-white shadow-xl transition-all hover:brightness-110 active:opacity-90 disabled:opacity-50 cursor-pointer"
            style={{
              backgroundColor: "var(--accent-primary)",
              boxShadow: "0 0 20px var(--accent-glow)",
            }}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? t('common.loading') : t('editor_modal.save_changes')}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl border text-xs font-medium text-slate-300 hover:bg-white/5 transition-all cursor-pointer"
            style={{
              borderColor: "var(--border-color)",
            }}
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
