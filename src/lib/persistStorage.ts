import { createJSONStorage } from 'zustand/middleware';

export function createLegacyKeyJSONStorage<T>(legacyKeys: string[]) {
  return createJSONStorage<T>(() => ({
    getItem: (name) => {
      const current = localStorage.getItem(name);
      if (current !== null) {
        return current;
      }

      for (const legacyKey of legacyKeys) {
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue !== null) {
          localStorage.setItem(name, legacyValue);
          localStorage.removeItem(legacyKey);
          return legacyValue;
        }
      }

      return null;
    },
    setItem: (name, value) => {
      localStorage.setItem(name, value);
      for (const legacyKey of legacyKeys) {
        if (legacyKey !== name) {
          localStorage.removeItem(legacyKey);
        }
      }
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
      for (const legacyKey of legacyKeys) {
        if (legacyKey !== name) {
          localStorage.removeItem(legacyKey);
        }
      }
    },
  }));
}
