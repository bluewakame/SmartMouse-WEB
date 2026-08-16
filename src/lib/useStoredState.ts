import { useCallback, useEffect, useState } from "react";

/** iOS版の @AppStorage 相当。localStorage に JSON で保存する。 */
export function useStoredState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored === null ? initialValue : (JSON.parse(stored) as T);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // プライベートブラウズなどで保存できなくても、その回の操作は続けられる。
    }
  }, [key, value]);

  const update = useCallback((next: T) => setValue(next), []);
  return [value, update];
}
