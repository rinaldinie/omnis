import { create } from "zustand";
import { api } from "../api";
import { GameDto, LibraryCounts, normalizeGame } from "../types";
import { getErrorMessage } from "../utils/errors";

export interface LibraryState {
  games: GameDto[];
  counts: LibraryCounts;
  selectedGame: GameDto | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setGames: (games: GameDto[] | ((prev: GameDto[]) => GameDto[])) => void;
  setCounts: (counts: LibraryCounts) => void;
  setSelectedGame: (game: GameDto | null | ((prev: GameDto | null) => GameDto | null)) => void;
  loadGames: (options?: { shouldShowOnboardingCheck?: () => boolean; onShowOnboarding?: () => void }) => Promise<void>;
  refreshLibrary: () => Promise<void>;
  findGameById: (id: string) => GameDto | undefined;
}

const initialCounts: LibraryCounts = {
  total: 0,
  installed: 0,
  steam: 0,
  gog: 0,
  epic: 0,
  xbox: 0,
  recent: 0,
  favorites: 0,
  action: 0,
  rpg: 0,
  strategy: 0,
  indie: 0,
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  games: [],
  counts: initialCounts,
  selectedGame: null,
  isLoading: false,
  error: null,

  setGames: (updater) => {
    set((state) => ({
      games: typeof updater === "function" ? updater(state.games) : updater,
    }));
  },

  setCounts: (counts) => set({ counts }),

  setSelectedGame: (updater) => {
    set((state) => ({
      selectedGame: typeof updater === "function" ? updater(state.selectedGame) : updater,
    }));
  },

  loadGames: async (options) => {
    set({ isLoading: true, error: null });
    try {
      const loadedGames = await api.games.getGames();
      if (loadedGames) {
        const normalized = loadedGames.map(normalizeGame);
        set({ games: normalized });

        // Update selectedGame preserving or resolving active selection
        const prev = get().selectedGame;
        let nextSelected: GameDto | null = null;
        if (prev) {
          const current = normalized.find((g) => g.id === prev.id);
          if (current) {
            if (current.is_hidden && current.other_copies && current.other_copies.length > 0) {
              const primary = normalized.find(
                (g) =>
                  !g.is_hidden &&
                  (g.duplicate_group_id === current.duplicate_group_id ||
                    current.other_copies?.some((c) => c.id === g.id))
              );
              nextSelected = primary || current;
            } else {
              nextSelected = current;
            }
          }
        }
        if (!nextSelected) {
          nextSelected = normalized.length > 0 ? normalized[0] : null;
        }
        set({ selectedGame: nextSelected });
      }

      const loadedCounts = await api.games.getCounts();
      if (loadedCounts) {
        set({ counts: loadedCounts });
        if (loadedCounts.total === 0 && options?.shouldShowOnboardingCheck?.()) {
          options.onShowOnboarding?.();
        }
      }
      set({ isLoading: false });
    } catch (err: unknown) {
      console.error("Failed to load games or counts", err);
      set({ isLoading: false, error: getErrorMessage(err, "Failed to load library") });
    }
  },

  refreshLibrary: async () => {
    return get().loadGames();
  },

  findGameById: (id: string) => {
    return get().games.find((g) => g.id === id);
  },
}));
