import React from "react";
import { Layers, Library, Database, Puzzle } from "lucide-react";
import { ProviderInfo } from "../../../types";
import { useTranslation } from "../../../i18n";
import { PluginCategory } from "./constants";

export interface ProvidersTabProps {
  categoryFilter: PluginCategory;
  setCategoryFilter: (filter: PluginCategory) => void;
  libraryList: ProviderInfo[];
  metadataList: ProviderInfo[];
  genericList: ProviderInfo[];
  allCount: number;
  renderPluginCard: (prov: ProviderInfo) => React.ReactNode;
  onNavigateToMarketplace: () => void;
}

export const ProvidersTab: React.FC<ProvidersTabProps> = ({
  categoryFilter,
  setCategoryFilter,
  libraryList,
  metadataList,
  genericList,
  allCount,
  renderPluginCard,
  onNavigateToMarketplace,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 pb-2 border-b border-white/5">
        <button
          type="button"
          onClick={() => setCategoryFilter("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryFilter === "all"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t("plugin_manager.filter_all", { count: allCount })}</span>
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("libraries")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryFilter === "libraries"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Library className="w-3.5 h-3.5" />
          <span>{t("plugin_manager.libraries", { count: libraryList.length })}</span>
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("metadata")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryFilter === "metadata"
              ? "bg-purple-600 text-white shadow-md shadow-purple-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>{t("plugin_manager.metadata_sources", { count: metadataList.length })}</span>
        </button>
        <button
          type="button"
          onClick={() => setCategoryFilter("generic")}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            categoryFilter === "generic"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Puzzle className="w-3.5 h-3.5" />
          <span>{t("plugin_manager.generic_short", { count: genericList.length })}</span>
        </button>
      </div>

      {/* SECTIONS RENDERING */}
      {(categoryFilter === "all" || categoryFilter === "libraries") && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Library className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-blue-300">
              {t("plugin_manager.libraries", { count: libraryList.length })}
            </h4>
          </div>
          <div className="space-y-2.5">
            {libraryList.map(renderPluginCard)}
          </div>
        </div>
      )}

      {(categoryFilter === "all" || categoryFilter === "metadata") && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2 px-1">
            <Database className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-purple-300">
              {t("plugin_manager.metadata_sources", { count: metadataList.length })}
            </h4>
          </div>
          <div className="space-y-2.5">
            {metadataList.map(renderPluginCard)}
          </div>
        </div>
      )}

      {(categoryFilter === "all" || categoryFilter === "generic") && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2 px-1">
            <Puzzle className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300">
              {t("plugin_manager.generic_section", { count: genericList.length })}
            </h4>
          </div>
          {genericList.length > 0 ? (
            <div className="space-y-2.5">
              {genericList.map(renderPluginCard)}
            </div>
          ) : (
            <div
              className="p-6 rounded-2xl border text-center space-y-2"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <Puzzle className="w-7 h-7 text-slate-500 mx-auto" />
              <p className="text-xs font-bold text-slate-400">
                {t("plugin_manager.no_generic")}
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                {t("plugin_manager.no_generic_hint")}
              </p>
              <div className="pt-2 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={onNavigateToMarketplace}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white shadow-md transition-all"
                  style={{ backgroundColor: "var(--accent-primary)" }}
                >
                  {t("plugin_manager.explore_hub")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
