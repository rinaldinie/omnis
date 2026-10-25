import React from "react";
import { Calendar, Star } from "lucide-react";
import { GameEditorFormData, COMPLETION_STATUSES } from "./types";
import { useTranslation } from "../../i18n";

interface GeneralTabProps {
  formData: GameEditorFormData;
  onChange: (fields: Partial<GameEditorFormData>) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ formData, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.title")} *
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
            placeholder={t("editor_general.title_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.sorting_title")}
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
            placeholder={t("editor_general.sorting_title_placeholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.series")}
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
            placeholder={t("editor_general.series_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.age_rating")}
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
            placeholder={t("editor_general.age_rating_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.completion")}
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
                {t(`completion_status.${status.key}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.release_date")}
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
              placeholder={t("editor_general.release_date_placeholder")}
            />
            <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.user_score")}
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
              placeholder={t("editor_general.none")}
            />
            <Star className="w-4 h-4 absolute left-3 top-3 text-emerald-400" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.critic_score")}
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
            placeholder={t("editor_general.critic_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.community_score")}
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
            placeholder={t("editor_general.community_placeholder")}
          />
        </div>
      </div>

      {/* Categorization & Metadata tags */}
      <div className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.genres")}
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
            placeholder={t("editor_general.genres_placeholder")}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("editor_general.developers")}
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
              placeholder={t("editor_general.company_placeholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("editor_general.publishers")}
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
              placeholder={t("editor_general.company_placeholder")}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.tags")}
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
            placeholder={t("editor_general.tags_placeholder")}
          />
        </div>
      </div>
    </div>
  );
};
