import React from "react";
import { useTranslation } from "../../i18n";
import { Settings, X } from "lucide-react";
import { useUpdater } from "../../hooks/useAppUpdater";
import {
  SettingsTab,
  useSettingsNavigation,
  SettingsSidebar,
  SettingsContentPanel,
} from "./tree";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";

export type { SettingsTab };

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenThemes: () => void;
  currentThemeName: string;
  initialTab?: SettingsTab;
  onSyncComplete?: () => void;
  onOpenPlayniteImport?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
  initialTab = "general",
  onSyncComplete,
  onOpenPlayniteImport,
}) => {
  const { t } = useTranslation();
  const updater = useUpdater();

  const {
    activeTab,
    searchQuery,
    setSearchQuery,
    expandedGroups,
    toggleGroup,
    handleSelectTab,
    handleClose,
    filteredGroups,
    activeGroup,
    activeItem,
  } = useSettingsNavigation({
    isOpen,
    initialTab,
    onSyncComplete,
    onClose,
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="backdrop-blur-md"
        className="max-w-5xl rounded-3xl h-[780px] max-h-[92vh] p-0 flex flex-col overflow-hidden gap-0"
        onEscapeKeyDown={(e) => {
          if (searchQuery.trim().length > 0) {
            e.preventDefault();
            setSearchQuery("");
          }
        }}
      >
        {/* MODAL TOP HEADER */}
        <DialogHeader className="flex-row justify-between items-center px-6 py-4 border-b border-border shrink-0 bg-black/25 space-y-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-border bg-card shadow-md shrink-0">
              <Settings
                className="w-5 h-5"
                style={{ color: "var(--accent-primary)" }}
              />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-black text-foreground">
                {t("settings_modal.title")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 truncate">
                {t("settings_modal.subtitle")}
              </DialogDescription>
            </div>
          </div>
          <ActionTooltip label={t("common.close", { defaultValue: "Close (Esc)" })}>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleClose}
              className="rounded-full text-muted-foreground hover:text-foreground shrink-0"
              aria-label={t("common.close", { defaultValue: "Close" })}
            >
              <X className="w-4 h-4" />
            </Button>
          </ActionTooltip>
        </DialogHeader>

        {/* MASTER-DETAIL BODY */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          <SettingsSidebar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredGroups={filteredGroups}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            currentVersion={updater?.currentVersion || "1.0"}
          />

          {/* RIGHT DETAIL CONTENT PANEL */}
          <div className="flex-1 min-w-0 flex flex-col bg-transparent overflow-hidden">
            {/* Top Breadcrumb Bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0 bg-black/15">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">
                  {activeGroup?.label}
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-foreground font-bold flex items-center gap-1.5">
                  <span style={{ color: "var(--accent-primary)" }}>
                    {activeItem?.icon("w-3.5 h-3.5")}
                  </span>
                  {activeItem?.label}
                </span>
              </div>
            </div>

            <SettingsContentPanel
              activeTab={activeTab}
              handleClose={handleClose}
              onSyncComplete={onSyncComplete}
              soundEnabled={soundEnabled}
              onToggleSound={onToggleSound}
              onOpenThemes={onOpenThemes}
              currentThemeName={currentThemeName}
              onOpenPlayniteImport={onOpenPlayniteImport}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsModal;
