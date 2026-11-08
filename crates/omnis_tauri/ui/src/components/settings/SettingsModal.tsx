import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n';
import {
  Settings,
  Sliders,
  SlidersHorizontal,
  Cloud,
  Trophy,
  Archive,
  Globe,
  Volume2,
  Minimize2,
  Palette,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  FolderArchive,
  Eye,
  Sparkles,
  Trash2,
  X,
  Clock,
  RotateCcw,
  Layers,
  EyeOff,
  Database,
  Image as ImageIcon,
  Award,
} from 'lucide-react';
import { soundEffects } from '../../utils/soundEffects';
import { api, TAURI_EVENTS, listenTauri } from '../../api';
import { useUpdater } from '../../hooks/useAppUpdater';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { StoreAccountsTab, STORE_LIST } from './StoreAccountsTab';
import { MetadataSettingsTab } from './MetadataSettingsTab';
import { AchievementsSettingsTab } from '../achievements';
import { BackupSettingsTab } from './BackupSettingsTab';
import { DuplicateHiderSettingsTab } from './DuplicateHiderSettingsTab';
import type { StoreAccount } from '../store_accounts/types';
import type { ProviderInfo } from '../../types';

export type SettingsTab =
  | 'general'
  | 'accounts'
  | 'metadata'
  | 'achievements'
  | 'duplicates'
  | 'backup'
  // Specific sub-paths for direct deep-linking
  | 'general-language'
  | 'general-audio'
  | 'general-window'
  | 'general-appearance'
  | 'general-recent'
  | 'general-updates'
  | 'store-steam'
  | 'store-epic'
  | 'store-gog'
  | 'store-xbox'
  | 'store-amazon'
  | 'metadata-igdb'
  | 'metadata-steamgriddb'
  | 'metadata-opencritic'
  | 'metadata-hltb'
  | 'metadata-pipeline'
  | 'achievements-sources'
  | 'achievements-view'
  | 'achievements-appearance'
  | 'achievements-misc'
  | 'achievements-ignored'
  | 'duplicates-priorities'
  | 'duplicates-rules'
  | 'duplicates-ignored'
  | 'backup-manager'
  | 'backup-manual'
  | 'backup-schedule'
  | 'backup-restore'
  | 'backup-playnite';

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

interface TreeItem {
  id: SettingsTab;
  label: string;
  icon: (cls?: string) => React.ReactNode;
  badge?: React.ReactNode;
  keywords: string[];
}

interface TreeGroup {
  id: string;
  label: string;
  icon: (cls?: string) => React.ReactNode;
  items: TreeItem[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  soundEnabled,
  onToggleSound,
  onOpenThemes,
  currentThemeName,
  initialTab = 'general',
  onSyncComplete,
  onOpenPlayniteImport,
}) => {
  const { t } = useTranslation();
  const updater = useUpdater();

  // Helper to map macro-tabs to concrete leaf IDs
  const resolveTargetTab = (tab?: SettingsTab): SettingsTab => {
    if (!tab || tab === 'general') return 'general-language';
    if (tab === 'accounts') return 'store-steam';
    if (tab === 'metadata') return 'metadata-igdb';
    if (tab === 'achievements') return 'achievements-sources';
    if (tab === 'duplicates') return 'duplicates-priorities';
    if (tab === 'backup' || tab === 'backup-manager') return 'backup-manual';
    return tab;
  };

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => resolveTargetTab(initialTab));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [storeAccounts, setStoreAccounts] = useState<StoreAccount[]>([]);
  const [metadataProviders, setMetadataProviders] = useState<ProviderInfo[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Group accordion expansion state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    general: true,
    accounts: true,
    metadata: true,
    achievements: true,
    duplicates: true,
    backup: true,
  });

  // Load and subscribe to store account connection statuses and metadata providers for sidebar indicators
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    api.stores.getStoreAccounts().then((accs) => {
      if (isMounted && Array.isArray(accs)) {
        setStoreAccounts(accs);
      }
    }).catch(console.debug);

    api.metadata.getProviders().then((provs) => {
      if (isMounted && Array.isArray(provs)) {
        setMetadataProviders(provs);
      }
    }).catch(console.debug);

    let unlistenConnected: (() => void) | null = null;
    let unlistenDisconnected: (() => void) | null = null;

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_CONNECTED, () => {
      api.stores.getStoreAccounts().then((accs) => {
        if (isMounted && Array.isArray(accs)) setStoreAccounts(accs);
      }).catch(console.debug);
    }).then((fn) => { unlistenConnected = fn; });

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_DISCONNECTED, () => {
      api.stores.getStoreAccounts().then((accs) => {
        if (isMounted && Array.isArray(accs)) setStoreAccounts(accs);
      }).catch(console.debug);
    }).then((fn) => { unlistenDisconnected = fn; });

    return () => {
      isMounted = false;
      if (unlistenConnected) unlistenConnected();
      if (unlistenDisconnected) unlistenDisconnected();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(resolveTargetTab(initialTab));
      setSearchQuery('');
    }
  }, [isOpen, initialTab]);

  const handleClose = useCallback(() => {
    soundEffects.playSelect();
    if (onSyncComplete) onSyncComplete();
    onClose();
  }, [onSyncComplete, onClose]);

  // Handle ESC key for search clearing or modal closing
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (searchQuery.trim().length > 0) {
          setSearchQuery('');
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, searchQuery, handleClose]);

  // Define Tree Structure
  const treeGroups: TreeGroup[] = useMemo(() => {
    return [
      {
        id: 'general',
        label: t('settings_modal.tab_general', { defaultValue: 'Generale' }),
        icon: (c = 'w-4 h-4') => <Sliders className={c} />,
        items: [
          {
            id: 'general-language',
            label: t('general_settings.tab_language', { defaultValue: 'Lingua & Localizzazione' }),
            icon: (c = 'w-4 h-4') => <Globe className={c} />,
            keywords: ['lingua', 'language', 'locale', 'italiano', 'english', 'traduzione'],
          },
          {
            id: 'general-audio',
            label: t('general_settings.tab_audio', { defaultValue: 'Audio & Feedback' }),
            icon: (c = 'w-4 h-4') => <Volume2 className={c} />,
            keywords: ['audio', 'suoni', 'effetti', 'sound', 'volume', 'beeps', 'segnali'],
          },
          {
            id: 'general-window',
            label: t('general_settings.tab_window', { defaultValue: 'Finestra & Sistema' }),
            icon: (c = 'w-4 h-4') => <Minimize2 className={c} />,
            keywords: ['finestra', 'tray', 'riduci', 'avvio', 'scansione', 'sistema', 'close'],
          },
          {
            id: 'general-appearance',
            label: t('general_settings.tab_appearance', { defaultValue: 'Aspetto & Temi' }),
            icon: (c = 'w-4 h-4') => <Palette className={c} />,
            keywords: ['aspetto', 'temi', 'tema', 'colori', 'interfaccia', 'animazioni', 'dark', 'light'],
          },
          {
            id: 'general-recent',
            label: t('sidebar.recent', { defaultValue: 'Giochi Recenti' }),
            icon: (c = 'w-4 h-4') => <Clock className={c} />,
            keywords: ['recenti', 'recent', 'giochi recenti', 'tempo', 'slider', 'filtro', 'last played'],
          },
          {
            id: 'general-updates',
            label: t('general_settings.tab_updates', { defaultValue: 'Aggiornamenti' }),
            icon: (c = 'w-4 h-4') => <RefreshCw className={`${c} ${updater?.status === 'checking' ? 'animate-spin' : ''}`} />,
            badge: updater?.status === 'available' ? (
              <span
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: 'var(--accent-primary)' }}
                title="Nuovo aggiornamento disponibile"
              />
            ) : undefined,
            keywords: ['aggiornamenti', 'updates', 'versione', 'update', 'changelog', 'download'],
          },
        ],
      },
      {
        id: 'accounts',
        label: t('settings_modal.tab_accounts', { defaultValue: 'Store & Piattaforme' }),
        icon: (c = 'w-4 h-4') => <Cloud className={c} />,
        items: STORE_LIST.map((store) => {
          const acc = storeAccounts.find((a) => a.store_id === store.id);
          const isConnected = acc?.is_connected;
          return {
            id: `store-${store.id}` as SettingsTab,
            label: store.name,
            icon: (c = 'w-4 h-4') => store.icon(c),
            badge: (
              <span
                className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                  !isConnected ? 'bg-slate-600' : ''
                }`}
                style={
                  isConnected
                    ? {
                        backgroundColor: 'var(--accent-primary)',
                        boxShadow: '0 0 8px var(--accent-glow)',
                      }
                    : undefined
                }
                title={isConnected ? 'Connesso' : 'Non connesso'}
              />
            ),
            keywords: [store.name.toLowerCase(), store.id, 'store', 'account', 'sync', 'login', 'token', 'chiave'],
          };
        }),
      },
      {
        id: 'metadata',
        label: t('settings_modal.tab_metadata', { defaultValue: 'Metadati & Provider' }),
        icon: (c = 'w-4 h-4') => <Sparkles className={c} />,
        items: [
          {
            id: 'metadata-igdb',
            label: 'IGDB (Twitch)',
            icon: (c = 'w-4 h-4') => <Database className={c} />,
            badge: (() => {
              const p = metadataProviders.find((x) => x.id === 'igdb');
              const isConn = p?.is_enabled && p?.has_configured_key;
              const isDis = p && !p.is_enabled;
              return (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                    isDis ? 'bg-slate-700' : !isConn ? 'bg-amber-400' : ''
                  }`}
                  style={
                    isConn
                      ? {
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }
                      : undefined
                  }
                  title={isDis ? 'Disabilitato' : isConn ? 'Autenticato' : 'Credenziali richieste'}
                />
              );
            })(),
            keywords: ['igdb', 'twitch', 'metadati', 'copertine', 'sinossi', 'valutazioni'],
          },
          {
            id: 'metadata-steamgriddb',
            label: 'SteamGridDB',
            icon: (c = 'w-4 h-4') => <ImageIcon className={c} />,
            badge: (() => {
              const p = metadataProviders.find((x) => x.id === 'steamgriddb');
              const isConn = p?.is_enabled && p?.has_configured_key;
              const isDis = p && !p.is_enabled;
              return (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                    isDis ? 'bg-slate-700' : !isConn ? 'bg-amber-400' : ''
                  }`}
                  style={
                    isConn
                      ? {
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }
                      : undefined
                  }
                  title={isDis ? 'Disabilitato' : isConn ? 'Autenticato' : 'API Key richiesta'}
                />
              );
            })(),
            keywords: ['steamgriddb', 'sgdb', 'artwork', 'grid', 'hero', 'logo', 'banner'],
          },
          {
            id: 'metadata-opencritic',
            label: 'OpenCritic',
            icon: (c = 'w-4 h-4') => <Award className={c} />,
            badge: (() => {
              const p = metadataProviders.find((x) => x.id === 'opencritic');
              const isConn = p?.is_enabled && p?.has_configured_key;
              const isDis = p && !p.is_enabled;
              return (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                    isDis ? 'bg-slate-700' : !isConn ? 'bg-amber-400' : ''
                  }`}
                  style={
                    isConn
                      ? {
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }
                      : undefined
                  }
                  title={isDis ? 'Disabilitato' : isConn ? 'Autenticato' : 'RapidAPI Key richiesta'}
                />
              );
            })(),
            keywords: ['opencritic', 'voti', 'recensioni', 'score', 'rapidapi'],
          },
          {
            id: 'metadata-hltb',
            label: 'HowLongToBeat',
            icon: (c = 'w-4 h-4') => <Clock className={c} />,
            badge: (() => {
              const p = metadataProviders.find(
                (x) => x.id === 'howlongtobeat' || x.id === 'hltb'
              );
              const isEnabled = p?.is_enabled ?? true;
              return (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                    !isEnabled ? 'bg-slate-700' : ''
                  }`}
                  style={
                    isEnabled
                      ? {
                          backgroundColor: 'var(--accent-primary)',
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }
                      : undefined
                  }
                  title={isEnabled ? 'Attivo (Zero-Config)' : 'Disabilitato'}
                />
              );
            })(),
            keywords: ['howlongtobeat', 'hltb', 'durata', 'ore', 'completamento', 'playtime'],
          },
          {
            id: 'metadata-pipeline',
            label: t('metadata_settings.tab_pipeline', { defaultValue: 'Priorità Pipeline' }),
            icon: (c = 'w-4 h-4') => <SlidersHorizontal className={c} />,
            keywords: ['pipeline', 'priorità', 'regole', 'fonti', 'copertine', 'sfondi'],
          },
        ],
      },
      {
        id: 'achievements',
        label: t('settings_modal.tab_achievements', { defaultValue: 'Obiettivi (Achievements)' }),
        icon: (c = 'w-4 h-4') => <Trophy className={c} />,
        items: [
          {
            id: 'achievements-sources',
            label: t('achievements_settings.tab_sources', { defaultValue: 'Provider & Sorgenti' }),
            icon: (c = 'w-4 h-4') => <SlidersHorizontal className={c} />,
            keywords: ['fonti', 'sorgenti', 'provider', 'steam', 'gog', 'retroachievements', 'rpcs3', 'xbox'],
          },
          {
            id: 'achievements-view',
            label: t('achievements_settings.tab_view', { defaultValue: 'Visualizzazione & Badge' }),
            icon: (c = 'w-4 h-4') => <Eye className={c} />,
            keywords: ['badge', 'visualizzazione', 'view', 'barra', 'punti', 'dimensione', 'rarità'],
          },
          {
            id: 'achievements-appearance',
            label: t('achievements_settings.tab_appearance', { defaultValue: 'Rarità & Bagliori' }),
            icon: (c = 'w-4 h-4') => <Sparkles className={c} />,
            keywords: ['rarita', 'ultra rare', 'oro', 'bagliore', 'segreti', 'glow'],
          },
          {
            id: 'achievements-misc',
            label: t('achievements_settings.tab_misc', { defaultValue: 'Sync & Cache Avanzata' }),
            icon: (c = 'w-4 h-4') => <RefreshCw className={c} />,
            keywords: ['sync', 'cache', 'intervallo', 'sincronizzazione', 'icone', 'concorrenza'],
          },
          {
            id: 'achievements-ignored',
            label: t('achievements_settings.tab_ignored', { defaultValue: 'Titoli Ignorati' }),
            icon: (c = 'w-4 h-4') => <Trash2 className={c} />,
            keywords: ['ignorati', 'nascondi', 'whitelist', 'blacklist'],
          },
        ],
      },
      {
        id: 'duplicates',
        label: t('duplicate_hider.group_title', { defaultValue: 'Gestione Duplicati' }),
        icon: (c = 'w-4 h-4') => <Layers className={c} />,
        items: [
          {
            id: 'duplicates-priorities',
            label: t('duplicate_hider.tab_priorities', { defaultValue: 'Priorità Store & Stato' }),
            icon: (c = 'w-4 h-4') => <SlidersHorizontal className={c} />,
            keywords: ['duplicati', 'duplicate', 'hider', 'priorità', 'store', 'copie', 'installati'],
          },
          {
            id: 'duplicates-rules',
            label: t('duplicate_hider.tab_rules', { defaultValue: 'Regole & Visualizzazione' }),
            icon: (c = 'w-4 h-4') => <Eye className={c} />,
            keywords: ['duplicati', 'regole', 'goty', 'edizioni', 'badge', 'menu', 'altre copie'],
          },
          {
            id: 'duplicates-ignored',
            label: t('duplicate_hider.tab_ignored', { defaultValue: 'Giochi Esclusi' }),
            icon: (c = 'w-4 h-4') => <EyeOff className={c} />,
            keywords: ['duplicati', 'esclusi', 'ignorati', 'whitelist'],
          },
        ],
      },
      {
        id: 'backup',
        label: t('settings_modal.tab_backup', { defaultValue: 'Dati & Backup' }),
        icon: (c = 'w-4 h-4') => <Archive className={c} />,
        items: [
          {
            id: 'backup-manual',
            label: t('backup_settings.create_card_title', { defaultValue: 'Crea Backup (.zip)' }),
            icon: (c = 'w-4 h-4') => <Archive className={c} />,
            keywords: ['backup', 'crea', 'manuale', 'zip', 'salvataggio', 'export', 'archivio', 'database'],
          },
          {
            id: 'backup-schedule',
            label: t('backup_settings.schedule_card_title', { defaultValue: 'Backup Automatico & Schedulazione' }),
            icon: (c = 'w-4 h-4') => <Clock className={c} />,
            keywords: ['pianificazione', 'automatico', 'schedulazione', 'cron', 'frequenza', 'rotazione', 'orario'],
          },
          {
            id: 'backup-restore',
            label: t('backup_settings.restore_card_title', { defaultValue: 'Ripristina da File (.zip)' }),
            icon: (c = 'w-4 h-4') => <RotateCcw className={c} />,
            keywords: ['ripristina', 'restore', 'carica', 'recupera', 'sostituisci', 'importa', 'archivio'],
          },
          {
            id: 'backup-playnite',
            label: t('general_settings.playnite_card_title', { defaultValue: 'Importazione Playnite' }),
            icon: (c = 'w-4 h-4') => <FolderArchive className={c} />,
            keywords: ['playnite', 'importa', 'migrazione', 'libreria', 'zip'],
          },
        ],
      },
    ];
  }, [t, updater?.status, storeAccounts, metadataProviders]);

  // Filter groups and items based on search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return treeGroups;

    return treeGroups
      .map((group) => {
        const matchesGroupLabel = group.label.toLowerCase().includes(q);
        const filteredItems = group.items.filter((item) => {
          if (matchesGroupLabel) return true;
          if (item.label.toLowerCase().includes(q)) return true;
          return item.keywords.some((k) => k.toLowerCase().includes(q));
        });

        if (filteredItems.length === 0) return null;
        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((g): g is TreeGroup => g !== null);
  }, [treeGroups, searchQuery]);

  // Find currently active item and group for breadcrumb
  const { activeGroup, activeItem } = useMemo(() => {
    for (const group of treeGroups) {
      const found = group.items.find((item) => item.id === activeTab);
      if (found) {
        return { activeGroup: group, activeItem: found };
      }
    }
    return { activeGroup: treeGroups[0], activeItem: treeGroups[0].items[0] };
  }, [treeGroups, activeTab]);

  const handleSelectTab = (tabId: SettingsTab) => {
    soundEffects.playNav();
    setActiveTab(tabId);
  };

  const toggleGroup = (groupId: string) => {
    soundEffects.playNav();
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div
        className="relative max-w-5xl w-full rounded-3xl border shadow-2xl h-[780px] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* MODAL TOP HEADER */}
        <div
          className="flex justify-between items-center px-6 py-4 border-b shrink-0 bg-black/25"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center border shadow-md"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-color)',
              }}
            >
              <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">{t('settings_modal.title')}</h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {t('settings_modal.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full border flex items-center justify-center font-bold hover:bg-white/10 active:opacity-90 cursor-pointer transition-colors"
            style={{
              backgroundColor: 'var(--bg-card)',
              borderColor: 'var(--border-color)',
              color: 'var(--text-muted)',
            }}
            title="Chiudi (Esc)"
          >
            ✕
          </button>
        </div>

        {/* MASTER-DETAIL BODY */}
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
          {/* LEFT SIDEBAR: SEARCH & TREE NAVIGATION */}
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
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cerca impostazioni..."
                  className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
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
                  const isExpanded = searchQuery.trim().length > 0 || expandedGroups[group.id] !== false;

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
                                onClick={() => handleSelectTab(item.id)}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none text-left ${
                                  isSelected
                                    ? 'text-white shadow-sm font-bold'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                                }`}
                                style={{
                                  backgroundColor: isSelected ? 'var(--accent-primary)' : 'transparent',
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
              <span>v{updater?.currentVersion || '1.0'}</span>
            </div>
          </div>

          {/* RIGHT DETAIL CONTENT PANEL */}
          <div className="flex-1 min-w-0 flex flex-col bg-transparent overflow-hidden">
            {/* Top Breadcrumb Bar */}
            <div
              className="flex items-center justify-between px-6 py-3 border-b shrink-0 bg-black/15"
              style={{ borderColor: 'var(--border-color)' }}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">{activeGroup?.label}</span>
                <span className="text-slate-600">/</span>
                <span className="text-white font-bold flex items-center gap-1.5">
                  <span style={{ color: 'var(--accent-primary)' }}>
                    {activeItem?.icon('w-3.5 h-3.5')}
                  </span>
                  {activeItem?.label}
                </span>
              </div>
            </div>

            {/* Content Switcher */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {/* SECTION: GENERALE */}
              {activeTab.startsWith('general-') && (
                <GeneralSettingsTab
                  onClose={handleClose}
                  soundEnabled={soundEnabled}
                  onToggleSound={onToggleSound}
                  onOpenThemes={() => {
                    onClose();
                    onOpenThemes();
                  }}
                  currentThemeName={currentThemeName}
                  onOpenPlayniteImport={() => {
                    onClose();
                    onOpenPlayniteImport?.();
                  }}
                  activeSubTab={
                    activeTab === 'general-language'
                      ? 'language'
                      : activeTab === 'general-audio'
                      ? 'audio'
                      : activeTab === 'general-window'
                      ? 'window'
                      : activeTab === 'general-appearance'
                      ? 'appearance'
                      : activeTab === 'general-recent'
                      ? 'recent'
                      : activeTab === 'general-updates'
                      ? 'updates'
                      : 'language'
                  }
                  hideSubTabBar={true}
                />
              )}

              {/* SECTION: STORE & ACCOUNTS */}
              {activeTab.startsWith('store-') && (
                <StoreAccountsTab
                  onSyncComplete={onSyncComplete}
                  onClose={handleClose}
                  selectedStoreId={activeTab.replace('store-', '')}
                  hideTabBar={true}
                />
              )}

              {/* SECTION: METADATI & PROVIDER */}
              {activeTab.startsWith('metadata-') && (
                <MetadataSettingsTab
                  activeSubTab={
                    activeTab === 'metadata-igdb'
                      ? 'igdb'
                      : activeTab === 'metadata-steamgriddb'
                      ? 'steamgriddb'
                      : activeTab === 'metadata-opencritic'
                      ? 'opencritic'
                      : activeTab === 'metadata-hltb'
                      ? 'hltb'
                      : 'pipeline'
                  }
                  onClose={handleClose}
                  onSyncComplete={onSyncComplete}
                  hideTabBar={true}
                />
              )}

              {/* SECTION: OBIETTIVI (ACHIEVEMENTS) */}
              {activeTab.startsWith('achievements-') && (
                <AchievementsSettingsTab
                  onClose={handleClose}
                  activeSubTab={
                    activeTab === 'achievements-sources'
                      ? 'sources'
                      : activeTab === 'achievements-view'
                      ? 'view'
                      : activeTab === 'achievements-appearance'
                      ? 'appearance'
                      : activeTab === 'achievements-misc'
                      ? 'misc'
                      : activeTab === 'achievements-ignored'
                      ? 'ignored'
                      : 'sources'
                  }
                  hideTabBar={true}
                />
              )}

              {/* SECTION: GESTIONE DUPLICATI (DUPLICATE HIDER) */}
              {activeTab.startsWith('duplicates-') && (
                <DuplicateHiderSettingsTab
                  onClose={handleClose}
                  onSyncComplete={onSyncComplete}
                  activeSubTab={
                    activeTab === 'duplicates-priorities'
                      ? 'priorities'
                      : activeTab === 'duplicates-rules'
                      ? 'rules'
                      : activeTab === 'duplicates-ignored'
                      ? 'ignored'
                      : 'priorities'
                  }
                  hideSubTabBar={true}
                />
              )}

              {/* SECTION: DATI & BACKUP - CREA BACKUP MANUALE */}
              {activeTab === 'backup-manual' && (
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  <BackupSettingsTab
                    activeSection="manual"
                    onClose={handleClose}
                    onRestoreComplete={() => {
                      handleClose();
                      if (onSyncComplete) onSyncComplete();
                    }}
                  />
                </div>
              )}

              {/* SECTION: DATI & BACKUP - BACKUP AUTOMATICO & SCHEDULAZIONE */}
              {activeTab === 'backup-schedule' && (
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  <BackupSettingsTab
                    activeSection="schedule"
                    onClose={handleClose}
                    onRestoreComplete={() => {
                      handleClose();
                      if (onSyncComplete) onSyncComplete();
                    }}
                  />
                </div>
              )}

              {/* SECTION: DATI & BACKUP - RIPRISTINO */}
              {(activeTab === 'backup-restore' || activeTab === 'backup-manager') && (
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                  <BackupSettingsTab
                    activeSection={activeTab === 'backup-manager' ? 'all' : 'restore'}
                    onClose={handleClose}
                    onRestoreComplete={() => {
                      handleClose();
                      if (onSyncComplete) onSyncComplete();
                    }}
                  />
                </div>
              )}

              {/* SECTION: DATI & BACKUP - PLAYNITE IMPORT */}
              {activeTab === 'backup-playnite' && (
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                  <div
                    className="p-6 rounded-2xl border space-y-4"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-color)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl border flex items-center justify-center"
                          style={{
                            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                            borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                            color: 'var(--accent-primary)',
                          }}
                        >
                          <FolderArchive className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white flex items-center gap-2">
                            {t('general_settings.playnite_card_title') || 'Importazione Backup Playnite'}
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold border"
                              style={{
                                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                                borderColor: 'color-mix(in srgb, var(--accent-primary) 30%, transparent)',
                                color: 'var(--accent-primary)',
                              }}
                            >
                              Beta
                            </span>
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {t('general_settings.playnite_card_desc') ||
                              'Arricchisci la tua libreria importando statistiche, ore di gioco e cover da un archivio Playnite (.zip)'}
                          </p>
                        </div>
                      </div>

                      {onOpenPlayniteImport && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEffects.playSelect();
                            onClose();
                            onOpenPlayniteImport();
                          }}
                          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-2 cursor-pointer font-sans hover:brightness-110 active:scale-95"
                          style={{
                            backgroundColor: 'var(--accent-primary)',
                            boxShadow: '0 4px 14px var(--accent-glow)',
                          }}
                        >
                          <FolderArchive className="w-4 h-4" />
                          <span>{t('general_settings.playnite_card_btn') || 'Avvia Importazione...'}</span>
                        </button>
                      )}
                    </div>

                    <div className="border-t border-white/5 pt-4 text-xs text-slate-400 space-y-2">
                      <p className="font-semibold text-slate-300">Cosa viene importato:</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-400">
                        <li>Catalogo giochi e categorie personalizzate</li>
                        <li>Ore di gioco accumulate e data ultimo avvio</li>
                        <li>Copertine, loghi e sfondi locali associati ai titoli</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
