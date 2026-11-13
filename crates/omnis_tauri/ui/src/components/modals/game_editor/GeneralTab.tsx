import React from "react";
import { Calendar, Star } from "lucide-react";
import { GameEditorFormData, COMPLETION_STATUSES } from "./types";
import { useTranslation } from "../../../i18n";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.title_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.sorting_title")}
          </label>
          <Input
            type="text"
            value={formData.sorting_title}
            onChange={(e) => onChange({ sorting_title: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.sorting_title_placeholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.series")}
          </label>
          <Input
            type="text"
            value={formData.series}
            onChange={(e) => onChange({ series: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.series_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.age_rating")}
          </label>
          <Input
            type="text"
            value={formData.age_rating}
            onChange={(e) => onChange({ age_rating: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.age_rating_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.completion")}
          </label>
          <Select
            value={formData.completion_status || undefined}
            onValueChange={(value) => onChange({ completion_status: value })}
          >
            <SelectTrigger className="w-full h-10 px-3.5 py-2.5 text-sm font-normal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPLETION_STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {t(`completion_status.${status.key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.release_date")}
          </label>
          <div className="relative">
            <Input
              type="text"
              value={formData.release_date}
              onChange={(e) => onChange({ release_date: e.target.value })}
              className="h-10 px-3.5 py-2.5 pl-9"
              placeholder={t("editor_general.release_date_placeholder")}
            />
            <Calendar className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.user_score")}
          </label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max="100"
              value={formData.user_score ?? ""}
              onChange={(e) =>
                onChange({
                  user_score:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="h-10 px-3.5 py-2.5 pl-9 font-medium text-emerald-400"
              placeholder={t("editor_general.none")}
            />
            <Star className="w-4 h-4 absolute left-3 top-3 text-emerald-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.critic_score")}
          </label>
          <Input
            type="number"
            min="0"
            max="100"
            value={formData.critic_score ?? ""}
            onChange={(e) =>
              onChange({
                critic_score:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-10 px-3.5 py-2.5 font-medium text-amber-300"
            placeholder={t("editor_general.critic_placeholder")}
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.community_score")}
          </label>
          <Input
            type="number"
            min="0"
            max="100"
            value={formData.community_score ?? ""}
            onChange={(e) =>
              onChange({
                community_score:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
            className="h-10 px-3.5 py-2.5 font-medium text-sky-400"
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
          <Input
            type="text"
            value={formData.genresText}
            onChange={(e) => onChange({ genresText: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.genres_placeholder")}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("editor_general.developers")}
            </label>
            <Input
              type="text"
              value={formData.developersText}
              onChange={(e) => onChange({ developersText: e.target.value })}
              className="h-10 px-3.5 py-2.5"
              placeholder={t("editor_general.company_placeholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5 text-slate-300">
              {t("editor_general.publishers")}
            </label>
            <Input
              type="text"
              value={formData.publishersText}
              onChange={(e) => onChange({ publishersText: e.target.value })}
              className="h-10 px-3.5 py-2.5"
              placeholder={t("editor_general.company_placeholder")}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-slate-300">
            {t("editor_general.tags")}
          </label>
          <Input
            type="text"
            value={formData.tagsText}
            onChange={(e) => onChange({ tagsText: e.target.value })}
            className="h-10 px-3.5 py-2.5"
            placeholder={t("editor_general.tags_placeholder")}
          />
        </div>
      </div>
    </div>
  );
};
