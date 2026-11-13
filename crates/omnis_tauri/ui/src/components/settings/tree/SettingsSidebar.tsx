import React from "react";
import { Search, X, ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "../../../i18n/i18nContext";
import { SettingsTab, TreeGroup } from "./settingsTreeConfig";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionTooltip } from "@/components/ui/tooltip";

export interface SettingsSidebarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredGroups: TreeGroup[];
  expandedGroups: Record<string, boolean>;
  toggleGroup: (groupId: string) => void;
  activeTab: SettingsTab;
  onSelectTab: (tabId: SettingsTab) => void;
  currentVersion?: string;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  searchQuery,
  setSearchQuery,
  filteredGroups,
  expandedGroups,
  toggleGroup,
  activeTab,
  onSelectTab,
  currentVersion = "1.0",
}) => {
  const { t } = useTranslation();

  return (
    <div className="w-64 sm:w-72 shrink-0 border-r border-border flex flex-col bg-black/20">
      {/* Quick Search Input */}
      <div className="p-3 border-b border-white/5 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 absolute left-3 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("settings_modal.search_placeholder", {
              defaultValue: "Search settings...",
            })}
            className="h-8 pl-8 pr-7 text-xs bg-card"
          />
          {searchQuery && (
            <ActionTooltip label={t("common.clear", { defaultValue: "Clear" })}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                className="absolute right-1 h-6 w-6 text-slate-400 hover:text-white"
                aria-label={t("common.clear", { defaultValue: "Clear" })}
              >
                <X className="w-3 h-3" />
              </Button>
            </ActionTooltip>
          )}
        </div>
      </div>

      {/* Tree Navigation List */}
      <ScrollArea className="flex-1" viewportClassName="p-2.5 space-y-3">
        {filteredGroups.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <p className="text-xs text-slate-400">
              {t("settings_modal.no_results", {
                defaultValue: "No settings found",
              })}
            </p>
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => setSearchQuery("")}
              className="mt-2 font-semibold"
            >
              {t("settings_modal.reset_filter", {
                defaultValue: "Reset filter",
              })}
            </Button>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded =
              searchQuery.trim().length > 0 ||
              expandedGroups[group.id] !== false;

            return (
              <div key={group.id} className="space-y-1">
                {/* Category Header */}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleGroup(group.id)}
                  className="h-auto w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-white/5 select-none"
                >
                  <div className="flex items-center gap-2">
                    {group.icon("w-3.5 h-3.5 text-slate-400")}
                    <span>{group.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </Button>

                {/* Sub-items (Tree Leaves) */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-2">
                    {group.items.map((item) => {
                      const isSelected = activeTab === item.id;

                      return (
                        <Button
                          key={item.id}
                          type="button"
                          variant="ghost"
                          onClick={() => onSelectTab(item.id)}
                          className={`h-auto w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold select-none text-left ${
                            isSelected
                              ? "text-white shadow-sm font-bold hover:text-white"
                              : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? "var(--accent-primary)"
                              : "transparent",
                          }}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            {item.icon(
                              `w-3.5 h-3.5 shrink-0 ${
                                isSelected ? "text-white" : "text-slate-400"
                              }`
                            )}
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge && (
                            <div className="ml-2 shrink-0">{item.badge}</div>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </ScrollArea>

      {/* Sidebar Footer info */}
      <div className="p-3 border-t border-border text-[11px] text-slate-500 flex items-center justify-between bg-black/10 shrink-0">
        <span>Omnis Settings Engine</span>
        <span>v{currentVersion}</span>
      </div>
    </div>
  );
};
