// Shared list rules (00-global.md P1, P2): search, filters in the page
// address, sort by any column shown, paging with a count.

export const PAGE_SIZE = 25;

export type ListParams = {
  q: string;
  page: number;
  sort: string | null;
  dir: "asc" | "desc";
  filters: Record<string, string>;
  archived: boolean;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function readListParams(raw: Raw, filterKeys: readonly string[] = []): ListParams {
  const page = Math.max(1, Math.min(10000, Number.parseInt(first(raw.page), 10) || 1));
  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    const v = first(raw[key]).trim();
    if (v) filters[key] = v.slice(0, 100);
  }
  return {
    q: first(raw.q).trim().slice(0, 100),
    page,
    sort: first(raw.sort) || null,
    dir: first(raw.dir) === "desc" ? "desc" : "asc",
    filters,
    archived: first(raw.archived) === "1",
  };
}

export function skipTake(params: ListParams, pageSize = PAGE_SIZE) {
  return { skip: (params.page - 1) * pageSize, take: pageSize };
}

/** Builds a page address keeping the current filters, with some values changed. */
export function listHref(path: string, params: ListParams, change: Record<string, string | number | null>) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  for (const [k, v] of Object.entries(params.filters)) sp.set(k, v);
  if (params.sort) { sp.set("sort", params.sort); sp.set("dir", params.dir); }
  if (params.archived) sp.set("archived", "1");
  if (params.page > 1) sp.set("page", String(params.page));
  for (const [k, v] of Object.entries(change)) {
    if (v === null || v === "") sp.delete(k);
    else sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** Turns a chosen sort column into a Prisma orderBy, only for allowed columns. */
export function orderByFor<T extends string>(params: ListParams, allowed: Record<T, unknown>, fallback: unknown) {
  if (params.sort && params.sort in allowed) {
    const make = allowed[params.sort as T];
    if (typeof make === "function") return (make as (d: "asc" | "desc") => unknown)(params.dir);
    // An object or list is the order itself ({ name: { fullName: dir } }); a plain marker (1, true) sorts by the field of that name.
    return make !== null && typeof make === "object" ? make : { [params.sort]: params.dir };
  }
  return fallback;
}
