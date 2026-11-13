import React from "react";
import {
  Database,
  Image,
  Award,
  Clock,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { useTranslation } from "../../i18n";
import {
  MetadataSubTab,
  useMetadataSettingsManager,
  IgdbSection,
  SteamGridDbSection,
  OpenCriticSection,
  HltbSection,
  PipelineSection,
} from "./metadata";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export type { MetadataSubTab };

export interface MetadataSettingsTabProps {
  activeSubTab: MetadataSubTab;
  onClose?: () => void;
  onSyncComplete?: () => void;
  hideTabBar?: boolean;
  onSelectSubTab?: (tab: MetadataSubTab) => void;
}

export const MetadataSettingsTab: React.FC<MetadataSettingsTabProps> = ({
  activeSubTab,
  onClose: _onClose,
  onSyncComplete: _onSyncComplete,
  hideTabBar = true,
  onSelectSubTab,
}) => {
  const { t } = useTranslation();

  const {
    providers,
    pipelineConfig,
    setPipelineConfig,
    settingsValues,
    showSecret,
    toggleShowSecret,
    testStatus,
    isSaving,
    isSavingPipeline,
    banner,
    getProvider,
    handleSettingChange,
    handleToggle,
    handleSaveSettings,
    handleTestConnection,
    handleSavePipeline,
    handleMovePriority,
    handleToggleField,
    handleMoveFieldSource,
    handleAddFieldSource,
    handleRemoveFieldSource,
    handleApplyPreset,
  } = useMetadataSettingsManager();

  return (
    <ScrollArea className="flex-1 text-white">
      <div className="p-6 md:p-8 space-y-6">
      {/* Optional Top Sub-tab Bar if not controlled by modal tree */}
      {!hideTabBar && (
        <div
          className="flex items-center gap-2 pb-4 border-b overflow-x-auto"
          style={{ borderColor: "var(--border-color)" }}
        >
          {[
            { id: "igdb" as MetadataSubTab, label: "IGDB", icon: Database },
            { id: "steamgriddb" as MetadataSubTab, label: "SteamGridDB", icon: Image },
            { id: "opencritic" as MetadataSubTab, label: "OpenCritic", icon: Award },
            { id: "hltb" as MetadataSubTab, label: "HowLongToBeat", icon: Clock },
            {
              id: "pipeline" as MetadataSubTab,
              label: t("metadata_settings.tab_pipeline", { defaultValue: "Pipeline & Priorities" }),
              icon: SlidersHorizontal,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSel = activeSubTab === tab.id;
            return (
              <Button
                key={tab.id}
                type="button"
                variant={isSel ? "default" : "ghost"}
                onClick={() => onSelectSubTab?.(tab.id)}
                className={`px-3.5 py-2 h-auto font-bold whitespace-nowrap ${
                  isSel ? "shadow-md" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </Button>
            );
          })}
        </div>
      )}

      {/* BANNER NOTIFICATION */}
      {banner && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 animate-fade-in ${
            banner.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : banner.type === "error"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
              : "bg-blue-500/10 border-blue-500/30 text-blue-300"
          }`}
        >
          {banner.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : banner.type === "error" ? (
            <AlertCircle className="w-5 h-5 shrink-0" />
          ) : (
            <Info className="w-5 h-5 shrink-0" />
          )}
          <span className="text-xs font-semibold">{banner.message}</span>
        </div>
      )}

      {/* 1. IGDB */}
      {activeSubTab === "igdb" && (
        <IgdbSection
          provider={getProvider("igdb")}
          settings={settingsValues["igdb"] || {}}
          showSecret={showSecret["igdb"] || false}
          onToggleSecret={() => toggleShowSecret("igdb")}
          onSettingChange={(key, val) => handleSettingChange("igdb", key, val)}
          onToggleEnabled={(enabled) => handleToggle("igdb", enabled)}
          onSave={() => handleSaveSettings("igdb")}
          onTest={() => handleTestConnection("igdb")}
          isSaving={isSaving["igdb"] || false}
          testStatus={testStatus["igdb"]}
        />
      )}

      {/* 2. STEAMGRIDDB */}
      {activeSubTab === "steamgriddb" && (
        <SteamGridDbSection
          provider={getProvider("steamgriddb")}
          settings={settingsValues["steamgriddb"] || {}}
          showSecret={showSecret["steamgriddb"] || false}
          onToggleSecret={() => toggleShowSecret("steamgriddb")}
          onSettingChange={(key, val) => handleSettingChange("steamgriddb", key, val)}
          onToggleEnabled={(enabled) => handleToggle("steamgriddb", enabled)}
          onSave={() => handleSaveSettings("steamgriddb")}
          onTest={() => handleTestConnection("steamgriddb")}
          isSaving={isSaving["steamgriddb"] || false}
          testStatus={testStatus["steamgriddb"]}
        />
      )}

      {/* 3. OPENCRITIC */}
      {activeSubTab === "opencritic" && (
        <OpenCriticSection
          provider={getProvider("opencritic")}
          onToggleEnabled={(enabled) => handleToggle("opencritic", enabled)}
          onSave={() => handleSaveSettings("opencritic")}
          isSaving={isSaving["opencritic"] || false}
        />
      )}

      {/* 4. HOWLONGTOBEAT */}
      {activeSubTab === "hltb" && (
        <HltbSection
          provider={getProvider("hltb")}
          onToggleEnabled={(enabled) => handleToggle("howlongtobeat", enabled)}
          onSave={() => handleSaveSettings("howlongtobeat")}
          onTest={() => handleTestConnection("howlongtobeat")}
          isSaving={isSaving["howlongtobeat"] || false}
          testStatus={testStatus["howlongtobeat"] || testStatus["hltb"]}
        />
      )}

      {/* 5. PRIORITÀ & REGOLE PIPELINE */}
      {activeSubTab === "pipeline" && (
        <PipelineSection
          pipelineConfig={pipelineConfig}
          setPipelineConfig={setPipelineConfig}
          providers={providers}
          onMovePriority={handleMovePriority}
          onSavePipeline={handleSavePipeline}
          isSaving={isSavingPipeline}
          onToggleField={handleToggleField}
          onMoveFieldSource={handleMoveFieldSource}
          onAddFieldSource={handleAddFieldSource}
          onRemoveFieldSource={handleRemoveFieldSource}
          onApplyPreset={handleApplyPreset}
        />
      )}
      </div>
    </ScrollArea>
  );
};

export default MetadataSettingsTab;
