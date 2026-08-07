/**
 * Sanitize a string into an ASCII-safe filename slug (ALEBET-FACT-02 R5).
 *
 * NFD-normalizes first so that accents and ñ become their base ASCII
 * letters, then lowercases and collapses every non-alphanumeric run into a
 * single dash, trimming leading/trailing dashes. The result is ASCII by
 * construction, which makes it safe for a plain `filename=` Content-
 * Disposition header without RFC 5987 percent-encoding.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents/ñ → base ASCII
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // spaces/./&/<>:"/\|?* → '-'
    .replace(/^-+|-+$/g, '') // trim dashes
}
