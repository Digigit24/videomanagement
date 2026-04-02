import { useEffect, useRef } from 'react';

/**
 * Like useEffect but provides an AbortController signal.
 * Automatically aborts the previous call when deps change or component unmounts.
 *
 * Usage:
 *   useAbortableEffect((signal) => {
 *     fetchData({ signal }).then(setData).catch(() => {});
 *   }, [dep1, dep2]);
 */
export function useAbortableEffect(
  callback: (signal: AbortSignal) => void | Promise<void>,
  deps: React.DependencyList,
) {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort previous
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    callback(controller.signal);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
