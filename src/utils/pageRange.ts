/**
 * Parse a human-friendly page range string ("12-15, 22, 30-31") into a sorted,
 * deduped array of 1-indexed page numbers.
 *
 * Throws Error with a human-readable message on bad input or out-of-range pages.
 */
export function parsePageRange(input: string, maxPage: number): number[] {
  const pages = new Set<number>();
  const trimmed = input.trim();
  if (!trimmed) return [];

  for (const part of trimmed.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) {
      throw new Error(`Invalid page reference: "${part}"`);
    }
    const start = parseInt(m[1], 10);
    const end = m[2] ? parseInt(m[2], 10) : start;
    if (start < 1 || end > maxPage) {
      throw new Error(`Page out of range: ${part} (must be 1..${maxPage})`);
    }
    if (start > end) {
      throw new Error(`Reversed range: ${part} (start must be <= end)`);
    }
    for (let i = start; i <= end; i++) {
      pages.add(i);
    }
  }
  return Array.from(pages).sort((a, b) => a - b);
}
