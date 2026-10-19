// Shared pieces of the paged list queries in lib/<module>/queries.ts.
export type ListPage = { q: string; page: number; size: number; from: number; to: number };

/** The first page with no search, for prefetching a list before it's opened. */
export const FIRST_PAGE: ListPage = { q: "", page: 0, size: 25, from: 0, to: 24 };

/** A search term that's safe inside a PostgREST or() filter. */
export const cleanTerm = (q: string) => q.replace(/[,()%*"\\]/g, " ").trim();
