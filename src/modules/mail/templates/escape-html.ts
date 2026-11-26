const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escapes text for safe insertion into HTML. User-supplied values (names) and URLs must
 * always pass through this before going into email HTML.
 *
 * @param value - Untrusted text.
 * @returns HTML-safe text.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}
