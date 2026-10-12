export type ChangedLines = { before: Set<number>; after: Set<number> };

export function changedLineNumbers(patch: string, beforeExists: boolean, afterExists: boolean, before: string, after: string): ChangedLines {
  const changed: ChangedLines = { before: new Set(), after: new Set() };
  const count = (text: string) => text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  if (!beforeExists) for (let line = 1; line <= count(after); line++) changed.after.add(line);
  if (!afterExists) for (let line = 1; line <= count(before); line++) changed.before.add(line);
  let oldLine = 0;
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) { oldLine = Number(header[1]); newLine = Number(header[2]); continue; }
    if (!oldLine && !newLine) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) { changed.after.add(newLine++); continue; }
    if (line.startsWith("-") && !line.startsWith("---")) { changed.before.add(oldLine++); continue; }
    if (line.startsWith(" ")) { oldLine++; newLine++; }
  }
  return changed;
}

export function textLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}
