/** Trimmed string or null for empty. */
export function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = Number(fd.get(key));
  return Number.isFinite(v) ? v : fallback;
}

export function oneOf<T extends readonly string[]>(fd: FormData, key: string, options: T, fallback: T[number]): T[number] {
  const v = fd.get(key);
  return typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

/** Postgres/PostgREST errors -> something a roofer can read. */
export function friendly(error: { message: string; code?: string } | null): string {
  if (!error) return "Something went wrong.";
  if (error.code === "42501") return "You don't have permission to do that.";
  if (error.code === "23503") return "That record is linked to something else and can't be changed.";
  return error.message;
}
