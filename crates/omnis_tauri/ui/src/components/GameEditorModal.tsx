import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  Sliders,
  FileText,
  Image as ImageIcon,
  Terminal,
  Link as LinkIcon,
  Plus,
  Trash2,
  ExternalLink,
  Calendar,
  Star,
  Tag,
  Check,
  AlertCircle,
  Loader2,
  Gamepad2,
  FolderOpen,
  Folder,
} from "lucide-react";

export interface CustomLink {
  title: string;
  url: string;
}

export type ProcessTrackingMode =
  | { type: "KernelJobObject" }
  | { type: "ProcessName"; target: string }
  | { type: "WatchDirectory"; target: string };

export interface LaunchConfiguration {
  executable: string;
  arguments: string[];
  working_dir?: string | null;
  tracking_mode: ProcessTrackingMode;
}

export interface GameEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: any;
  onSave: (updated: any) => void;
}

const COMPLETION_STATUSES = [
  { value: "NotPlayed", label: "Non giocato", color: "#94a3b8" },
  { value: "Playing", label: "In corso", color: "#38bdf8" },
  { value: "Beaten", label: "Finito", color: "#a855f7" },
  { value: "Completed", label: "Completato al 100%", color: "#22c55e" },
  { value: "Abandoned", label: "Abbandonato", color: "#ef4444" },
  { value: "Backlog", label: "Backlog", color: "#f59e0b" },
  { value: "PlanToPlay", label: "Da iniziare", color: "#6366f1" },
];

async function callTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>(cmd, args);
    }
  } catch (err) {
    console.warn(`Tauri command '${cmd}' failed:`, err);
    throw err;
  }
  return null;
}

export default function GameEditorModal({
  isOpen,
  onClose,
  game,
  onSave,
}: GameEditorModalProps) {
  const [activeTab, setActiveTab] = useState<
    "general" | "description" | "media" | "actions" | "links"
  >("general");

  const [formData, setFormData] = useState({
    title: "",
    sorting_title: "",
    series: "",
    age_rating: "",
    completion_status: "NotPlayed",
    release_date: "",
    user_score: null as number | null,
    critic_score: null as number | null,
    community_score: null as number | null,
    genresText: "",
    developersText: "",
    publishersText: "",
    tagsText: "",
    description: "",
    user_notes: "",
    cover_image_path: "",
    background_image_path: "",
    icon_image_path: "",
    play_actions: [] as LaunchConfiguration[],
    custom_links: [] as CustomLink[],
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Initialize or fetch detailed game properties on open
  useEffect(() => {
    if (!isOpen || !game) return;

    setSaveError(null);
    setSaveSuccess(false);

    const initFromGame = (g: any) => {
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
        description: g.description || "",
        user_notes: g.user_notes || "",
        cover_image_path: g.cover_image_path || g.cover_image || "",
        background_image_path: g.background_image_path || g.background_image || "",
        icon_image_path: g.icon_image_path || "",
        play_actions: Array.isArray(g.play_actions) ? g.play_actions : [],
        custom_links: Array.isArray(g.custom_links) ? g.custom_links : [],
      });
    };

    initFromGame(game);

    // If game is partial (GameDto), load full record from database
    callTauri<any>("get_game", { gameId: game.id })
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

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setSaveError(null);

      const parseCsv = (txt: string) =>
        txt
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

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
        genres: parseCsv(formData.genresText),
        developers: parseCsv(formData.developersText),
        publishers: parseCsv(formData.publishersText),
        tags: parseCsv(formData.tagsText),
        cover_image_path: formData.cover_image_path.trim() || null,
        background_image_path: formData.background_image_path.trim() || null,
        icon_image_path: formData.icon_image_path.trim() || null,
        play_actions: formData.play_actions,
        custom_links: formData.custom_links,
      };

      const result = await callTauri<any>("update_game_metadata", { gameUpdate });
      const updated = result || { ...game, ...gameUpdate };

      setSaveSuccess(true);
      setTimeout(() => {
        onSave(updated);
        onClose();
      }, 400);
    } catch (err: any) {
      setSaveError(typeof err === "string" ? err : err.message || "Errore salvataggio metadati");
    } finally {
      setIsSaving(false);
    }
  };

  // Play Actions helpers
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

  // Custom Links helpers
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

  const handlePickExe = async (actionIdx: number) => {
    try {
      const path = await callTauri<string>("pick_executable_file");
      if (path) {
        handleUpdateAction(actionIdx, "executable", path);
        const currentAction = formData.play_actions[actionIdx];
        if (!currentAction?.working_dir) {
          const sep = path.includes("\\") ? "\\" : "/";
          const lastIdx = path.lastIndexOf(sep);
          if (lastIdx > 0) {
            handleUpdateAction(actionIdx, "working_dir", path.substring(0, lastIdx));
          }
        }
      }
    } catch (err) {
      console.warn("Failed to pick executable:", err);
    }
  };

  const handlePickDir = async (actionIdx: number) => {
    try {
      const dir = await callTauri<string>("pick_directory");
      if (dir) {
        handleUpdateAction(actionIdx, "working_dir", dir);
      }
    } catch (err) {
      console.warn("Failed to pick directory:", err);
    }
  };

  const handlePickImage = async (field: "cover_image_path" | "background_image_path" | "icon_image_path") => {
    try {
      const path = await callTauri<string>("pick_image_file");
      if (path) {
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
                Modifica Scheda Gioco
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
            <span>Generale</span>
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
            <span>Descrizione & Note</span>
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
            <span>Media</span>
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
            <span>Azioni di Avvio ({formData.play_actions.length})</span>
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
            <span>Collegamenti ({formData.custom_links.length})</span>
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: GENERALE */}
          {activeTab === "general" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Titolo Gioco *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. Cyberpunk 2077"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Titolo Ordinamento (Sorting Title)
                  </label>
                  <input
                    type="text"
                    value={formData.sorting_title}
                    onChange={(e) => setFormData({ ...formData, sorting_title: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. cyberpunk 2077"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Serie / Franchise
                  </label>
                  <input
                    type="text"
                    value={formData.series}
                    onChange={(e) => setFormData({ ...formData, series: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. The Witcher, Half-Life"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Classificazione Età (Rating)
                  </label>
                  <input
                    type="text"
                    value={formData.age_rating}
                    onChange={(e) => setFormData({ ...formData, age_rating: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="es. PEGI 18, ESRB M"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Stato Completamento
                  </label>
                  <select
                    value={formData.completion_status}
                    onChange={(e) => setFormData({ ...formData, completion_status: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 outline-none cursor-pointer"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {COMPLETION_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Data di Rilascio
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.release_date}
                      onChange={(e) => setFormData({ ...formData, release_date: e.target.value })}
                      className="w-full px-3.5 py-2.5 pl-9 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="es. 10 Dic 2020"
                    />
                    <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Voto Utente (0-100)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.user_score ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          user_score: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      className="w-full px-3.5 py-2.5 pl-9 rounded-xl border text-sm font-medium text-emerald-400 outline-none"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                      }}
                      placeholder="Nessuno"
                    />
                    <Star className="w-4 h-4 absolute left-3 top-3 text-emerald-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Voto Critica (Metacritic)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.critic_score ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        critic_score: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium text-amber-300 outline-none"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                    placeholder="es. 86"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Voto Community (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.community_score ?? ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        community_score: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-medium text-sky-400 outline-none"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                    placeholder="es. 92"
                  />
                </div>
              </div>

              {/* Categorization & Metadata tags */}
              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Generi (separati da virgola)
                  </label>
                  <input
                    type="text"
                    value={formData.genresText}
                    onChange={(e) => setFormData({ ...formData, genresText: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="Azione, GDR, Open World, Cyberpunk"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-slate-300">
                      Sviluppatori (separati da virgola)
                    </label>
                    <input
                      type="text"
                      value={formData.developersText}
                      onChange={(e) => setFormData({ ...formData, developersText: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="es. CD PROJEKT RED"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1.5 text-slate-300">
                      Editori / Publishers (separati da virgola)
                    </label>
                    <input
                      type="text"
                      value={formData.publishersText}
                      onChange={(e) => setFormData({ ...formData, publishersText: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        borderColor: "var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      placeholder="es. CD PROJEKT RED"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1.5 text-slate-300">
                    Tag Personali (separati da virgola)
                  </label>
                  <input
                    type="text"
                    value={formData.tagsText}
                    onChange={(e) => setFormData({ ...formData, tagsText: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-sm font-normal text-slate-100 placeholder:text-slate-500 outline-none"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    placeholder="Preferiti, Da Finire, Capolavoro, RayTracing"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DESCRIZIONE & NOTE */}
          {activeTab === "description" && (
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Sinossi / Descrizione Ufficiale
                </label>
                <textarea
                  rows={8}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Inserisci qui la sinossi o descrizione del gioco..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5 text-slate-300">
                  Note Personali (Playnite Parity)
                </label>
                <textarea
                  rows={5}
                  value={formData.user_notes}
                  onChange={(e) => setFormData({ ...formData, user_notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border text-sm font-normal leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="Appunti sul gameplay, build usata, promemoria salvataggi o trucchi..."
                />
              </div>
            </div>
          )}

          {/* TAB 3: MEDIA */}
          {activeTab === "media" && (
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
                      onClick={() => setFormData({ ...formData, cover_image_path: "" })}
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
                        onChange={(e) => setFormData({ ...formData, cover_image_path: e.target.value })}
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
                        onClick={() => handlePickImage("cover_image_path")}
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
                      onClick={() => setFormData({ ...formData, background_image_path: "" })}
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
                        Nessuno Sfondo Panoramico
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.background_image_path}
                      onChange={(e) => setFormData({ ...formData, background_image_path: e.target.value })}
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
                      onClick={() => handlePickImage("background_image_path")}
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
                      onChange={(e) => setFormData({ ...formData, icon_image_path: e.target.value })}
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
                      onClick={() => handlePickImage("icon_image_path")}
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
          )}

          {/* TAB 4: AZIONI DI AVVIO (PLAY ACTIONS) */}
          {activeTab === "actions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-normal text-slate-400">
                  Configura gli eseguibili, parametri di lancio e modalità di monitoraggio del gioco.
                </span>
                <button
                  type="button"
                  onClick={handleAddAction}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white transition-all shadow-md"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Aggiungi Azione</span>
                </button>
              </div>

              {formData.play_actions.length === 0 ? (
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
                formData.play_actions.map((action, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl border space-y-4 shadow-sm"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-color)" }}>
                      <span className="text-xs font-medium text-indigo-400">
                        Azione #{idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAction(idx)}
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
                            onChange={(e) => handleUpdateAction(idx, "executable", e.target.value)}
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
                            onClick={() => handlePickExe(idx)}
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
                            onChange={(e) => handleUpdateAction(idx, "working_dir", e.target.value || null)}
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
                            onClick={() => handlePickDir(idx)}
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
                          handleUpdateAction(
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
                            handleUpdateAction(idx, "tracking_mode", { type: "KernelJobObject" });
                          } else if (val === "ProcessName") {
                            handleUpdateAction(idx, "tracking_mode", {
                              type: "ProcessName",
                              target: "game.exe",
                            });
                          } else {
                            handleUpdateAction(idx, "tracking_mode", {
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
          )}

          {/* TAB 5: COLLEGAMENTI (CUSTOM LINKS) */}
          {activeTab === "links" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2">
                <span className="text-xs font-normal text-slate-400">
                  Aggiungi link a wiki, forum, pagine di mod o guide ufficiali per questo gioco.
                </span>
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white transition-all shadow-md"
                  style={{
                    backgroundColor: "var(--accent-primary)",
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Aggiungi Link</span>
                </button>
              </div>

              {formData.custom_links.length === 0 ? (
                <div
                  className="p-10 rounded-2xl border border-dashed text-center space-y-3"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <LinkIcon className="w-10 h-10 text-slate-500 mx-auto" />
                  <p className="text-sm font-medium text-white">Nessun collegamento personalizzato</p>
                  <p className="text-xs text-slate-400">
                    Fai click su "Aggiungi Link" per salvare siti web e guide utili.
                  </p>
                </div>
              ) : (
                formData.custom_links.map((link, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border flex items-center gap-3"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                    }}
                  >
                    <div className="w-1/3">
                      <input
                        type="text"
                        value={link.title}
                        onChange={(e) => handleUpdateLink(idx, "title", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                        placeholder="Nome Link (es. Wiki Fandom)"
                      />
                    </div>

                    <div className="flex-1">
                      <input
                        type="text"
                        value={link.url}
                        onChange={(e) => handleUpdateLink(idx, "url", e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border text-xs font-mono outline-none"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                        placeholder="https://..."
                      />
                    </div>

                    {link.url && link.url.startsWith("http") && (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10"
                        title="Apri nel browser predefinito"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      title="Rimuovi questo link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
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
            <span>Modifiche salvate con successo nel database!</span>
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
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl border text-xs font-medium text-slate-300 hover:bg-white/5 transition-all"
            style={{
              borderColor: "var(--border-color)",
            }}
          >
            Annulla
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !formData.title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-medium text-white shadow-xl transition-all transform active:scale-95 disabled:opacity-50"
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
            <span>{isSaving ? "Salvataggio..." : "Salva Modifiche"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
