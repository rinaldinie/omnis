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
      label: t('settings_modal.tab_accounts', { defaultValue: 'Store & Piattaforme' }),
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
          ],
        };
      }),
    },
    {
      id: 'emulators',
      label: t('settings_modal.tab_emulators', { defaultValue: 'Emulatori' }),
      icon: (c = 'w-4 h-4') => <Gamepad2 className={c} />,
      items: [
        {
          id: 'emulators-switch',
          label: t('emulators_settings.switch_title', { defaultValue: 'Nintendo Switch' }),
          icon: (c = 'w-4 h-4') => <Gamepad2 className={c} />,
          keywords: ['emulatori', 'emulator', 'switch', 'eden', 'ryujinx', 'citron', 'yuzu', 'chiavi', 'keys', 'icone'],
        },
      ],
    },
    {
      id: 'metadata',
      label: t('settings_modal.tab_metadata', { defaultValue: 'Metadati & Copertine' }),
      icon: (c = 'w-4 h-4') => <Layers className={c} />,
      items: [
        {
          id: 'metadata-pipeline',
          label: t('metadata_settings.tab_pipeline', { defaultValue: 'Pipeline & Priorità' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['pipeline', 'priorità', 'campi', 'scraping', 'ordine', 'fallback'],
        },
        {
          id: 'metadata-igdb',
          label: 'IGDB (Twitch)',
          icon: (c = 'w-4 h-4') => <Database className={c} />,
          badge: metadataProviders.find((p) => p.id === 'igdb')?.is_enabled ? (
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: '#22c55e' }}
              title="Attivo"
            />
          ) : (
            <span
              className="w-2 h-2 rounded-full shadow-sm opacity-40"
              style={{ backgroundColor: '#ef4444' }}
              title="Disattivato"
            />
          ),
          keywords: ['igdb', 'twitch', 'api key', 'client id', 'metadati', 'generi', 'sinossi'],
        },
        {
          id: 'metadata-steamgriddb',
          label: 'SteamGridDB',
          icon: (c = 'w-4 h-4') => <ImageIcon className={c} />,
          badge: metadataProviders.find((p) => p.id === 'steamgriddb')?.is_enabled ? (
            <span
              className="w-2 h-2 rounded-full shadow-sm"
              style={{ backgroundColor: '#22c55e' }}
              title="Attivo"
            />
          ) : (
            <span
              className="w-2 h-2 rounded-full shadow-sm opacity-40"
              style={{ backgroundColor: '#ef4444' }}
              title="Disattivato"
            />
          ),
          keywords: ['steamgriddb', 'sgdb', 'artwork', 'cover', 'hero', 'logo', 'icon', 'immagini'],
        },
        {
          id: 'metadata-opencritic',
          label: 'OpenCritic',
          icon: (c = 'w-4 h-4') => <Award className={c} />,
          keywords: ['opencritic', 'voti', 'recensioni', 'score', 'score critico', 'rating'],
        },
        {
          id: 'metadata-hltb',
          label: 'HowLongToBeat',
          icon: (c = 'w-4 h-4') => <Clock className={c} />,
          keywords: ['hltb', 'howlongtobeat', 'tempo', 'completamento', 'ore', 'main story'],
        },
      ],
    },
    {
      id: 'achievements',
      label: t('settings_modal.tab_achievements', { defaultValue: 'Obiettivi & Trofei' }),
      icon: (c = 'w-4 h-4') => <Trophy className={c} />,
      items: [
        {
          id: 'achievements-sources',
          label: t('achievements_settings.tab_sources', { defaultValue: 'Sorgenti & API Key' }),
          icon: (c = 'w-4 h-4') => <Sparkles className={c} />,
          keywords: ['obiettivi', 'trofei', 'achievements', 'steam', 'psn', 'xbox', 'retroachievements', 'api key'],
        },
        {
          id: 'achievements-view',
          label: t('achievements_settings.tab_view', { defaultValue: 'Visualizzazione' }),
          icon: (c = 'w-4 h-4') => <Eye className={c} />,
          keywords: ['layout', 'anteprima', 'segreti', 'ordinamento', 'percentuale'],
        },
        {
          id: 'achievements-appearance',
          label: t('achievements_settings.tab_appearance', { defaultValue: 'Aspetto' }),
          icon: (c = 'w-4 h-4') => <Palette className={c} />,
          keywords: ['aspetto', 'colori', 'rarità', 'glow', 'animazioni', 'trofeo platino'],
        },
        {
          id: 'achievements-misc',
          label: t('achievements_settings.tab_misc', { defaultValue: 'Avanzate & Notifiche' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['suono', 'notifica', 'toast', 'intervallo', 'background sync', 'avanzate'],
        },
        {
          id: 'achievements-ignored',
          label: t('achievements_settings.tab_ignored', { defaultValue: 'Giochi Ignorati' }),
          icon: (c = 'w-4 h-4') => <Trash2 className={c} />,
          keywords: ['esclusi', 'ignorati', 'whitelist', 'blacklist'],
        },
      ],
    },
    {
      id: 'duplicates',
      label: t('settings_modal.tab_duplicates', { defaultValue: 'Gestione Duplicati' }),
      icon: (c = 'w-4 h-4') => <EyeOff className={c} />,
      items: [
        {
          id: 'duplicates-priorities',
          label: t('duplicate_hider.tab_priorities', { defaultValue: 'Priorità Store' }),
          icon: (c = 'w-4 h-4') => <Sliders className={c} />,
          keywords: ['duplicati', 'priorità', 'store', 'steam', 'gog', 'epic', 'ordinamento', 'primario'],
        },
        {
          id: 'duplicates-rules',
          label: t('duplicate_hider.tab_rules', { defaultValue: 'Criteri di Rilevamento' }),
          icon: (c = 'w-4 h-4') => <Eye className={c} />,
          keywords: ['duplicati', 'regole', 'algoritmo', 'similarità', 'titolo', 'filtri', 'installati'],
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
}
