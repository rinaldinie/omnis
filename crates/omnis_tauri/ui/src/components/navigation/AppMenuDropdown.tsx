import React from "react";
import {
  Palette,
  PlusCircle,
  Sparkles,
  Volume2,
  VolumeX,
  Settings,
  FolderArchive,
} from "lucide-react";
import soundEffects from "../../utils/soundEffects";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

export interface AppMenuDropdownProps {
  trigger: React.ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenThemeModal: () => void;
  onOpenPluginModal: () => void;
  onOpenMetadataSettings?: () => void;
  onOpenAddCustomModal: () => void;
  onOpenBatchEnrichModal: () => void;
  onOpenPlayniteImport?: () => void;
  onOpenSettingsModal?: () => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
  hasActiveProviders?: boolean;
  isUpdateAvailable?: boolean;
  t?: (key: string, params?: Record<string, any>) => string;
}

export default function AppMenuDropdown({
  trigger,
  isOpen,
  onOpenChange,
  onOpenThemeModal,
  onOpenPluginModal,
  onOpenMetadataSettings,
  onOpenAddCustomModal,
  onOpenBatchEnrichModal,
  onOpenPlayniteImport,
  onOpenSettingsModal,
  onToggleSound,
  soundEnabled,
  hasActiveProviders = false,
  isUpdateAvailable = false,
  t,
}: AppMenuDropdownProps) {
  const closeMenu = () => onOpenChange(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={6}
        data-no-drag="true"
        aria-label="Omnis Application Menu"
        style={{
          backgroundColor: "var(--surface-overlay, var(--popover))",
          borderColor: "var(--border-subtle, var(--border))",
          boxShadow:
            "0 20px 40px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            onOpenThemeModal();
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Palette
              className="w-4 h-4 shrink-0"
              style={{ color: "var(--accent-primary)" }}
            />
            <span className="truncate">{t ? t("topbar.themes") : "Temi"}</span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            if (onOpenMetadataSettings) {
              onOpenMetadataSettings();
            } else {
              onOpenPluginModal();
            }
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="truncate">
              {t
                ? t("topbar.metadata_settings") || "Metadati & Provider"
                : "Metadati & Provider"}
            </span>
          </div>
          {hasActiveProviders && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0 ml-2"
              title="Provider attivi"
            />
          )}
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            onOpenAddCustomModal();
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <PlusCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">
              {t ? t("topbar.add_game") : "Aggiungi Gioco"}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            onOpenBatchEnrichModal();
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">
              {t ? t("topbar.enrich_button") : "Sincronizza Metadati Batch"}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            onOpenPlayniteImport?.();
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderArchive className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="truncate">
              {t
                ? t("topbar.playnite_import") || "Importa Backup Playnite..."
                : "Importa Backup Playnite..."}
            </span>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator
          style={{
            backgroundColor: "var(--border-subtle, rgba(255, 255, 255, 0.08))",
          }}
        />

        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            soundEffects.playSelect();
            onToggleSound();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="truncate">
              {t ? t("topbar.audio_ui") : "Effetti Audio"}
            </span>
          </div>
          <Badge
            variant={soundEnabled ? "success" : "secondary"}
            className="ml-2 rounded px-1.5 py-0.5 font-mono uppercase tracking-wider"
          >
            {soundEnabled
              ? t
                ? t("topbar.audio_on")
                : "ON"
              : t
              ? t("topbar.audio_off")
              : "OFF"}
          </Badge>
        </DropdownMenuItem>

        <DropdownMenuSeparator
          style={{
            backgroundColor: "var(--border-subtle, rgba(255, 255, 255, 0.08))",
          }}
        />

        <DropdownMenuItem
          onSelect={() => {
            soundEffects.playSelect();
            onOpenSettingsModal?.();
            closeMenu();
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="truncate">
              {t ? t("topbar.settings") || "Impostazioni" : "Impostazioni"}
            </span>
          </div>
          {isUpdateAvailable && (
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0 ml-2" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
