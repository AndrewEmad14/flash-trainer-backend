/**
 * Trims a string value. Other types pass through untouched so validators still see them.
 * Used in DTO `@Transform`s.
 *
 * @param value - The raw input value.
 * @returns The trimmed string, or the original value if it isn't a string.
 */
export function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Normalises an email for storage and lookup: trimmed and lowercased (FR-002).
 *
 * @param value - The raw input value.
 * @returns The normalised email, or the original value if it isn't a string.
 */
export function normalizeEmail(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
