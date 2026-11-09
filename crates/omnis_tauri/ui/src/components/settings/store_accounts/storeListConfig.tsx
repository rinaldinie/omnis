import React from 'react';
import { SteamIcon, EpicIcon, GogIcon, XboxIcon, AmazonIcon } from '../../StoreBadge';

export interface StoreItemMeta {
  id: string;
  name: string;
  icon: (className?: string) => React.ReactNode;
  tag?: string;
  isCustom?: boolean;
}

export const STORE_LIST: StoreItemMeta[] = [
  {
    id: 'steam',
    name: 'Steam',
    icon: (c = 'w-4 h-4') => <SteamIcon className={`${c} text-[#66c0f4]`} />,
    tag: 'API Key',
  },
  {
    id: 'epic',
    name: 'Epic Games',
    icon: (c = 'w-4 h-4') => <EpicIcon className={c} />,
    tag: 'OAuth',
  },
  {
    id: 'gog',
    name: 'GOG Galaxy',
    icon: (c = 'w-4 h-4') => <GogIcon className={c} />,
    tag: 'OAuth',
  },
  {
    id: 'xbox',
    name: 'Xbox / PC Game Pass',
    icon: (c = 'w-4 h-4') => <XboxIcon className={`${c} text-[#107c10]`} />,
    tag: 'OAuth',
  },
  {
    id: 'amazon',
    name: 'Amazon Games',
    icon: (c = 'w-4 h-4') => <AmazonIcon className={`${c} text-[#ff9900]`} />,
    tag: 'Locale',
  },
];
