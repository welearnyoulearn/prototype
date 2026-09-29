// Escapes text before it is placed inside an HTML string (emails, print windows).
// React's JSX escapes automatically; anything built as a raw HTML string does not.
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
