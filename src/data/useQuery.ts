/**
 * useQuery.ts — une lecture asynchrone et son état, sans bibliothèque.
 *
 * Le site lit peu de choses et toujours à l'ouverture d'un écran : un cache
 * global serait une abstraction de plus pour un seul besoin.
 */
import { useCallback, useEffect, useState } from 'react';

export interface Query<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
  /** Remplace la donnée localement, après une écriture réussie. */
  set: (v: T) => void;
}

export function useQuery<T>(load: () => Promise<T>, deps: unknown[]): Query<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    load()
      .then((v) => { if (alive) setData(v); })
      .catch((e) => { if (alive) setError(e); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, set: setData };
}
