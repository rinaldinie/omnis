import { useState, useEffect, useMemo, useCallback } from 'react';
import { api, TAURI_EVENTS, listenTauri } from '../../../api';
import { useUpdater } from '../../../hooks/useAppUpdater';
import { useTranslation } from '../../../i18n';
import { soundEffects } from '../../../utils/soundEffects';
import type { StoreAccount } from '../../store_accounts/types';
import type { ProviderInfo } from '../../../types';
import {
  SettingsTab,
  TreeGroup,
  buildSettingsTree,
} from './settingsTreeConfig';

export const resolveTargetTab = (tab?: SettingsTab): SettingsTab => {
  if (!tab || tab === 'general') return 'general-language';
  if (tab === 'accounts') return 'store-steam';
  if (tab === 'emulators') return 'emulators-switch';
  if (tab === 'metadata') return 'metadata-igdb';
  if (tab === 'achievements') return 'achievements-sources';
  if (tab === 'duplicates') return 'duplicates-priorities';
  if (tab === 'backup' || tab === 'backup-manager') return 'backup-manual';
  return tab;
};

export interface UseSettingsNavigationOptions {
  isOpen: boolean;
  initialTab?: SettingsTab;
  onSyncComplete?: () => void;
  onClose: () => void;
}

export function useSettingsNavigation({
  isOpen,
  initialTab = 'general',
  onSyncComplete,
  onClose,
}: UseSettingsNavigationOptions) {
  const { t } = useTranslation();
  const updater = useUpdater();

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => resolveTargetTab(initialTab));
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [storeAccounts, setStoreAccounts] = useState<StoreAccount[]>([]);
  const [metadataProviders, setMetadataProviders] = useState<ProviderInfo[]>([]);

  // Accordion state for sidebar categories
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    general: true,
    accounts: true,
    emulators: true,
    metadata: true,
    achievements: true,
    duplicates: true,
    backup: true,
  });

  // Load store accounts and metadata providers status
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    api.stores
      .getStoreAccounts()
      .then((accs) => {
        if (isMounted && Array.isArray(accs)) {
          setStoreAccounts(accs);
        }
      })
      .catch(console.debug);

    api.metadata
      .getProviders()
      .then((provs) => {
        if (isMounted && Array.isArray(provs)) {
          setMetadataProviders(provs);
        }
      })
      .catch(console.debug);

    let unlistenConnected: (() => void) | null = null;
    let unlistenDisconnected: (() => void) | null = null;

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_CONNECTED, () => {
      api.stores
        .getStoreAccounts()
        .then((accs) => {
          if (isMounted && Array.isArray(accs)) setStoreAccounts(accs);
        })
        .catch(console.debug);
    }).then((fn) => {
      unlistenConnected = fn;
    });

    listenTauri<{ store_id: string }>(TAURI_EVENTS.STORE_ACCOUNT_DISCONNECTED, () => {
      api.stores
        .getStoreAccounts()
        .then((accs) => {
          if (isMounted && Array.isArray(accs)) setStoreAccounts(accs);
        })
        .catch(console.debug);
    }).then((fn) => {
      unlistenDisconnected = fn;
    });

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

  const treeGroups: TreeGroup[] = useMemo(() => {
    return buildSettingsTree({
      t,
      updaterStatus: updater?.status,
      storeAccounts,
      metadataProviders,
    });
  }, [t, updater?.status, storeAccounts, metadataProviders]);

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

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    expandedGroups,
    toggleGroup,
    handleSelectTab,
    handleClose,
    filteredGroups,
    activeGroup,
    activeItem,
  };
}
