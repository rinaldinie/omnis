import React from "react";
import { Calendar, Star } from "lucide-react";
import { GameEditorFormData, COMPLETION_STATUSES } from "./types";

interface GeneralTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ formData, onChange }) => {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            Titolo Gioco *
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => onChange({ title: e.target.value })}
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
            onChange={(e) => onChange({ sorting_title: e.target.value })}
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
            onChange={(e) => onChange({ series: e.target.value })}
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
            onChange={(e) => onChange({ age_rating: e.target.value })}
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
            onChange={(e) => onChange({ completion_status: e.target.value })}
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
              onChange={(e) => onChange({ release_date: e.target.value })}
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
                onChange({
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
              onChange({
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
              onChange({
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
            onChange={(e) => onChange({ genresText: e.target.value })}
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
              onChange={(e) => onChange({ developersText: e.target.value })}
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
              onChange={(e) => onChange({ publishersText: e.target.value })}
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
            onChange={(e) => onChange({ tagsText: e.target.value })}
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
  );
};
