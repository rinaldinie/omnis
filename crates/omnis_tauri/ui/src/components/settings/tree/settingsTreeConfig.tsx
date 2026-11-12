import React from 'react';
import {
  Sliders,
  Cloud,
  Trophy,
  Archive,
  Globe,
  Volume2,
  Minimize2,
  Palette,
  RefreshCw,
  FolderArchive,
  Eye,
  Sparkles,
  Trash2,
  Clock,
  RotateCcw,
  Layers,
  EyeOff,
  Database,
  Image as ImageIcon,
  Award,
  Gamepad2,
} from 'lucide-react';
import { STORE_LIST } from '../StoreAccountsTab';
import type { StoreAccount } from '../../store_accounts/types';
import type { ProviderInfo } from '../../../types';

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
  | 'emulators'
  | 'emulators-switch'
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

export interface TreeItem {
  id: SettingsTab;
  label: string;
  icon: (cls?: string) => React.ReactNode;
  badge?: React.ReactNode;
  keywords: string[];
}

export interface TreeGroup {
  id: string;
  label: string;
  icon: (cls?: string) => React.ReactNode;
  items: TreeItem[];
}

export interface BuildTreeOptions {
  t: (key: string, options?: any) => string;
  updaterStatus?: string;
  storeAccounts: StoreAccount[];
  metadataProviders: ProviderInfo[];
}

export function buildSettingsTree({
  t,
  updaterStatus,
  storeAccounts,
  metadataProviders,
}: BuildTreeOptions): TreeGroup[] {
  return [
    {
      id: 'general',
      label: t('settings_modal.tab_general', { defaultValue: 'General' }),
      icon: (c = 'w-4 h-4') => <Sliders className={c} />,
      items: [
        {
          id: 'general-language',
          label: t('general_settings.tab_language', { defaultValue: 'Language & Locale' }),
          icon: (c = 'w-4 h-4') => <Globe className={c} />,
          keywords: ['lingua', 'language', 'locale', 'italiano', 'english', 'traduzione', 'translation'],
        },
        {
          id: 'general-audio',
          label: t('general_settings.tab_audio', { defaultValue: 'Audio & Feedback' }),
          icon: (c = 'w-4 h-4') => <Volume2 className={c} />,
          keywords: ['audio', 'suoni', 'effetti', 'sound', 'volume', 'beeps', 'segnali', 'effects'],
        },
        {
          id: 'general-window',
          label: t('general_settings.tab_window', { defaultValue: 'Window & System' }),
          icon: (c = 'w-4 h-4') => <Minimize2 className={c} />,
          keywords: ['finestra', 'tray', 'riduci', 'avvio', 'scansione', 'sistema', 'close', 'window', 'startup'],
        },
        {
          id: 'general-appearance',
          label: t('general_settings.tab_appearance', { defaultValue: 'Appearance & Themes' }),
          icon: (c = 'w-4 h-4') => <Palette className={c} />,
          keywords: ['aspetto', 'temi', 'tema', 'colori', 'interfaccia', 'animazioni', 'dark', 'light', 'appearance', 'themes'],
        },
        {
          id: 'general-recent',
          label: t('sidebar.recent', { defaultValue: 'Recent Games' }),
          icon: (c = 'w-4 h-4') => <Clock className={c} />,
          keywords: ['recenti', 'recent', 'giochi recenti', 'tempo', 'slider', 'filtro', 'last played', 'played'],
        },
        {
          id: 'general-updates',
          label: t('general_settings.tab_updates', { defaultValue: 'Updates' }),
          icon: (c = 'w-4 h-4') => (
            <RefreshCw className={`${c} ${updaterStatus === 'checking' ? 'animate-spin' : ''}`} />
          ),
          badge:
            updaterStatus === 'available' ? (
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
      label: t('settings_modal.tab_accounts', { defaultValue: 'Stores & Platforms' }),
      icon: (c = 'w-4 h-4') => <Cloud className={c} />,
      items: STORE_LIST.map((store) => {
        const acc = storeAccounts.find((a) => a.store_id === store.id);
        const isConnected = acc?.is_connected;
        return {
          id: `store-${store.id}` as SettingsTab,
          label: store.name,
          icon: (c = 'w-4 h-4') => store.icon(c),
          badge: isConnected ? (
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: '#22c55e' }}
              title="Collegato"
            />
          ) : undefined,
          keywords: [
            store.name.toLowerCase(),
            store.id.toLowerCase(),
            'account',
            'login',
            'token',
            'sincronizzazione',
            'giochi',
            'sync',
            'games',
          ],
        };
      }),
    },
    {
      id: 'emulators',
      label: t('settings_modal.tab_emulators', { defaultValue: 'Emulators' }),
      icon: (c = 'w-4 h-4') => <Gamepad2 className={c} />,
      items: [
        {
          id: 'emulators-switch',
          label: t('emulators_settings.switch_title', { defaultValue: 'Nintendo Switch' }),
          icon: (c = 'w-4 h-4') => <Gamepad2 className={c} />,
          keywords: ['emulatori', 'emulator', 'switch', 'eden', 'ryujinx', 'citron', 'suyu', 'sudachi', 'yuzu', 'chiavi', 'keys', 'icone', 'icons'],
        },
      ],
    },
    {
      id: 'metadata',
      label: t('settings_modal.tab_metadata', { defaultValue: 'Metadata & Artwork' }),
      icon: (c = 'w-4 h-4') => <Layers className={c} />,
      items: [
        {
          id: 'metadata-pipeline',
          label: t('metadata_settings.tab_pipeline', { defaultValue: 'Pipeline & Priorities' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['pipeline', 'priorità', 'priority', 'campi', 'fields', 'scraping', 'ordine', 'fallback'],
        },
        {
          id: 'metadata-igdb',
          label: 'IGDB (Twitch)',
          icon: (c = 'w-4 h-4') => <Database className={c} />,
          badge: metadataProviders.find((p) => p.id === 'igdb')?.is_enabled ? (
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: '#22c55e' }}
              title={t('common.enabled', { defaultValue: 'Enabled' })}
            />
          ) : (
            <span
              className="w-2 h-2 rounded-full shadow-sm opacity-40"
              style={{ backgroundColor: '#ef4444' }}
              title={t('common.disabled', { defaultValue: 'Disabled' })}
            />
          ),
          keywords: ['igdb', 'twitch', 'api key', 'client id', 'metadati', 'metadata', 'generi', 'sinossi'],
        },
        {
          id: 'metadata-steamgriddb',
          label: 'SteamGridDB',
          icon: (c = 'w-4 h-4') => <ImageIcon className={c} />,
          badge: metadataProviders.find((p) => p.id === 'steamgriddb')?.is_enabled ? (
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: '#22c55e' }}
              title={t('common.enabled', { defaultValue: 'Enabled' })}
            />
          ) : (
            <span
              className="w-2 h-2 rounded-full shadow-sm opacity-40"
              style={{ backgroundColor: '#ef4444' }}
              title={t('common.disabled', { defaultValue: 'Disabled' })}
            />
          ),
          keywords: ['steamgriddb', 'sgdb', 'artwork', 'cover', 'hero', 'logo', 'icon', 'immagini', 'posters'],
        },
        {
          id: 'metadata-opencritic',
          label: 'OpenCritic',
          icon: (c = 'w-4 h-4') => <Award className={c} />,
          keywords: ['opencritic', 'voti', 'recensioni', 'score', 'score critico', 'rating', 'reviews'],
        },
        {
          id: 'metadata-hltb',
          label: 'HowLongToBeat',
          icon: (c = 'w-4 h-4') => <Clock className={c} />,
          keywords: ['hltb', 'howlongtobeat', 'tempo', 'completamento', 'ore', 'main story', 'playtime'],
        },
      ],
    },
    {
      id: 'achievements',
      label: t('settings_modal.tab_achievements', { defaultValue: 'Achievements & Trophies' }),
      icon: (c = 'w-4 h-4') => <Trophy className={c} />,
      items: [
        {
          id: 'achievements-sources',
          label: t('achievements_settings.tab_sources', { defaultValue: 'Sources & API Keys' }),
          icon: (c = 'w-4 h-4') => <Sparkles className={c} />,
          keywords: ['obiettivi', 'trofei', 'achievements', 'steam', 'psn', 'xbox', 'retroachievements', 'api key'],
        },
        {
          id: 'achievements-view',
          label: t('achievements_settings.tab_view', { defaultValue: 'Display' }),
          icon: (c = 'w-4 h-4') => <Eye className={c} />,
          keywords: ['layout', 'anteprima', 'segreti', 'ordinamento', 'percentuale', 'view', 'display'],
        },
        {
          id: 'achievements-appearance',
          label: t('achievements_settings.tab_appearance', { defaultValue: 'Appearance' }),
          icon: (c = 'w-4 h-4') => <Palette className={c} />,
          keywords: ['aspetto', 'colori', 'rarità', 'glow', 'animazioni', 'trofeo platino', 'appearance', 'theme'],
        },
        {
          id: 'achievements-misc',
          label: t('achievements_settings.tab_misc', { defaultValue: 'Advanced & Notifications' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['suono', 'notifica', 'toast', 'intervallo', 'background sync', 'avanzate', 'sound', 'notifications'],
        },
        {
          id: 'achievements-ignored',
          label: t('achievements_settings.tab_ignored', { defaultValue: 'Ignored Games' }),
          icon: (c = 'w-4 h-4') => <Trash2 className={c} />,
          keywords: ['esclusi', 'ignorati', 'whitelist', 'blacklist', 'ignored', 'excluded'],
        },
      ],
    },
    {
      id: 'duplicates',
      label: t('settings_modal.tab_duplicates', { defaultValue: 'Duplicate Hider' }),
      icon: (c = 'w-4 h-4') => <EyeOff className={c} />,
      items: [
        {
          id: 'duplicates-priorities',
          label: t('duplicate_hider.tab_priorities', { defaultValue: 'Store Priority & Status' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['duplicati', 'priorità', 'store', 'steam', 'gog', 'epic', 'ordinamento', 'primario', 'duplicates', 'priority'],
        },
        {
          id: 'duplicates-rules',
          label: t('duplicate_hider.tab_rules', { defaultValue: 'Detection & Display Rules' }),
          icon: (c = 'w-4 h-4') => <Eye className={c} />,
          keywords: ['duplicati', 'regole', 'algoritmo', 'similarità', 'titolo', 'filtri', 'installati', 'rules', 'detection'],
        },
        {
          id: 'duplicates-ignored',
          label: t('duplicate_hider.tab_ignored', { defaultValue: 'Excluded Games' }),
          icon: (c = 'w-4 h-4') => <EyeOff className={c} />,
          keywords: ['duplicati', 'esclusi', 'ignorati', 'whitelist', 'excluded', 'ignored'],
        },
      ],
    },
    {
      id: 'backup',
      label: t('settings_modal.tab_backup', { defaultValue: 'Data & Backup' }),
      icon: (c = 'w-4 h-4') => <Archive className={c} />,
      items: [
        {
          id: 'backup-manual',
          label: t('backup_settings.create_card_title', { defaultValue: 'Create Backup (.zip)' }),
          icon: (c = 'w-4 h-4') => <Archive className={c} />,
          keywords: ['backup', 'crea', 'manuale', 'zip', 'salvataggio', 'export', 'archivio', 'database', 'create'],
        },
        {
          id: 'backup-schedule',
          label: t('backup_settings.schedule_card_title', { defaultValue: 'Automated Backup & Scheduling' }),
          icon: (c = 'w-4 h-4') => <Clock className={c} />,
          keywords: ['pianificazione', 'automatico', 'schedulazione', 'cron', 'frequenza', 'rotazione', 'orario', 'schedule', 'automated'],
        },
        {
          id: 'backup-restore',
          label: t('backup_settings.restore_card_title', { defaultValue: 'Restore from File (.zip)' }),
          icon: (c = 'w-4 h-4') => <RotateCcw className={c} />,
          keywords: ['ripristina', 'restore', 'carica', 'recupera', 'sostituisci', 'importa', 'archivio', 'recover'],
        },
        {
          id: 'backup-playnite',
          label: t('general_settings.playnite_card_title', { defaultValue: 'Playnite Import' }),
          icon: (c = 'w-4 h-4') => <FolderArchive className={c} />,
          keywords: ['playnite', 'importa', 'migrazione', 'libreria', 'zip', 'import', 'migration'],
        },
      ],
    },
  ];
}
