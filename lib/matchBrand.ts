import { brandDictionary } from "./brands";

export interface BrandLabel {
  brand: string;
  confident: boolean;
}

function normalize(str: string): string {
  return str
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/(?![0-9*#])\p{Emoji}\uFE0F?/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// Pre-compile regex patterns at module load
const compiledPatterns: { brand: string; regex: RegExp }[] = [];

for (const [brand, patterns] of Object.entries(brandDictionary)) {
  for (const pattern of patterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (ch) =>
      ch === "*" ? "\0WILD\0" : "\\" + ch
    );
    const regexStr = escaped.replace(/\0WILD\0/g, "[a-z0-9]{0,3}");

    const strippedLen = pattern.replace(/\*/g, "").length;
    const needsBoundary = strippedLen <= 3;
    const finalPattern = needsBoundary
      ? `(?:^|\\s)${regexStr}(?:\\s|$)`
      : regexStr;

    compiledPatterns.push({
      brand,
      regex: new RegExp(finalPattern, "i"),
    });
  }
}

const brandNamesLower = Object.keys(brandDictionary).map((b) => ({
  brand: b,
  lower: b.toLowerCase(),
}));

/**
 * Match a category name to a canonical brand for display purposes.
 * Returns null if no match found (don't show anything).
 * Min 5 chars after cleaning to avoid false positives.
 */
export function matchBrand(categoryName: string): BrandLabel | null {
  const cleaned = normalize(categoryName);

  if (cleaned.length < 5) return null;

  // Pass 1: dictionary pattern matching
  for (const { brand, regex } of compiledPatterns) {
    if (regex.test(cleaned)) {
      return { brand, confident: true };
    }
  }

  // Pass 2: Levenshtein against canonical brand names
  const words = cleaned.split(/\s+/);
  const candidates: string[] = [words.join(" ")];

  for (let windowSize = 1; windowSize <= Math.min(3, words.length); windowSize++) {
    for (let i = 0; i <= words.length - windowSize; i++) {
      candidates.push(words.slice(i, i + windowSize).join(" "));
    }
  }

  let bestMatch = { brand: "", distance: Infinity };

  for (const candidate of candidates) {
    if (candidate.length < 3) continue;

    for (const { brand, lower } of brandNamesLower) {
      const distance = levenshtein(candidate, lower);
      const threshold = Math.min(3, Math.floor(lower.length / 4));
      if (distance <= threshold && distance < bestMatch.distance) {
        bestMatch = { brand, distance };
      }
    }
  }

  if (bestMatch.distance <= 3) {
    return { brand: bestMatch.brand, confident: false };
  }

  return null;
}
