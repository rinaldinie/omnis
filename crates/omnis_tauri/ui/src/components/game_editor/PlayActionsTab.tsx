import React from "react";
import { Plus, Trash2, FolderOpen, Folder, Terminal } from "lucide-react";
import { LaunchConfiguration } from "./types";

interface PlayActionsTabProps {
  playActions: LaunchConfiguration[];
  onAddAction: () => void;
  onRemoveAction: (index: number) => void;
  onUpdateAction: (index: number, key: keyof LaunchConfiguration, value: any) => void;
  onPickExe: (index: number) => void;
  onPickDir: (index: number) => void;
}

export const PlayActionsTab: React.FC<PlayActionsTabProps> = ({
  playActions,
  onAddAction,
  onRemoveAction,
  onUpdateAction,
  onPickExe,
  onPickDir,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-normal text-slate-400">
          Configura gli eseguibili, parametri di lancio e modalità di monitoraggio del gioco.
        </span>
        <button
          type="button"
          onClick={onAddAction}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white transition-all shadow-md"
          style={{
            backgroundColor: "var(--accent-primary)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Aggiungi Azione</span>
        </button>
      </div>

      {playActions.length === 0 ? (
        <div
          className="p-10 rounded-2xl border border-dashed text-center space-y-3"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <Terminal className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-white">Nessuna azione di avvio configurata</p>
          <p className="text-xs text-slate-400">
            Fai click su "Aggiungi Azione" per impostare un percorso eseguibile custom o selezionare una cartella.
          </p>
        </div>
      ) : (
        playActions.map((action, idx) => (
          <div
            key={idx}
            className="p-5 rounded-2xl border space-y-4 shadow-sm"
            style={{
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
            }}
          >
            <div
              className="flex items-center justify-between border-b pb-2"
              style={{ borderColor: "var(--border-color)" }}
            >
              <span className="text-xs font-medium text-indigo-400">
                Azione #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAction(idx)}
                className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Rimuovi</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-300">
                  Eseguibile (File .exe o Comando) *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={action.executable}
                    onChange={(e) => onUpdateAction(idx, "executable", e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. C:\Games\Titolo\game.exe"
                  />
                  <button
                    type="button"
                    onClick={() => onPickExe(idx)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/10 transition-colors shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    title="Sfoglia file eseguibile (.exe)..."
                  >
                    <FolderOpen className="w-4 h-4 text-emerald-400" />
                    <span>Sfoglia...</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-slate-300">
                  Working Directory (Cartella di lavoro)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={action.working_dir || ""}
                    onChange={(e) => onUpdateAction(idx, "working_dir", e.target.value || null)}
                    className="flex-1 px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. C:\Games\Titolo"
                  />
                  <button
                    type="button"
                    onClick={() => onPickDir(idx)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium hover:bg-white/10 transition-colors shrink-0"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    title="Seleziona cartella dal computer..."
                  >
                    <Folder className="w-4 h-4 text-sky-400" />
                    <span>Cartella...</span>
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-300">
                Argomenti CLI (separati da spazio)
              </label>
              <input
                type="text"
                value={action.arguments.join(" ")}
                onChange={(e) =>
                  onUpdateAction(
                    idx,
                    "arguments",
                    e.target.value.split(" ").filter((s) => s.length > 0)
                  )
                }
                className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="es. -windowed -novid -fullscreen"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1 text-slate-300">
                Tracking Mode (Rilevamento Sessione)
              </label>
              <select
                value={action.tracking_mode?.type || "KernelJobObject"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "KernelJobObject") {
                    onUpdateAction(idx, "tracking_mode", { type: "KernelJobObject" });
                  } else if (val === "ProcessName") {
                    onUpdateAction(idx, "tracking_mode", {
                      type: "ProcessName",
                      target: "game.exe",
                    });
                  } else {
                    onUpdateAction(idx, "tracking_mode", {
                      type: "WatchDirectory",
                      target: ".",
                    });
                  }
                }}
                className="px-3 py-2 rounded-xl border text-xs font-medium outline-none cursor-pointer"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="KernelJobObject">Kernel Job Object (Zero CPU, Windows nativo)</option>
                <option value="ProcessName">Nome Processo Eseguibile</option>
                <option value="WatchDirectory">Cartella di Installazione</option>
              </select>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
