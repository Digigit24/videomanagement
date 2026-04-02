import { useState, useCallback } from 'react';

/**
 * Hook for type-safe localStorage access with React state sync.
 * Provides get/set/remove operations with automatic re-renders.
 *
 * Usage:
 *   const [value, setValue, removeValue] = useLocalStorage('key', 'default');
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(newValue));
        } catch {
          console.warn(`Failed to set localStorage key "${key}"`);
        }
        return newValue;
      });
    },
    [key],
  );

  const removeValue = useCallback(() => {
    setStoredValue(initialValue);
    try {
      localStorage.removeItem(key);
    } catch {
      console.warn(`Failed to remove localStorage key "${key}"`);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}
