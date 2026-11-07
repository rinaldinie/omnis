import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Check,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Plus,
  EyeOff,
  HardDrive,
  SlidersHorizontal,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import soundEffects from '../../utils/soundEffects';
import { api } from '../../api';
import type { DuplicateHiderConfig, DuplicateHiderStats, GameDto } from '../../types';
import { SettingGroup, SettingRow, ToggleSwitch } from './SettingsControls';
import { StoreIcon } from '../StoreBadge';

export type DuplicateHiderSubTab = 'priorities' | 'rules' | 'ignored';

export interface DuplicateHiderSettingsTabProps {
  activeSubTab?: DuplicateHiderSubTab;
  onSyncComplete?: () => void;
  onClose?: () => void;
  hideSubTabBar?: boolean;
}

const DEFAULT_STORE_PRIORITY = ['steam', 'gog', 'epic', 'xbox', 'custom'];

const DEFAULT_CONFIG: DuplicateHiderConfig = {
  enabled: true,
  store_priority: DEFAULT_STORE_PRIORITY,
  prefer_installed: true,
  ignore_edition_suffixes: true,
  show_other_copies_in_menu: true,
  show_store_badges_on_card: true,
  ignored_game_ids: [],
};

export const DH_BADGES_STORAGE_KEY = 'omnis_dh_badges_on_card';
export const DH_COPIES_MENU_STORAGE_KEY = 'omnis_dh_copies_in_menu';

function syncLocalStorageFlags(cfg: DuplicateHiderConfig) {
  try {
    localStorage.setItem(DH_BADGES_STORAGE_KEY, JSON.stringify(cfg.show_store_badges_on_card));
    localStorage.setItem(DH_COPIES_MENU_STORAGE_KEY, JSON.stringify(cfg.show_other_copies_in_menu));
  } catch (e) {
    console.warn('Failed to cache DuplicateHider flags in localStorage:', e);
  }
}

function normalizeStorePriority(list?: string[]): string[] {
  const existing = Array.isArray(list) && list.length > 0 ? [...list] : [...DEFAULT_STORE_PRIORITY];
  for (const store of DEFAULT_STORE_PRIORITY) {
    if (!existing.includes(store)) {
      existing.push(store);
    }
  }
  return existing;
}

export const DuplicateHiderSettingsTab: React.FC<DuplicateHiderSettingsTabProps> = ({
  activeSubTab: controlledSubTab,
  onSyncComplete,
  onClose,
  hideSubTabBar = true,
}) => {
  const { t } = useTranslation();
  const [internalSubTab, setInternalSubTab] = useState<DuplicateHiderSubTab>('priorities');
  const activeSubTab = controlledSubTab ?? internalSubTab;

  const [config, setConfig] = useState<DuplicateHiderConfig>(DEFAULT_CONFIG);
  const [games, setGames] = useState<GameDto[]>([]);
  const [stats, setStats] = useState<DuplicateHiderStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applying, setApplying] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [ignoreSearchQuery, setIgnoreSearchQuery] = useState<string>('');

  const getStoreDisplayName = useCallback(
    (storeId: string): string => {
      const s = storeId.toLowerCase();
      if (s === 'steam') return 'Steam';
      if (s === 'gog') return 'GOG Galaxy';
      if (s === 'epic') return 'Epic Games Store';
      if (s === 'xbox') return 'Xbox / PC Game Pass';
      if (s === 'custom') {
        return t('duplicate_hider.store_custom', { defaultValue: 'Giochi Personalizzati (Custom)' });
      }
      return storeId.toUpperCase();
    },
    [t]
  );

  // Load config and games on mount
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.games.getDuplicateHiderConfig().catch(() => DEFAULT_CONFIG),
      api.games.getGames().catch(() => [] as GameDto[]),
    ])
      .then(([loadedCfg, loadedGames]) => {
        if (!isMounted) return;
        const normalized: DuplicateHiderConfig = {
          ...DEFAULT_CONFIG,
          ...loadedCfg,
          store_priority: normalizeStorePriority(loadedCfg?.store_priority),
          ignored_game_ids: Array.isArray(loadedCfg?.ignored_game_ids)
            ? loadedCfg.ignored_game_ids
            : [],
        };
        setConfig(normalized);
        syncLocalStorageFlags(normalized);

        const gamesList = Array.isArray(loadedGames) ? loadedGames : [];
        setGames(gamesList);

        // Compute initial summary from loaded games
        const groupIds = new Set<string>();
        let hiddenDups = 0;
        gamesList.forEach((g) => {
          if (g.duplicate_group_id) {
            groupIds.add(g.duplicate_group_id);
          }
          if (g.hidden_by_duplicate_hider) {
            hiddenDups++;
          }
        });
        setStats({
          total_groups: groupIds.size,
          hidden_duplicates: hiddenDups,
        });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const persistConfig = useCallback(
    async (nextConfig: DuplicateHiderConfig, showToast = false) => {
      setConfig(nextConfig);
      syncLocalStorageFlags(nextConfig);
      try {
        const resultStats = await api.games.saveDuplicateHiderConfig(nextConfig);
        if (resultStats) {
          setStats(resultStats);
        }
        onSyncComplete?.();
        if (showToast) {
          setSavedSuccess(true);
          setTimeout(() => setSavedSuccess(false), 2500);
        }
      } catch (err) {
        console.warn('Failed to save DuplicateHider config:', err);
      }
    },
    [onSyncComplete]
  );

  const handleApplyNow = async () => {
    soundEffects.playSelect();
    setApplying(true);
    try {
      await api.games.saveDuplicateHiderConfig(config);
      const resultStats = await api.games.applyDuplicateHider();
      if (resultStats) {
        setStats(resultStats);
      }
      const refreshedGames = await api.games.getGames().catch(() => games);
      if (Array.isArray(refreshedGames)) {
        setGames(refreshedGames);
      }
      onSyncComplete?.();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err) {
      console.warn('Failed to apply DuplicateHider:', err);
    } finally {
      setApplying(false);
    }
  };

  const handleMoveStore = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= config.store_priority.length) return;
    soundEffects.playNav();
    const nextPriority = [...config.store_priority];
    const [moved] = nextPriority.splice(index, 1);
    nextPriority.splice(nextIndex, 0, moved);
    const nextConfig = { ...config, store_priority: nextPriority };
    persistConfig(nextConfig, false);
  };

  const handleAddIgnoredGame = (gameId: string) => {
    if (config.ignored_game_ids.includes(gameId)) return;
    soundEffects.playSelect();
    const nextConfig: DuplicateHiderConfig = {
      ...config,
      ignored_game_ids: [...config.ignored_game_ids, gameId],
    };
    persistConfig(nextConfig, false);
  };

  const handleRemoveIgnoredGame = (gameId: string) => {
    soundEffects.playSelect();
    const nextConfig: DuplicateHiderConfig = {
      ...config,
      ignored_game_ids: config.ignored_game_ids.filter((id) => id !== gameId),
    };
    persistConfig(nextConfig, false);
  };

  const handleReset = () => {
    soundEffects.playSelect();
    persistConfig(DEFAULT_CONFIG, true);
  };

  const ignoredGamesList = useMemo(() => {
    const idSet = new Set(config.ignored_game_ids);
    return games.filter((g) => idSet.has(g.id));
  }, [games, config.ignored_game_ids]);

  const candidateGamesForIgnore = useMemo(() => {
    const q = ignoreSearchQuery.trim().toLowerCase();
    const idSet = new Set(config.ignored_game_ids);
    const available = games.filter((g) => !idSet.has(g.id));
    if (!q) {
      // Prioritize games that belong to a duplicate group when query is empty
      return available
        .filter((g) => Boolean(g.duplicate_group_id))
        .slice(0, 8);
    }
    return available
      .filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.library.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [games, config.ignored_game_ids, ignoreSearchQuery]);

  return (
    <div className="flex-1 flex flex-col min-h-0 select-none">
      {!hideSubTabBar && (
        <div
          className="flex items-center gap-1 border-b px-6 py-2.5 bg-black/20 shrink-0 overflow-x-auto"
          style={{ borderColor: 'var(--border-color)' }}
        >
          {(
            [
              {
                id: 'priorities' as const,
                label: t('duplicate_hider.tab_priorities', {
                  defaultValue: 'Priorità Store & Stato',
                }),
              },
              {
                id: 'rules' as const,
                label: t('duplicate_hider.tab_rules', {
                  defaultValue: 'Regole & Visualizzazione',
                }),
              },
              {
                id: 'ignored' as const,
                label: t('duplicate_hider.tab_ignored', {
                  defaultValue: 'Giochi Esclusi',
                }),
              },
            ]
          ).map((tab) => {
            const isSelected = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundEffects.playNav();
                  setInternalSubTab(tab.id);
                }}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
                  isSelected ? 'shadow-xs' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                        color: 'var(--accent-primary)',
                      }
                    : undefined
                }
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
        {/* SUBTAB 1: PRIORITIES & STATUS */}
        {activeSubTab === 'priorities' && (
          <div className="space-y-5">
            <SettingGroup
              title={t('duplicate_hider.status_group_title', {
                defaultValue: 'Stato Duplicate Hider',
              })}
              description={t('duplicate_hider.status_group_desc', {
                defaultValue:
                  'Raggruppa automaticamente le copie multiple dello stesso gioco su store diversi e mostra solo la copia principale.',
              })}
              icon={<Layers className="w-4 h-4" />}
              action={
                stats && (
                  <div className="flex items-center gap-2">
                    <span
                      className="px-2.5 py-1 rounded-full text-[11px] font-bold border flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                        borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      <Layers className="w-3 h-3" />
                      <span>
                        {t('duplicate_hider.stats_badge', {
                          groups: stats.total_groups,
                          hidden: stats.hidden_duplicates,
                          defaultValue: `${stats.total_groups} gruppi · ${stats.hidden_duplicates} copie nascoste`,
                        })}
                      </span>
                    </span>
                  </div>
                )
              }
            >
              <SettingRow
                icon={<Sparkles className="w-4 h-4" />}
                title={t('duplicate_hider.enable_auto', {
                  defaultValue: 'Abilita Duplicate Hider automatico',
                })}
                description={t('duplicate_hider.enable_auto_desc', {
                  defaultValue:
                    'Nasconde automaticamente le copie secondarie durante la sincronizzazione della libreria.',
                })}
              >
                <ToggleSwitch
                  checked={config.enabled}
                  onChange={(next) => {
                    soundEffects.playSelect();
                    persistConfig({ ...config, enabled: next });
                  }}
                  ariaLabel={t('duplicate_hider.enable_auto', {
                    defaultValue: 'Abilita Duplicate Hider automatico',
                  })}
                />
              </SettingRow>

              <SettingRow
                icon={<HardDrive className="w-4 h-4" />}
                title={t('duplicate_hider.prefer_installed', {
                  defaultValue: 'Dai priorità alle copie installate rispetto alla classifica store',
                })}
                description={t('duplicate_hider.prefer_installed_desc', {
                  defaultValue:
                    'Se una copia è installata localmente, verrà scelta come principale anche se appartiene a uno store con priorità inferiore.',
                })}
              >
                <ToggleSwitch
                  checked={config.prefer_installed}
                  onChange={(next) => {
                    soundEffects.playSelect();
                    persistConfig({ ...config, prefer_installed: next });
                  }}
                  ariaLabel={t('duplicate_hider.prefer_installed', {
                    defaultValue: 'Dai priorità alle copie installate rispetto alla classifica store',
                  })}
                />
              </SettingRow>

              <SettingRow
                icon={<RefreshCw className={`w-4 h-4 ${applying ? 'animate-spin' : ''}`} />}
                title={t('duplicate_hider.apply_now_title', {
                  defaultValue: 'Ricalcola duplicati della libreria',
                })}
                description={t('duplicate_hider.apply_now_desc', {
                  defaultValue:
                    'Applica immediatamente le regole di priorità attuali a tutti i titoli presenti nel catalogo.',
                })}
              >
                <button
                  type="button"
                  disabled={applying || loading}
                  onClick={handleApplyNow}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    boxShadow: '0 4px 14px var(--accent-glow)',
                  }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${applying ? 'animate-spin' : ''}`} />
                  <span>
                    {applying
                      ? t('duplicate_hider.applying', { defaultValue: 'Applicazione...' })
                      : t('duplicate_hider.apply_now', { defaultValue: 'Applica ora' })}
                  </span>
                </button>
              </SettingRow>
            </SettingGroup>

            {/* Reorderable Store Priority List */}
            <SettingGroup
              title={t('duplicate_hider.store_priority_title', {
                defaultValue: 'Classifica Priorità Store',
              })}
              description={t('duplicate_hider.store_priority_desc', {
                defaultValue:
                  'Ordina le piattaforme dalla preferita (#1) alla meno prioritaria. A parità di stato di installazione, verrà mostrata la copia dello store più in alto.',
              })}
              icon={<SlidersHorizontal className="w-4 h-4" />}
            >
              {config.store_priority.map((storeId, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === config.store_priority.length - 1;
                return (
                  <div
                    key={storeId}
                    className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-7 h-6 rounded-lg text-[11px] font-mono font-black flex items-center justify-center border shrink-0"
                        style={
                          idx === 0
                            ? {
                                backgroundColor:
                                  'color-mix(in srgb, var(--accent-primary) 18%, transparent)',
                                borderColor:
                                  'color-mix(in srgb, var(--accent-primary) 40%, transparent)',
                                color: 'var(--accent-primary)',
                              }
                            : {
                                backgroundColor: 'rgba(255,255,255,0.04)',
                                borderColor: 'rgba(255,255,255,0.08)',
                                color: '#94a3b8',
                              }
                        }
                      >
                        #{idx + 1}
                      </span>

                      <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-200 shrink-0">
                        <StoreIcon library={storeId} className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100">
                            {getStoreDisplayName(storeId)}
                          </span>
                          {idx === 0 && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold border"
                              style={{
                                backgroundColor:
                                  'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                                borderColor:
                                  'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                                color: 'var(--accent-primary)',
                              }}
                            >
                              {t('duplicate_hider.top_priority', {
                                defaultValue: 'Priorità Massima',
                              })}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono uppercase">
                          ID: {storeId}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => handleMoveStore(idx, -1)}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                        title={t('plugin_manager.move_up', { defaultValue: 'Sposta su' })}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => handleMoveStore(idx, 1)}
                        className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
                        title={t('plugin_manager.move_down', { defaultValue: 'Sposta giù' })}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </SettingGroup>
          </div>
        )}

        {/* SUBTAB 2: DETECTION RULES & UI */}
        {activeSubTab === 'rules' && (
          <div className="space-y-5">
            <SettingGroup
              title={t('duplicate_hider.rules_group_title', {
                defaultValue: 'Regole di Rilevamento & Normalizzazione',
              })}
              description={t('duplicate_hider.rules_group_desc', {
                defaultValue:
                  'Configura come Omnis confronta i titoli tra negozi diversi per individuare le copie duplicate.',
              })}
              icon={<SlidersHorizontal className="w-4 h-4" />}
            >
              <SettingRow
                icon={<Sparkles className="w-4 h-4" />}
                title={t('duplicate_hider.ignore_edition_suffixes', {
                  defaultValue:
                    'Ignora suffissi di edizione nei titoli (es. GOTY, Definitive, Ultimate Edition)',
                })}
                description={t('duplicate_hider.ignore_edition_suffixes_desc', {
                  defaultValue:
                    'Unisce titoli come "The Witcher 3" e "The Witcher 3: Game of the Year Edition" nello stesso gruppo di duplicati.',
                })}
              >
                <ToggleSwitch
                  checked={config.ignore_edition_suffixes}
                  onChange={(next) => {
                    soundEffects.playSelect();
                    persistConfig({ ...config, ignore_edition_suffixes: next });
                  }}
                  ariaLabel={t('duplicate_hider.ignore_edition_suffixes', {
                    defaultValue:
                      'Ignora suffissi di edizione nei titoli (es. GOTY, Definitive, Ultimate Edition)',
                  })}
                />
              </SettingRow>
            </SettingGroup>

            <SettingGroup
              title={t('duplicate_hider.ui_group_title', {
                defaultValue: 'Integrazione Interfaccia & Libreria',
              })}
              description={t('duplicate_hider.ui_group_desc', {
                defaultValue:
                  'Scegli come mostrare le copie alternative sulle card della griglia e nei menu contestuali.',
              })}
              icon={<Layers className="w-4 h-4" />}
            >
              <SettingRow
                icon={<Layers className="w-4 h-4" />}
                title={t('duplicate_hider.show_store_badges_on_card', {
                  defaultValue:
                    'Mostra i badge degli store alternativi sulle card della libreria',
                })}
                description={t('duplicate_hider.show_store_badges_on_card_desc', {
                  defaultValue:
                    'Visualizza le icone di tutti gli store posseduti direttamente sulla locandina del gioco principale.',
                })}
              >
                <ToggleSwitch
                  checked={config.show_store_badges_on_card}
                  onChange={(next) => {
                    soundEffects.playSelect();
                    persistConfig({ ...config, show_store_badges_on_card: next });
                  }}
                  ariaLabel={t('duplicate_hider.show_store_badges_on_card', {
                    defaultValue:
                      'Mostra i badge degli store alternativi sulle card della libreria',
                  })}
                />
              </SettingRow>

              <SettingRow
                icon={<SlidersHorizontal className="w-4 h-4" />}
                title={t('duplicate_hider.show_other_copies_in_menu', {
                  defaultValue: "Mostra il sottomenu 'Altre copie' nel menu contestuale",
                })}
                description={t('duplicate_hider.show_other_copies_in_menu_desc', {
                  defaultValue:
                    'Permette di avviare una copia secondaria o promuoverla a principale con il tasto destro.',
                })}
              >
                <ToggleSwitch
                  checked={config.show_other_copies_in_menu}
                  onChange={(next) => {
                    soundEffects.playSelect();
                    persistConfig({ ...config, show_other_copies_in_menu: next });
                  }}
                  ariaLabel={t('duplicate_hider.show_other_copies_in_menu', {
                    defaultValue: "Mostra il sottomenu 'Altre copie' nel menu contestuale",
                  })}
                />
              </SettingRow>
            </SettingGroup>

            <div
              className="p-3.5 rounded-2xl border flex items-start gap-3 text-xs"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                borderColor: 'color-mix(in srgb, var(--accent-primary) 20%, transparent)',
                color: 'var(--text-primary)',
              }}
            >
              <Info
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: 'var(--accent-primary)' }}
              />
              <div className="leading-relaxed text-slate-300">
                {t('duplicate_hider.rules_info_note', {
                  defaultValue:
                    'Le statistiche della vista Dettagli e i conteggi della libreria continuano a preservare tutte le tue copie; puoi visualizzare i giochi nascosti in qualsiasi momento dal filtro "Nascosti".',
                })}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: IGNORED / EXCLUDED GAMES */}
        {activeSubTab === 'ignored' && (
          <div className="space-y-5">
            {/* Search & Add Game to Exclude */}
            <SettingGroup
              title={t('duplicate_hider.ignored_add_title', {
                defaultValue: 'Aggiungi Gioco alle Esclusioni',
              })}
              description={t('duplicate_hider.ignored_add_desc', {
                defaultValue:
                  'I giochi esclusi non verranno mai nascosti né accorpati dal Duplicate Hider automatico.',
              })}
              icon={<Plus className="w-4 h-4" />}
            >
              <div className="p-3.5 space-y-3">
                <div
                  className="relative flex items-center rounded-xl border px-3 py-2"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                  }}
                >
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-2.5" />
                  <input
                    type="text"
                    value={ignoreSearchQuery}
                    onChange={(e) => setIgnoreSearchQuery(e.target.value)}
                    placeholder={t('duplicate_hider.ignored_search_placeholder', {
                      defaultValue: 'Cerca un gioco nella libreria da escludere...',
                    })}
                    className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>

                {candidateGamesForIgnore.length > 0 && (
                  <div className="rounded-xl border border-white/[0.06] bg-black/20 divide-y divide-white/[0.04] max-h-48 overflow-y-auto custom-scrollbar">
                    {candidateGamesForIgnore.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between px-3 py-2 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <StoreIcon library={g.library} className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          <span className="text-xs font-medium text-slate-200 truncate">
                            {g.title}
                          </span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400 shrink-0">
                            {g.library}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddIgnoredGame(g.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                          <span>
                            {t('duplicate_hider.exclude_btn', { defaultValue: 'Escludi' })}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SettingGroup>

            {/* Currently Excluded Games List */}
            <SettingGroup
              title={t('duplicate_hider.ignored_list_title', {
                defaultValue: 'Giochi Attualmente Esclusi',
              })}
              description={t('duplicate_hider.ignored_list_desc', {
                defaultValue:
                  'Elenco delle copie che rimangono sempre visibili indipendentemente dalle regole dei duplicati.',
              })}
              icon={<EyeOff className="w-4 h-4" />}
            >
              {ignoredGamesList.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <p className="text-xs font-semibold text-slate-300">
                    {t('duplicate_hider.ignored_empty', {
                      defaultValue: 'Nessun gioco escluso dal Duplicate Hider.',
                    })}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {t('duplicate_hider.ignored_empty_hint', {
                      defaultValue:
                        'Usa la barra di ricerca qui sopra per aggiungere un titolo alla lista di esclusione.',
                    })}
                  </p>
                </div>
              ) : (
                ignoredGamesList.map((g) => (
                  <SettingRow
                    key={g.id}
                    icon={<StoreIcon library={g.library} className="w-4 h-4" />}
                    title={g.title}
                    description={`${getStoreDisplayName(g.library)} · ${g.playtime_formatted}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleRemoveIgnoredGame(g.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {t('duplicate_hider.remove_exclusion', {
                          defaultValue: 'Rimuovi esclusione',
                        })}
                      </span>
                    </button>
                  </SettingRow>
                ))
              )}
            </SettingGroup>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        className="flex items-center justify-between px-6 py-4 border-t bg-black/40 shrink-0"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{t('general_settings.reset_defaults', { defaultValue: 'Ripristina predefiniti' })}</span>
        </button>

        <div className="flex items-center gap-3">
          {savedSuccess && (
            <span
              className="flex items-center gap-1.5 text-xs font-bold animate-in fade-in duration-200"
              style={{ color: 'var(--accent-primary)' }}
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('general_settings.saved', { defaultValue: 'Salvato!' })}</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              soundEffects.playSelect();
              persistConfig(config, true);
            }}
            className="px-6 py-2 rounded-xl text-xs font-bold text-white shadow-md hover:brightness-110 active:opacity-90 flex items-center gap-2 cursor-pointer"
            style={{
              backgroundColor: 'var(--accent-primary)',
              boxShadow: '0 4px 14px var(--accent-glow)',
            }}
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('common.save', { defaultValue: 'Salva' })}</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl text-xs font-bold border hover:bg-white/10 transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              {t('common.cancel', { defaultValue: 'Annulla' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DuplicateHiderSettingsTab;
