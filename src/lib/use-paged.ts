import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const PAGE_SIZES = [25, 50, 100] as const;

/** Page, page size and a debounced search for a server-paged table. Plain state: the URL never changes. */
export function usePaged(initialSize = 25) {
  const [page, setPage] = useState(0);
  const [size, setSizeRaw] = useState(initialSize);
  const [search, setSearchRaw] = useState("");
  const q = useDebounced(search.trim(), 300);
  useEffect(() => setPage(0), [q]);
  return {
    page, size, search, q,
    from: page * size,
    to: page * size + size - 1,
    setPage,
    setSearch: setSearchRaw,
    setSize: (n: number) => { setSizeRaw(n); setPage(0); },
    reset: () => setPage(0),
  };
}

/** PostgREST `or=` filter: any of `cols` contains `q`. Characters that break the filter syntax are dropped. */
export function ilikeAny(cols: string[], q: string) {
  const clean = q.replace(/[,()%*"\\]/g, " ").trim();
  return clean ? cols.map((c) => `${c}.ilike.%${clean}%`).join(",") : null;
}
