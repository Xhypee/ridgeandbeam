// Reads back the job note Claude leaves after reading a file (written by intakeNote in doc-intake.ts) so the Notes
// list can draw it as a tidy card. Null for any other note, or older notes in the run-on sentence format.

export type ClaudeNote = {
  file: string;
  kind: string;
  summary: string | null;
  added: string[];
  check: string[];
  details: string[];
  nothing: boolean;
};

const HEADS = { Added: "added", Check: "check", Details: "details" } as const;

export function parseClaudeNote(body: string): ClaudeNote | null {
  const lines = body.split(/\r?\n/);
  const head = /^Read "(.+)" · (.+)$/.exec(lines[0]?.trim() ?? "");
  if (!head) return null;
  const note: ClaudeNote = { file: head[1], kind: head[2], summary: null, added: [], check: [], details: [], nothing: false };
  let at: keyof typeof HEADS | null = null;
  for (const raw of lines.slice(1)) {
    const l = raw.trim();
    if (!l) continue;
    if (l in HEADS) { at = l as keyof typeof HEADS; continue; }
    if (at && l.startsWith("- ")) { note[HEADS[at]].push(l.slice(2)); continue; }
    if (l === "Nothing new to add to the job." || l === "Nothing to watch out for.") { note.nothing = true; continue; }
    if (!at && note.summary === null) { note.summary = l; continue; }
    return null; // not the shape we write: show it as plain text
  }
  return note;
}
