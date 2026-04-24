interface ParsedResultText {
  headerFields: Record<string, string>;
  headers: string[];
  rows: string[][];
}

function isTableRow(line: string): boolean {
  return line.startsWith("|") && line.endsWith("|");
}

function isTableSeparator(line: string): boolean {
  return /^\|[-:| ]+\|$/.test(line);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseResultText(text: string): ParsedResultText {
  const headerFields: Record<string, string> = {};
  const headers: string[] = [];
  const rows: string[][] = [];
  let foundHeader = false;

  for (const line of text.split("\n")) {
    const stripped = line.trim();

    // Before the table: extract key: value header fields
    if (!foundHeader && !isTableRow(stripped)) {
      if (stripped.startsWith("#")) continue;
      if (stripped.includes(":")) {
        const idx = stripped.indexOf(":");
        const key = stripped.slice(0, idx).trim();
        const value = stripped.slice(idx + 1).trim();
        if (key && value) headerFields[key] = value;
      }
      continue;
    }

    if (!isTableRow(stripped)) continue;
    if (isTableSeparator(stripped)) continue;

    if (!foundHeader) {
      foundHeader = true;
      headers.push(...parseTableRow(stripped));
      continue;
    }

    rows.push(parseTableRow(stripped));
  }

  return { headerFields, headers, rows };
}
