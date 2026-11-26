/**
 * Escape a value for safe interpolation into an HTML email or page.
 * Every visitor-supplied string that goes into an HTML template must pass
 * through this, or the site becomes a relay for phishing links sent from
 * the Ambition Angels domain.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
