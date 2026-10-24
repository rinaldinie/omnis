import React, { useState } from "react";
import { PlusCircle, X, FolderOpen, Folder } from "lucide-react";
import { invokeTauri } from "../../types";

interface CustomGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (gameTitle: string) => void;
}

export default function CustomGameModal({
  isOpen,
  onClose,
  onSuccess,
}: CustomGameModalProps) {
  const [customTitle, setCustomTitle] = useState<string>("");
  const [customExePath, setCustomExePath] = useState<string>("");
  const [customCoverPath, setCustomCoverPath] = useState<string>("");
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);

  if (!isOpen) return null;

  const handlePickCustomExe = async () => {
    try {
      const path = await invokeTauri<string>("pick_executable_file");
      if (path) {
        setCustomExePath(path);
        if (!customTitle.trim()) {
          const sep = path.includes("\\") ? "\\" : "/";
          const filename = path.split(sep).pop() || "";
          const formatted = filename
            .replace(/\.(exe|bat|cmd|lnk)$/i, "")
            .replace(/[_-]/g, " ")
            .trim();
          setCustomTitle(formatted);
        }
      }
    } catch (e) {
      console.error("Failed to pick executable:", e);
    }
  };

  const handlePickCustomFolder = async () => {
    try {
      const dir = await invokeTauri<string>("pick_directory");
      if (dir) {
        const exes = await invokeTauri<string[]>("find_executables_in_folder", {
          folderPath: dir,
        });
        if (exes && exes.length > 0) {
          setCustomExePath(exes[0]);
        } else {
          setCustomExePath(dir);
        }
        if (!customTitle.trim()) {
          const sep = dir.includes("\\") ? "\\" : "/";
          const folderName = dir.split(sep).filter(Boolean).pop() || "";
          setCustomTitle(folderName.replace(/[_-]/g, " ").trim());
        }
      }
    } catch (e) {
      console.error("Failed to pick directory:", e);
    }
  };

  const handlePickCustomCover = async () => {
    try {
      const path = await invokeTauri<string>("pick_image_file");
      if (path) {
        setCustomCoverPath(path);
      }
    } catch (e) {
      console.error("Failed to pick cover:", e);
    }
  };

  const handleAddCustomGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customExePath.trim()) return;
    setIsAddingCustom(true);
    try {
      await invokeTauri("add_custom_game", {
        payload: {
          title: customTitle.trim(),
          executable_path: customExePath.trim(),
          arguments: [],
          working_dir: null,
          cover_image_path: customCoverPath.trim() || null,
        },
      });
      const title = customTitle;
      setCustomTitle("");
      setCustomExePath("");
      setCustomCoverPath("");
      onSuccess(title);
    } catch (err) {
      console.error("Errore aggiunta custom game:", err);
    } finally {
      setIsAddingCustom(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        <div
          className="flex items-center justify-between pb-4 border-b"
          style={{ borderColor: "var(--border-color)" }}
        >
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold tracking-wide">
              Aggiungi Gioco (.exe o Cartella)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleAddCustomGame} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              Titolo Gioco *
            </label>
            <input
              type="text"
              required
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Es. Dark Souls Remastered"
              className="w-full px-3 py-2 rounded-xl border bg-black/30 text-sm font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              style={{ borderColor: "var(--border-color)" }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              Eseguibile o Cartella Gioco *
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={customExePath}
                onChange={(e) => setCustomExePath(e.target.value)}
                placeholder="C:\Games\MyGame\game.exe o cartella"
                className="flex-1 px-3 py-2 rounded-xl border bg-black/30 text-xs font-mono font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                style={{ borderColor: "var(--border-color)" }}
              />
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePickCustomExe}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors"
                  style={{ borderColor: "var(--border-color)" }}
                  title="Sfoglia file eseguibile (.exe)..."
                >
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Sfoglia .exe</span>
                </button>
                <button
                  type="button"
                  onClick={handlePickCustomFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors"
                  style={{ borderColor: "var(--border-color)" }}
                  title="Sfoglia cartella di installazione del gioco..."
                >
                  <Folder className="w-3.5 h-3.5 text-sky-400" />
                  <span>Cartella</span>
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              Percorso Locandina (Opzionale)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCoverPath}
                onChange={(e) => setCustomCoverPath(e.target.value)}
                placeholder="C:\Images\cover.jpg oppure https://..."
                className="flex-1 px-3 py-2 rounded-xl border bg-black/30 text-xs font-mono font-normal focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                style={{ borderColor: "var(--border-color)" }}
              />
              <button
                type="button"
                onClick={handlePickCustomCover}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors shrink-0"
                style={{ borderColor: "var(--border-color)" }}
                title="Sfoglia immagine copertina..."
              >
                <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sfoglia...</span>
              </button>
            </div>
          </div>

          <div
            className="flex justify-end gap-2 pt-4 border-t"
            style={{ borderColor: "var(--border-color)" }}
          >
            <button
              type="submit"
              disabled={isAddingCustom}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white shadow-lg transition-all hover:brightness-110 active:opacity-90 cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--accent-primary)" }}
            >
              <PlusCircle className="w-4 h-4" />
              <span>{isAddingCustom ? "Importazione..." : "Aggiungi al Catalogo"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border text-xs font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
              style={{ borderColor: "var(--border-color)" }}
            >
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
