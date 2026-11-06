/** "Mon 16 Nov" for crew screens. */
export function fmtDay(iso: string | null) {
  if (!iso) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
}
