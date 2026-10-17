import { API_BASE_URL } from '@/api/client'

/** Resolves a stored media URL (product/gallery/logo/hero image) to something
 * the browser can load from the current environment.
 *
 * Stored values come in several shapes: absolute (`http://...`, `data:`,
 * `blob:`) are left alone; backend-served paths (`/media/x.jpg`, or
 * `/api/media/x.jpg` when the row was saved in production, where
 * `API_BASE_URL` is `/api`) get the API base prepended unless they already
 * start with it; bare relative paths (`media/x.jpg`) are treated the same.
 * Anything else that starts with `/` (e.g. the frontend's own static
 * `/brand/logo.svg`) is served by this app and returned unchanged. */
export function getMediaUrl(path?: string | null): string {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path

  const normalized = path.startsWith('/') ? path : `/${path}`
  const base = API_BASE_URL.replace(/\/+$/, '')

  if (base && (normalized === base || normalized.startsWith(`${base}/`))) return normalized
  // `/api/media/...` stored by prod, running against a base without `/api` (dev).
  const isBackendPath = /^\/(api\/)?media\//.test(normalized) || !path.startsWith('/')
  return isBackendPath ? `${base}${normalized}` : normalized
}
