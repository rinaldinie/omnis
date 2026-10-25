import React from "react";
import { Plus, Trash2, ExternalLink, Link as LinkIcon } from "lucide-react";
import { CustomLink } from "./types";
import { useTranslation } from "../../i18n";

interface CustomLinksTabProps {
  customLinks: CustomLink[];
  onAddLink: () => void;
  onRemoveLink: (index: number) => void;
  onUpdateLink: (index: number, key: keyof CustomLink, value: string) => void;
}

export const CustomLinksTab: React.FC<CustomLinksTabProps> = ({
  customLinks,
  onAddLink,
  onRemoveLink,
  onUpdateLink,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-normal text-slate-400">
          {t("editor_links.intro")}
        </span>
        <button
          type="button"
          onClick={onAddLink}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-white transition-all shadow-md"
          style={{
            backgroundColor: "var(--accent-primary)",
          }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("editor_links.add")}</span>
        </button>
      </div>

      {customLinks.length === 0 ? (
        <div
          className="p-10 rounded-2xl border border-dashed text-center space-y-3"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <LinkIcon className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-white">{t("editor_links.empty_title")}</p>
          <p className="text-xs text-slate-400">
            {t("editor_links.empty_desc")}
          </p>
        </div>
      ) : (
        customLinks.map((link, idx) => (
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
                onChange={(e) => onUpdateLink(idx, "title", e.target.value)}
                className="w-full px-3 py-2 rounded-xl border text-xs font-medium outline-none"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder={t("editor_links.name_placeholder")}
              />
            </div>

            <div className="flex-1">
              <input
                type="text"
                value={link.url}
                onChange={(e) => onUpdateLink(idx, "url", e.target.value)}
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
                title={t("editor_links.open_title")}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}

            <button
              type="button"
              onClick={() => onRemoveLink(idx)}
              className="p-2 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
              title={t("editor_links.remove_title")}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
};
