import React from 'react';
import { Search, X, ChevronDown, ChevronRight } from 'lucide-react';
import { SettingsTab, TreeGroup } from './settingsTreeConfig';

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
  currentVersion = '1.0',
}) => {
  return (
    <div
      className="w-64 sm:w-72 shrink-0 border-r flex flex-col bg-black/20"
      style={{ borderColor: 'var(--border-color)' }}
    >
      {/* Quick Search Input */}
      <div className="p-3 border-b border-white/5 shrink-0">
        <div
          className="relative flex items-center rounded-xl border px-2.5 py-1.5 transition-all focus-within:border-[var(--accent-primary)] focus-within:ring-1 focus-within:ring-[var(--accent-primary)]"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-color)',
          }}
        >
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca impostazioni..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-slate-400 hover:text-white p-0.5"
              title="Cancella ricerca"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Tree Navigation List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3 custom-scrollbar">
        {filteredGroups.length === 0 ? (
          <div className="py-8 px-4 text-center">
            <p className="text-xs text-slate-400">Nessuna opzione trovata</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-2 text-xs font-semibold hover:underline cursor-pointer"
              style={{ color: 'var(--accent-primary)' }}
            >
              Azzera filtro
            </button>
          </div>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded =
              searchQuery.trim().length > 0 || expandedGroups[group.id] !== false;

            return (
              <div key={group.id} className="space-y-1">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    {group.icon('w-3.5 h-3.5 text-slate-400')}
                    <span>{group.label}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  )}
                </button>

                {/* Sub-items (Tree Leaves) */}
                {isExpanded && (
                  <div className="space-y-0.5 pl-2">
                    {group.items.map((item) => {
                      const isSelected = activeTab === item.id;

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectTab(item.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none text-left ${
                            isSelected
                              ? 'text-white shadow-sm font-bold'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                          }`}
                          style={{
                            backgroundColor: isSelected
                              ? 'var(--accent-primary)'
                              : 'transparent',
                          }}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            {item.icon(
                              `w-3.5 h-3.5 shrink-0 ${
                                isSelected ? 'text-white' : 'text-slate-400'
                              }`
                            )}
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge && <div className="ml-2 shrink-0">{item.badge}</div>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer info */}
      <div
        className="p-3 border-t text-[11px] text-slate-500 flex items-center justify-between bg-black/10 shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span>Omnis Settings Engine</span>
        <span>v{currentVersion}</span>
      </div>
    </div>
  );
};
