/** A non-cryptographic, unique-enough id for local list keys (React `key`
 * props, form-line identifiers) — never persisted, never sent to the
 * server, so no need for real UUID randomness guarantees.
 *
 * `crypto.randomUUID()` only exists in a secure context (HTTPS, or the
 * `localhost` exemption) — found as a real bug in manual testing: opening
 * the app over plain HTTP from a phone on the local network (e.g.
 * `http://192.168.0.68:5173`) made `crypto.randomUUID` undefined, so every
 * "Agregar" button that used it (payment lines, exchange items/payments,
 * purchase items, promotion items, manual price tags) silently threw and
 * did nothing. */
export function generateLineKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
