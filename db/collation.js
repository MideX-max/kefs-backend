// Mirrors the LOWER(...) comparisons the previous PostgreSQL schema relied on.
// Strength 2 makes string matching case-insensitive (but accent-sensitive).
export const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
