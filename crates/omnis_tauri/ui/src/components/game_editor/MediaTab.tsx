import React, { useState, useEffect, useMemo } from "react";
import {
  FolderOpen,
  Gamepad2,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import { GameEditorFormData } from "./types";
import { useTranslation } from "../../i18n";
import { formatImageUrl } from "../../types";
import { api } from "../../api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface MediaTabProps {
  formData: GameEditorFormData;
  initialMedia?: {
    cover_image_path: string;
    background_image_path: string;
    icon_image_path: string;
  };
  onChange: (fields: Partial<GameEditorFormData>) => void;
  onPickImage: (field: "cover_image_path" | "background_image_path" | "icon_image_path") => void;
}

interface MediaPreviewProps {
  rawPath: string;
  alt: string;
  emptyIcon: React.ReactNode;
  emptyText: string;
  containerClass: string;
  isModified?: boolean;
}

const MediaPreview: React.FC<MediaPreviewProps> = ({
  rawPath,
  alt,
  emptyIcon,
  emptyText,
  containerClass,
  isModified,
}) => {
  const { t } = useTranslation();
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const formattedUrl = useMemo(() => {
    return formatImageUrl(rawPath);
  }, [rawPath]);

  useEffect(() => {
    const trimmed = rawPath?.trim();
    if (!trimmed) {
      setLoadStatus("idle");
      return;
    }

    // If local disk file path, ensure Tauri media scope allows it
    if (
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("data:") &&
      !trimmed.startsWith("asset:")
    ) {
      api.games.allowMediaFile(trimmed).catch(() => {});
    }

    setLoadStatus("loading");
  }, [rawPath]);

  return (
    <div
      className={`relative rounded-xl overflow-hidden border border-white/10 bg-black/60 shrink-0 shadow-lg flex items-center justify-center select-none ${containerClass}`}
    >
      {rawPath && loadStatus === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs z-10 text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        </div>
      )}

      {rawPath && loadStatus === "error" && (
        <div className="flex flex-col items-center justify-center p-3 text-center text-rose-300 gap-1.5 h-full w-full bg-rose-950/30">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span className="text-[11px] font-medium leading-tight">
            {t("editor_media.load_error")}
          </span>
          <span className="text-[10px] text-slate-400 leading-tight">
            {t("editor_media.load_error_hint")}
          </span>
        </div>
      )}

      {rawPath ? (
        <img
          key={formattedUrl || rawPath}
          src={formattedUrl || ""}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            loadStatus === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoadStatus("loaded")}
          onError={() => setLoadStatus("error")}
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center text-slate-500 text-xs">
          {emptyIcon}
          <span>{emptyText}</span>
        </div>
      )}

      {isModified && loadStatus === "loaded" && (
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-indigo-600/90 text-white text-[9px] font-bold shadow-md tracking-wide uppercase pointer-events-none">
          {t("editor_media.new_selection")}
        </div>
      )}
    </div>
  );
};

export const MediaTab: React.FC<MediaTabProps> = ({
  formData,
  initialMedia,
  onChange,
  onPickImage,
}) => {
  const { t } = useTranslation();

  const handleTextChange = (
    field: "cover_image_path" | "background_image_path" | "icon_image_path",
    value: string
  ) => {
    onChange({ [field]: value });
    const trimmed = value.trim();
    if (
      trimmed &&
      !trimmed.startsWith("http://") &&
      !trimmed.startsWith("https://") &&
      !trimmed.startsWith("data:")
    ) {
      api.games.allowMediaFile(trimmed).catch(() => {});
    }
  };

  const isCoverModified = Boolean(
    initialMedia && formData.cover_image_path !== initialMedia.cover_image_path
  );
  const isBgModified = Boolean(
    initialMedia && formData.background_image_path !== initialMedia.background_image_path
  );
  const isIconModified = Boolean(
    initialMedia && formData.icon_image_path !== initialMedia.icon_image_path
  );

  return (
    <div className="space-y-6">
      {/* Cover 2:3 */}
      <div
        className="p-5 rounded-2xl border space-y-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-200">
              {t("editor_media.cover")}
            </span>
            {isCoverModified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                {t("editor_media.new_selection")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isCoverModified && initialMedia?.cover_image_path && (
              <button
                type="button"
                onClick={() => onChange({ cover_image_path: initialMedia.cover_image_path })}
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                title={t("editor_media.revert_original")}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t("editor_media.revert_original")}</span>
              </button>
            )}
            {formData.cover_image_path && (
              <button
                type="button"
                onClick={() => onChange({ cover_image_path: "" })}
                className="text-xs text-rose-400 hover:underline"
              >
                {t("editor_media.remove_cover")}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-5 items-start">
          <MediaPreview
            rawPath={formData.cover_image_path}
            alt={t("editor_media.cover_preview")}
            emptyIcon={<ImageIcon className="w-6 h-6 text-slate-600" />}
            emptyText={t("editor_media.no_cover")}
            containerClass="w-32 aspect-[2/3]"
            isModified={isCoverModified}
          />

          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-slate-300">
              {t("editor_media.path_label")}
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={formData.cover_image_path}
                onChange={(e) => handleTextChange("cover_image_path", e.target.value)}
                className="flex-1 h-9 px-3.5 py-2 bg-popover text-xs font-mono"
                placeholder={t("editor_media.cover_placeholder")}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onPickImage("cover_image_path")}
                className="h-9 bg-popover font-medium shrink-0"
                title={t("editor_media.pick_cover_title")}
              >
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>{t("custom_game.browse")}</span>
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              {t("editor_media.path_hint")}
            </p>
          </div>
        </div>
      </div>

      {/* Background 16:9 */}
      <div
        className="p-5 rounded-2xl border space-y-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-200">
              {t("editor_media.background")}
            </span>
            {isBgModified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                {t("editor_media.new_selection")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isBgModified && initialMedia?.background_image_path && (
              <button
                type="button"
                onClick={() => onChange({ background_image_path: initialMedia.background_image_path })}
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                title={t("editor_media.revert_original")}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t("editor_media.revert_original")}</span>
              </button>
            )}
            {formData.background_image_path && (
              <button
                type="button"
                onClick={() => onChange({ background_image_path: "" })}
                className="text-xs text-rose-400 hover:underline"
              >
                {t("editor_media.remove_background")}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <MediaPreview
            rawPath={formData.background_image_path}
            alt={t("editor_media.background_preview")}
            emptyIcon={<ImageIcon className="w-8 h-8 text-slate-600" />}
            emptyText={t("editor_media.no_background")}
            containerClass="w-full h-40 sm:h-44"
            isModified={isBgModified}
          />

          <div className="flex gap-2">
            <Input
              type="text"
              value={formData.background_image_path}
              onChange={(e) => handleTextChange("background_image_path", e.target.value)}
              className="flex-1 h-9 px-3.5 py-2 bg-popover text-xs font-mono"
              placeholder={t("editor_media.background_placeholder")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPickImage("background_image_path")}
              className="h-9 bg-popover font-medium shrink-0"
              title={t("editor_media.pick_background_title")}
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>{t("custom_game.browse")}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Icon 1:1 */}
      <div
        className="p-5 rounded-2xl border space-y-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-200">
              {t("editor_media.icon")}
            </span>
            {isIconModified && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                {t("editor_media.new_selection")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {isIconModified && initialMedia?.icon_image_path && (
              <button
                type="button"
                onClick={() => onChange({ icon_image_path: initialMedia.icon_image_path })}
                className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1"
                title={t("editor_media.revert_original")}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t("editor_media.revert_original")}</span>
              </button>
            )}
            {formData.icon_image_path && (
              <button
                type="button"
                onClick={() => onChange({ icon_image_path: "" })}
                className="text-xs text-rose-400 hover:underline"
              >
                {t("editor_media.remove_icon")}
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <MediaPreview
            rawPath={formData.icon_image_path}
            alt={t("editor_media.icon_preview")}
            emptyIcon={<Gamepad2 className="w-6 h-6 text-slate-500" />}
            emptyText={t("editor_media.no_icon")}
            containerClass="w-16 h-16"
            isModified={isIconModified}
          />

          <div className="flex-1 flex gap-2">
            <Input
              type="text"
              value={formData.icon_image_path}
              onChange={(e) => handleTextChange("icon_image_path", e.target.value)}
              className="flex-1 h-9 px-3.5 py-2 bg-popover text-xs font-mono"
              placeholder={t("editor_media.icon_placeholder")}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPickImage("icon_image_path")}
              className="h-9 bg-popover font-medium shrink-0"
              title={t("editor_media.pick_icon_title")}
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>{t("custom_game.browse")}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
