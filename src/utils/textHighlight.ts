/**
 * Extract meaningful search terms from a table row's cell values.
 * Skips short/empty values and common filler words.
 */
export function extractSearchTerms(row: string[]): string[] {
  const terms: string[] = [];
  const skipWords = new Set(["n/a", "na", "none", "unknown", "yes", "no", "-", "—", ""]);

  for (const cell of row) {
    const value = cell.trim();
    if (value.length < 3 || skipWords.has(value.toLowerCase())) continue;

    // Split on common separators (commas, semicolons) and add each part
    const parts = value.split(/[;,]/).map((p) => p.trim()).filter((p) => p.length >= 3);
    if (parts.length > 1) {
      terms.push(...parts);
    } else {
      terms.push(value);
    }
  }

  return terms;
}

/**
 * Wrap matching terms in the source text with <mark class="ls-highlight"> tags.
 * Returns an HTML string.
 */
export function highlightText(text: string, terms: string[]): string {
  if (!terms.length) return escapeHtml(text);

  // Escape terms for regex and sort longest-first to avoid partial matches
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);

  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts
    .map((part) => {
      // Reset lastIndex before each test — 'g' flag maintains state across calls
      pattern.lastIndex = 0;
      if (pattern.test(part)) {
        return `<mark class="ls-highlight">${escapeHtml(part)}</mark>`;
      }
      return escapeHtml(part);
    })
    .join("");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
