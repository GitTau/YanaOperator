// ─────────────────────────────────────────────────────────────────────────────
// Store Selection Store — Zustand
// Persists the captain's selected ZAP Point across sessions using AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { Store } from '../lib/database.types';

const STORE_KEY = 'yana_selected_store';

interface StoreSelectionState {
  selectedStore: Store | null;
  isLoaded: boolean;
  setSelectedStore: (store: Store) => Promise<void>;
  loadPersistedStore: () => Promise<void>;
  clearStore: () => Promise<void>;
}

export const useStoreSelectionStore = create<StoreSelectionState>((set) => ({
  selectedStore: null,
  isLoaded: false,

  loadPersistedStore: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      if (raw) {
        const store = JSON.parse(raw) as Store;
        set({ selectedStore: store });
      }
    } catch (err) {
      console.error('[StoreSelection] loadPersistedStore failed:', err);
    } finally {
      set({ isLoaded: true });
    }
  },

  setSelectedStore: async (store) => {
    try {
      await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
      set({ selectedStore: store });
    } catch (err) {
      console.error('[StoreSelection] setSelectedStore failed:', err);
    }
  },

  clearStore: async () => {
    try {
      await AsyncStorage.removeItem(STORE_KEY);
      set({ selectedStore: null });
    } catch (err) {
      console.error('[StoreSelection] clearStore failed:', err);
    }
  },
}));
