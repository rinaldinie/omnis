import React from "react";
import { FolderOpen, Gamepad2 } from "lucide-react";
import { GameEditorFormData } from "./types";

interface MediaTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
  onPickImage: (field: "cover_image_path" | "background_image_path" | "icon_image_path") => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({ formData, onChange, onPickImage }) => {
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
            Copertina Verticale (Rapporto 2:3 - Standard 600x900)
          </span>
          {formData.cover_image_path && (
            <button
              type="button"
              onClick={() => onChange({ cover_image_path: "" })}
              className="text-xs text-rose-400 hover:underline"
            >
              Rimuovi Cover
            </button>
          )}
        </div>

        <div className="flex gap-5 items-start">
          <div className="w-32 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-black/50 shrink-0 shadow-lg flex items-center justify-center">
            {formData.cover_image_path ? (
              <img
                src={formData.cover_image_path}
                alt="Preview Cover"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-center p-2 text-slate-500 text-xs">
                Nessuna Cover
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-slate-300">
              Percorso file locale o URL remoto immagine
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
                placeholder="C:\percorso\cover.jpg oppure https://..."
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
                title="Seleziona file immagine dal computer..."
              >
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                <span>Sfoglia...</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Supporta percorsi assoluti locali su disco, data URLs base64 o link HTTPS diretti.
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
            Sfondo Panoramico Hero (Rapporto 16:9 - 1920x1080)
          </span>
          {formData.background_image_path && (
            <button
              type="button"
              onClick={() => onChange({ background_image_path: "" })}
              className="text-xs text-rose-400 hover:underline"
            >
              Rimuovi Sfondo
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div className="w-full h-36 rounded-xl overflow-hidden border border-white/10 bg-black/50 shadow-lg flex items-center justify-center">
            {formData.background_image_path ? (
              <img
                src={formData.background_image_path}
                alt="Preview Background"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <div className="text-center p-2 text-slate-500 text-xs">
                Nessun Sfondo Panoramico
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
              placeholder="C:\percorso\background.jpg oppure https://..."
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
              title="Seleziona file sfondo dal computer..."
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>Sfoglia...</span>
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
          Icona Titolo (Rapporto 1:1)
        </span>

        <div className="flex gap-4 items-center">
          <div className="w-14 h-14 rounded-xl overflow-hidden border border-white/10 bg-black/50 shrink-0 shadow-md flex items-center justify-center">
            {formData.icon_image_path ? (
              <img
                src={formData.icon_image_path}
                alt="Preview Icon"
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
              placeholder="Percorso icona locale o URL .ico/.png"
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
              title="Seleziona icona dal computer..."
            >
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>Sfoglia...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
