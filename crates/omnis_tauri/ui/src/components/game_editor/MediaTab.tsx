import React from "react";
import { FolderOpen, Gamepad2 } from "lucide-react";
import { GameEditorFormData } from "./types";
import { useTranslation } from "../../i18n";

interface MediaTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
  onPickImage: (field: "cover_image_path" | "background_image_path" | "icon_image_path") => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ formData, onChange, onPickImage }) => {
  const { t } = useTranslation();
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
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-200">
            {t("editor_media.cover")}
          </span>
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

        <div className="flex gap-5 items-start">
          <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-black/50 shrink-0 shadow-lg flex items-center justify-center">
            {formData.cover_image_path ? (
              <img
                src={formData.cover_image_path}
                alt={t("editor_media.cover_preview")}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-center p-2 text-slate-500 text-xs">
                {t("editor_media.no_cover")}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-slate-300">
              {t("editor_media.path_label")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.cover_image_path}
                onChange={(e) => onChange({ cover_image_path: e.target.value })}
                className="flex-1 px-3.5 py-2 rounded-xl border text-xs font-mono outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder={t("editor_media.cover_placeholder")}
              />
              <button
                type="button"
                onClick={() => onPickImage("cover_image_path")}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/10 transition-colors shrink-0"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                title={t("editor_media.pick_cover_title")}
              >
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>{t("custom_game.browse")}</span>
              </button>
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
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-200">
            {t("editor_media.background")}
          </span>
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

        <div className="space-y-3">
          <div className="w-full h-36 rounded-xl overflow-hidden border border-white/10 bg-black/50 shadow-lg flex items-center justify-center">
            {formData.background_image_path ? (
              <img
                src={formData.background_image_path}
                alt={t("editor_media.background_preview")}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-center p-2 text-slate-500 text-xs">
                {t("editor_media.no_background")}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={formData.background_image_path}
              onChange={(e) => onChange({ background_image_path: e.target.value })}
              className="flex-1 px-3.5 py-2 rounded-xl border text-xs font-mono outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              placeholder={t("editor_media.background_placeholder")}
            />
            <button
              type="button"
              onClick={() => onPickImage("background_image_path")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/10 transition-colors shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              title={t("editor_media.pick_background_title")}
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>{t("custom_game.browse")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Icon */}
      <div
        className="p-5 rounded-2xl border space-y-4"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <span className="text-xs font-medium text-slate-200">
          {t("editor_media.icon")}
        </span>

        <div className="flex gap-4 items-center">
          <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-black/50 shrink-0 shadow-md flex items-center justify-center">
            {formData.icon_image_path ? (
              <img
                src={formData.icon_image_path}
                alt={t("editor_media.icon_preview")}
                className="w-full h-full object-cover"
              />
            ) : (
              <Gamepad2 className="w-6 h-6 text-slate-500" />
            )}
          </div>

          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={formData.icon_image_path}
              onChange={(e) => onChange({ icon_image_path: e.target.value })}
              className="flex-1 px-3.5 py-2 rounded-xl border text-xs font-mono outline-none"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              placeholder={t("editor_media.icon_placeholder")}
            />
            <button
              type="button"
              onClick={() => onPickImage("icon_image_path")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/10 transition-colors shrink-0"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-color)",
                color: "var(--text-primary)",
              }}
              title={t("editor_media.pick_icon_title")}
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>{t("custom_game.browse")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
