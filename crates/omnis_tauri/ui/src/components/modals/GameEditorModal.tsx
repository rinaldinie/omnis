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
import { useTranslation } from "../../i18n";
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

import { GameDto } from "../../types";
import { api } from "../../api";
import { getErrorMessage } from "../../utils/errors";

type EditableGameInput = Partial<GameDto> & {
  sorting_title?: string | null;
  user_score?: number | null;
};
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

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
    use_library_integration: true,
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

    const initFromGame = (g: EditableGameInput) => {
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
          ? g.play_actions.map((a: LaunchConfiguration) => ({
              executable: a.executable || "",
              arguments: Array.isArray(a.arguments) ? a.arguments : [],
              working_dir: a.working_dir || "",
              tracking_mode: a.tracking_mode || { type: "KernelJobObject" },
            }))
          : [],
        use_library_integration: g.use_library_integration ?? true,
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
          initFromGame(fullGame as EditableGameInput);
        }
      })
      .catch((err) => {
        console.warn("Could not load detailed game fields, using provided game object", err);
      });
  }, [isOpen, game]);

  if (!game) return null;

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
        use_library_integration: formData.use_library_integration,
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
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, t("editor_modal.save_error")));
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

  const handleUpdateAction = <K extends keyof LaunchConfiguration>(
    index: number,
    key: K,
    value: LaunchConfiguration[K]
  ) => {
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="backdrop-blur-md"
        className="max-w-4xl max-h-[92vh] p-0 flex flex-col rounded-2xl overflow-hidden gap-0"
        onEscapeKeyDown={(e) => {
          if (isSaving) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isSaving) e.preventDefault();
        }}
      >
        {/* HEADER */}
        <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-border bg-card shrink-0 space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shrink-0"
              style={{
                backgroundColor: "var(--accent-primary)",
                boxShadow: "0 0 15px var(--accent-glow)",
              }}
            >
              <Gamepad2 className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold tracking-normal text-foreground">
                {t("editor_modal.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                {formData.title || game.title} (ID: {game.id})
              </DialogDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isSaving}
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </Button>
        </DialogHeader>

        {/* TABS NAVIGATION & BODY */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <TabsList>
            <TabsTrigger value="general">
              <Sliders className="w-4 h-4" />
              <span>{t("editor_modal.tab_general")}</span>
            </TabsTrigger>
            <TabsTrigger value="description">
              <FileText className="w-4 h-4" />
              <span>{t("editor_modal.tab_description")}</span>
            </TabsTrigger>
            <TabsTrigger value="media">
              <ImageIcon className="w-4 h-4" />
              <span>{t("editor_modal.tab_media")}</span>
            </TabsTrigger>
            <TabsTrigger value="actions">
              <Terminal className="w-4 h-4" />
              <span>
                {t("editor_modal.tab_launch")} ({formData.play_actions.length})
              </span>
            </TabsTrigger>
            <TabsTrigger value="links">
              <LinkIcon className="w-4 h-4" />
              <span>
                {t("editor_modal.tab_links")} ({formData.custom_links.length})
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            <TabsContent value="general" className="mt-0">
              <GeneralTab formData={formData} onChange={updateFormData} />
            </TabsContent>
            <TabsContent value="description" className="mt-0">
              <DescriptionTab formData={formData} onChange={updateFormData} />
            </TabsContent>
            <TabsContent value="media" className="mt-0">
              <MediaTab
                formData={formData}
                initialMedia={initialMedia}
                onChange={updateFormData}
                onPickImage={handlePickImage}
              />
            </TabsContent>
            <TabsContent value="actions" className="mt-0">
              <PlayActionsTab
                playActions={formData.play_actions}
                isCustomGame={game.library === "custom"}
                useLibraryIntegration={formData.use_library_integration}
                onToggleLibraryIntegration={(val) =>
                  setFormData((prev) => ({
                    ...prev,
                    use_library_integration: val,
                  }))
                }
                onAddAction={handleAddAction}
                onRemoveAction={handleRemoveAction}
                onUpdateAction={handleUpdateAction}
                onPickExe={handlePickExe}
                onPickDir={handlePickDir}
              />
            </TabsContent>
            <TabsContent value="links" className="mt-0">
              <CustomLinksTab
                customLinks={formData.custom_links}
                onAddLink={handleAddLink}
                onRemoveLink={handleRemoveLink}
                onUpdateLink={handleUpdateLink}
              />
            </TabsContent>
          </div>
        </Tabs>

        {/* FEEDBACK STATUS */}
        {saveError && (
          <div className="px-6 py-2.5 bg-rose-500/20 border-t border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
        {saveSuccess && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-t border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 shrink-0">
            <Check className="w-4 h-4 shrink-0" />
            <span>{t("editor_modal.saved")}</span>
          </div>
        )}

        {/* FOOTER BUTTONS */}
        <DialogFooter className="flex-row items-center justify-end gap-3 px-6 py-4 border-t border-border bg-card shrink-0 sm:space-x-0">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !formData.title.trim()}
            className="px-6 py-2.5 h-auto shadow-xl"
            style={{
              boxShadow: "0 0 20px var(--accent-glow)",
            }}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>
              {isSaving ? t("common.loading") : t("editor_modal.save_changes")}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 h-auto"
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
