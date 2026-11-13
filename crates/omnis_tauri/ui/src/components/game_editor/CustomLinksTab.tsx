import React from "react";
import { Plus, Trash2, ExternalLink, Link as LinkIcon } from "lucide-react";
import { CustomLink } from "./types";
import { useTranslation } from "../../i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";

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
        <Button type="button" size="sm" onClick={onAddLink} className="font-medium">
          <Plus className="w-3.5 h-3.5" />
          <span>{t("editor_links.add")}</span>
        </Button>
      </div>

      {customLinks.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-border bg-card text-center space-y-3">
          <LinkIcon className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-medium text-foreground">
            {t("editor_links.empty_title")}
          </p>
          <p className="text-xs text-slate-400">
            {t("editor_links.empty_desc")}
          </p>
        </div>
      ) : (
        customLinks.map((link, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl border border-border bg-card flex items-center gap-3"
          >
            <div className="w-1/3">
              <Input
                type="text"
                value={link.title}
                onChange={(e) => onUpdateLink(idx, "title", e.target.value)}
                className="h-9 bg-popover text-xs font-medium"
                placeholder={t("editor_links.name_placeholder")}
              />
            </div>

            <div className="flex-1">
              <Input
                type="text"
                value={link.url}
                onChange={(e) => onUpdateLink(idx, "url", e.target.value)}
                className="h-9 bg-popover text-xs font-mono"
                placeholder="https://..."
              />
            </div>

            {link.url && link.url.startsWith("http") && (
              <ActionTooltip label={t("editor_links.open_title")}>
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="rounded-xl"
                  aria-label={t("editor_links.open_title")}
                >
                  <a href={link.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </ActionTooltip>
            )}

            <ActionTooltip label={t("editor_links.remove_title")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemoveLink(idx)}
                className="rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                aria-label={t("editor_links.remove_title")}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </ActionTooltip>
          </div>
        ))
      )}
    </div>
  );
};
